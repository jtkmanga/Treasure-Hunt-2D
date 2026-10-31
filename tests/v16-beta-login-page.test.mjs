import test from 'node:test';
import assert from 'node:assert/strict';
import {handleV16Request} from '../src/v16-online/worker.mjs';
const BASE='https://treasure-hunt-2d-v16-world-staging.example';
const id='A'.repeat(120);
function harness(overrides={},claims={}){
 let roomCalls=0,limits=[];
 const env={
  ENABLE_V16_READS:'false',ENABLE_V16_WRITES:'false',
  FIREBASE_PROJECT_ID:'treasure-hunt-2d',FIREBASE_PROJECT_NUMBER:'439998873632',
  FIREBASE_APP_ID:'1:439998873632:web:4b694f8159d9d9e0163c45',
  FIREBASE_WEB_API_KEY:'AIzaExampleFakeKey1234567890123456789',
  ALLOWED_ORIGIN:BASE,
  V16_BETA_UIDS:'alice',
  V16_RATE_LIMITER:{async limit({key}){limits.push(key);return {success:true}}},
  ACCOUNT_STATUS:{async fetch(){return Response.json({uid:'alice',disabled:false,revoked:false})}},
  ROOMS:{idFromName(){roomCalls++;throw Error('DO must never be accessed')}},
  ...overrides,
 };
 const testing={
  verifyId:async()=>({uid:'alice',provider:'google.com',emailVerified:true,authTime:1760000000,...claims}),
  verifyApp:async()=>({appId:env.FIREBASE_APP_ID}),
 };
 const request=(path='/api/v16/auth-check?scope=free',headers={},method='GET')=>
  new Request(BASE+path,{method,headers:{authorization:'Bearer '+id,
   'x-firebase-appcheck':'appcheck-token','origin':BASE,...headers}});
 return {env,testing,request,limits,getRoomCalls:()=>roomCalls};
}
test('mobile beta page serves HTML without any Firebase API or UID secrets',async()=>{
 const h=harness();
 const result=await handleV16Request(h.request('/beta-login',{},'GET'),h.env,h.testing);
 assert.equal(result.status,200);
 const html=await result.text();
 assert.match(result.headers.get('content-type'),/text\/html/);
 assert.equal(result.headers.get('x-frame-options'),'DENY');
 for(const x of ['Firebase Web API Key','reCAPTCHA Enterprise Site Key',
  'signInWithPopup','getToken(appCheck)','/api/v16/auth-check','www.gstatic.com'])assert.ok(html.includes(x),x);
 for(const x of ['AIzaExampleFakeKey','V16_BETA_UIDS','Bearer AAAAA',
  'firebase-web-api-key-secret'])assert.equal(html.includes(x),false,x);
 assert.equal(h.getRoomCalls(),0);
 assert.equal(h.limits.length,0);
});
test('verified invited Google + App Check pass authentication even while world is closed',async()=>{
 const h=harness();
 const res=await handleV16Request(h.request(),h.env,h.testing);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{
  ok:true,googleVerified:true,appCheckVerified:true,accountActive:true,
  betaInvited:true,scope:'free',writesEnabled:false,
 });
 assert.deepEqual(h.limits,['auth:alice']);
 assert.equal(h.getRoomCalls(),0);
});
test('anonymous, missing App Check, uninvited, revoked and invalid Google provider fail',async()=>{
 const h=harness();
 const anonymous=await handleV16Request(h.request(undefined,{authorization:''}),h.env,h.testing);
 assert.equal(anonymous.status,401);
 const denied=await handleV16Request(h.request(),{
  ...h.env,V16_BETA_UIDS:'someone_else'},h.testing);
 assert.equal(denied.status,403);
 const revoked=await handleV16Request(h.request(),{
  ...h.env,ACCOUNT_STATUS:{async fetch(){return Response.json({uid:'alice',disabled:false,revoked:true})}}},h.testing);
 assert.equal(revoked.status,403);
 const nonGoogle=await handleV16Request(h.request(),h.env,{
  ...h.testing,verifyId:async()=>({uid:'alice',provider:'password',emailVerified:true})});
 assert.equal(nonGoogle.status,403);
 const noApp=await handleV16Request(h.request(),h.env,{
  ...h.testing,verifyApp:async()=>{throw Error('Invalid App Check')}});
 assert.equal(noApp.status,401);
 const rateLimited=await handleV16Request(h.request(),{
  ...h.env,V16_RATE_LIMITER:{async limit(){return {success:false}}}},h.testing);
 assert.equal(rateLimited.status,429);
 assert.equal(h.getRoomCalls(),0);
});
test('beta auth probe rejects VIP, CORS, bad methods and has no write side effects',async()=>{
 const h=harness();
 assert.equal((await handleV16Request(h.request('/api/v16/auth-check?scope=vip'),h.env,h.testing)).status,403);
 assert.equal((await handleV16Request(h.request('/api/v16/auth-check',{},'POST'),h.env,h.testing)).status,405);
 assert.equal((await handleV16Request(h.request('/api/v16/auth-check',{origin:'https://evil.test'}),h.env,h.testing)).status,403);
 assert.equal((await handleV16Request(h.request('/api/v16/join?scope=free',{},'POST'),h.env,h.testing)).status,403);
 assert.equal((await handleV16Request(h.request('/api/v16/world?scope=free'),h.env,h.testing)).status,403);
 assert.equal(h.getRoomCalls(),0);
});
