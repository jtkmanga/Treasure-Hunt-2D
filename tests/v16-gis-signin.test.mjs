import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { BETA_LOGIN_PAGE } from '../src/v16-online/beta-login-page.mjs';
import { handleV16Request } from '../src/v16-online/worker.mjs';

const js=BETA_LOGIN_PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(js,'The browser login module must exist');
const oauthClient='123456789-abcDEFghijk.apps.googleusercontent.com';
const publicKey='AIza'+('A'.repeat(35));

function providerMock(reply){
 const i=js.indexOf('async function checkGoogleProvider(apiKey){');
 const j=js.indexOf('function providerStatus(result){',i);
 assert.ok(i>=0&&j>i,'Provider function must exist');
 const ctx={
  fetch:async(url,options)=>{
   assert.match(url,/^https:\/\/identitytoolkit.googleapis.com\/v1\/accounts:createAuthUri\?key=/);
   assert.equal(options.method,'POST');
   assert.deepEqual(JSON.parse(options.body),{providerId:'google.com',continueUri:'https://staging.example/beta-login'});
   return {ok:true,async json(){return reply}};
  },
  location:{origin:'https://staging.example'},
  URL,encodeURIComponent
 };
 vm.createContext(ctx);
 vm.runInContext(js.slice(i,j)+';globalThis.testProvider=checkGoogleProvider;',ctx);
 return ctx.testProvider(publicKey);
}

test('extract Google OAuth client ID from official Auth URI, not from page guesses',async()=>{
 const result=await providerMock({
  providerId:'google.com',
  authUri:'https://accounts.google.com/o/oauth2/v2/auth?client_id='+oauthClient+'&state=secret-state',
  sessionId:'secret-session',
 });
 assert.equal(result.ok,true);
 assert.equal(result.clientId,oauthClient);
 assert.equal(result.note.includes('secret-session'),false);
 assert.equal(result.note.includes('secret-state'),false);
});
test('never trust authUri hosted outside accounts.google.com',async()=>{
 const r=await providerMock({
  providerId:'google.com',
  authUri:'https://evil.example/auth?client_id='+oauthClient,
 });
 assert.equal(r.ok,true);
 assert.equal(r.clientId,'');
 const malformed=await providerMock({
  providerId:'google.com',
  authUri:'https://accounts.google.com/o/oauth2/v2/auth?client_id=bad-client',
 });
 assert.equal(malformed.clientId,'');
});
test('Google Identity Services button exchanges only in-memory credential through Firebase',()=>{
 assert.ok(BETA_LOGIN_PAGE.includes('id="gisButton"'));
 assert.ok(BETA_LOGIN_PAGE.includes('id="gisHint"'));
 assert.ok(BETA_LOGIN_PAGE.includes('id="googleClientId"'));
 assert.ok(js.includes('https://accounts.google.com/gsi/client'));
 assert.ok(js.includes('globalThis.google.accounts.id.initialize'));
 assert.ok(js.includes('globalThis.google.accounts.id.renderButton'));
 assert.ok(js.includes('signInWithCredential(auth,GoogleAuthProvider.credential(response.credential))'));
 assert.ok(!js.includes('sessionStorage.setItem("google'));
 assert.ok(!js.includes('localStorage.setItem'));
 assert.ok(js.includes('gisClientId===clientId'));
 const withoutImports=js.replace(/^import\s+.+?;\s*$/gm,'');
 assert.doesNotThrow(()=>new vm.Script(withoutImports));
});
test('only V16 diagnostic route authorizes official GIS script; world flags stay off',async()=>{
 const r=await handleV16Request(new Request('https://preview.test/beta-login'),{
  ENABLE_V16_READS:'false',ENABLE_V16_WRITES:'false'
 });
 assert.equal(r.status,200);
 const policy=r.headers.get('content-security-policy');
 assert.match(policy,/script-src[^;]*https:\/\/accounts\.google\.com/);
 assert.match(policy,/style-src[^;]*https:\/\/accounts\.google\.com/);
 assert.equal(r.headers.get('x-frame-options'),'DENY');
 const world=await handleV16Request(new Request('https://preview.test/api/v16/world'),{
  ENABLE_V16_READS:'false',ENABLE_V16_WRITES:'false'
 });
 assert.equal(world.status,403);
});
