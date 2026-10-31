import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BETA_LOGIN_PAGE} from '../src/v16-online/beta-login-page.mjs';
import {handleV16Request} from '../src/v16-online/worker.mjs';

function helper(customFetch,hostname='treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev'){
 const js=BETA_LOGIN_PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
 const text=js.slice(js.indexOf('async function checkFirebaseProject(apiKey){'),
  js.indexOf('async function setupFirebase(apiKey,siteKey){'));
 assert.ok(text.startsWith('async function checkFirebaseProject'));
 const ctx={fetch:customFetch,location:{hostname},encodeURIComponent,Error};
 vm.createContext(ctx);vm.runInContext(text+'; globalThis.check=checkFirebaseProject;',ctx);
 return ctx.check;
}
const ok=(body,status=200)=>({ok:status===200,status,async json(){return body}});
const k='AIza'+('A'.repeat(35));
test('Firebase project preflight checks key and allowed staging hostname without asking for an email',async()=>{
 const calls=[];
 const check=helper(async (url,options)=>{
  calls.push({url,options});
  return ok({projectId:'treasure-hunt-2d',authorizedDomains:[
   'treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev'
  ]});
 });
 const result=await check(k);
 assert.equal(result.confirmed,true);
 assert.match(result.note,/Identity Toolkit/);
 assert.equal(calls.length,1);
 assert.match(calls[0].url,/identitytoolkit\.googleapis\.com\/v1\/projects\?key=/);
 assert.equal(calls[0].options.referrerPolicy,'strict-origin-when-cross-origin');
 assert.equal(calls[0].options.cache,'no-store');
});
test('wrong, absent project IDs and missing domain are warnings, not false-positive hard blocks',async()=>{
 const mismatched=helper(async()=>ok({projectId:'another-project'}));
 const notMatching=await mismatched(k);
 assert.equal(notMatching.confirmed,false);
 assert.match(notMatching.note,/another-project/);
 const missing=helper(async()=>ok({projectId:'treasure-hunt-2d',authorizedDomains:['localhost']}));
 const missingDomain=await missing(k);
 assert.equal(missingDomain.confirmed,false);
 assert.match(missingDomain.note,/authorizedDomains/);
 const omitted=helper(async()=>ok({authorizedDomains:['treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev']}));
 const noProjectId=await omitted(k);
 assert.equal(noProjectId.confirmed,false);
 assert.match(noProjectId.note,/ไม่ส่ง projectId/);
 const entirelyEmpty=helper(async()=>ok({}));
 assert.equal((await entirelyEmpty(k)).confirmed,false);
 const blocked=helper(async()=>ok({error:{message:'API_KEY_HTTP_REFERRER_BLOCKED'}},403));
 await assert.rejects(()=>blocked(k),/API_KEY_HTTP_REFERRER_BLOCKED/);
});
test('V16 beta login sends origin-only referrer to Firebase API restrictions while protecting iframe embedding',async()=>{
 const res=await handleV16Request(new Request('https://staging.example/beta-login'),{
  ALLOWED_ORIGIN:'https://treasure-hunt-2d-jtk.pages.dev',
  ENABLE_V16_READS:'false',ENABLE_V16_WRITES:'false',
 });
 assert.equal(res.status,200);
 assert.equal(res.headers.get('referrer-policy'),'strict-origin-when-cross-origin');
 assert.equal(res.headers.get('x-frame-options'),'DENY');
 assert.equal(res.headers.get('cross-origin-opener-policy'),null);
 assert.equal((await res.text()).includes('checkFirebaseProject(apiKey)'),true);
});
