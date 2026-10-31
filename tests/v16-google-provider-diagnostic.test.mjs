import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BETA_LOGIN_PAGE} from '../src/v16-online/beta-login-page.mjs';
const script=BETA_LOGIN_PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const start=script.indexOf('async function checkGoogleProvider(apiKey){');
const end=script.indexOf('function providerStatus(result){',start);
assert.ok(start>0&&end>start,'Google provider diagnostic must exist');
const source=script.slice(start,end);
const key='AIza'+('A'.repeat(35));
function context(fetchImpl){
 const sandbox={fetch:fetchImpl,encodeURIComponent,location:{
  origin:'https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev'
 }};
 vm.createContext(sandbox);
 vm.runInContext(source+';globalThis.runDiagnostic=checkGoogleProvider;',sandbox);
 return sandbox.runDiagnostic;
}
const response=(status,data)=>({ok:status===200,status,async json(){return data}});
test('Google provider preflight calls official createAuthUri without user identity',async()=>{
 const calls=[];
 const run=context(async(url,options)=>{calls.push({url,options});return response(200,{
  providerId:'google.com',
  authUri:'https://accounts.google.com/o/oauth2/v2/auth?state=SECRET&code=PRIVATE',
  sessionId:'sensitive-session'
 })});
 const result=await run(key);
 assert.equal(result.ok,true);
 assert.ok(result.note.includes('Provider'));
 assert.equal(result.note.includes('SECRET'),false);
 assert.equal(result.note.includes('session'),false);
 assert.equal(calls.length,1);
 assert.match(calls[0].url,/\/v1\/accounts:createAuthUri\?key=/);
 assert.equal(calls[0].options.referrerPolicy,'strict-origin-when-cross-origin');
 const body=JSON.parse(calls[0].options.body);
 assert.deepEqual(body,{
  providerId:'google.com',
  continueUri:'https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev/beta-login'
 });
 assert.equal(calls[0].options.body.includes('email'),false);
 assert.equal(calls[0].options.body.includes('uid'),false);
});
test('Google provider API error is shown with safe diagnostic code and no secrets',async()=>{
 const run=context(async()=>response(400,{error:{message:'OPERATION_NOT_ALLOWED'}}));
 const result=await run(key);
 assert.equal(result.ok,false);
 assert.match(result.note,/400, OPERATION_NOT_ALLOWED/);
 assert.equal(result.note.includes(key),false);
 const other=context(async()=>response(403,{error:{message:'bad message contains https://secret'}}));
 const fail=await other(key);
 assert.equal(fail.ok,false);
 assert.match(fail.note,/FIREBASE_PROVIDER_CONFIGURATION_ERROR/);
 assert.equal(fail.note.includes('secret'),false);
});
test('Google provider incomplete response cannot be mistaken for proof of readiness',async()=>{
 const run=context(async()=>response(200,{providerId:'google.com',authUri:''}));
 assert.equal((await run(key)).ok,false);
});
test('stale redirect errors only processed after user-initiated attempt',()=>{
 assert.match(script,/const REDIRECT_PENDING_KEY=/);
 assert.match(script,/sessionStorage\.setItem\(REDIRECT_PENDING_KEY,"1"\)/);
 assert.match(script,/sessionStorage\.getItem\(REDIRECT_PENDING_KEY\)==="1"/);
 assert.match(script,/sessionStorage\.removeItem\(REDIRECT_PENDING_KEY\)/);
 assert.match(script,/if\(redirectPending\)\{\s*try\{\s*const result=await getRedirectResult\(auth\)/);
 assert.match(BETA_LOGIN_PAGE,/id="providerState"/);
});
