import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,generateKeyPairSync,createSign} from 'node:crypto';
import {handleV16Request,V16WorldRoom} from '../src/v16-online/worker.mjs';
import {verifyAppCheck} from '../src/v16-online/appcheck.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base='https://game.test/api/v16/';
function request(path,opts={}){return new Request(base+path,opts)}
function settings(flag='false'){return {ENABLE_V16_WRITES:flag,ENABLE_V16_READS:'true',ALLOWED_ORIGIN:'https://game.test'}}
test('Online write routes fail closed by default',async()=>{
 const r=await handleV16Request(request('collect?scope=free',{method:'POST',body:'{}'}),settings());
 assert.equal(r.status,403);assert.match(await r.text(),/not enabled/);
 const blocked=await handleV16Request(request('world',{headers:{origin:'https://attacker.test'}}),settings());
 assert.equal(blocked.status,403);
});
test('Auth, App Check, user status and rate limiter must all exist',async()=>{
 const r=await handleV16Request(request('join',{method:'POST',body:'{}'}),{...settings('true'),ROOMS:{get(){},idFromName(){}}});
 assert.equal(r.status,503);
});
test('Authenticated worker forwards verified UID only, not user supplied uid',async()=>{
 const storage=new Map();const obj=new V16WorldRoom({storage:{async get(k){return storage.get(k)},async put(k,v){storage.set(k,v)}},blockConcurrencyWhile:p=>p},{});
 // Cloudflare's constructor blockConcurrencyWhile is awaited before fetch in production.
 const env={...settings('true'),FIREBASE_PROJECT_ID:'project-test',FIREBASE_PROJECT_NUMBER:'1234567890',FIREBASE_APP_ID:'1:1234567890:web:demo',
  ACCOUNT_STATUS:{async fetch(){return new Response(JSON.stringify({uid:'good-uid',disabled:false,revoked:false}),{headers:{'content-type':'application/json'}})}},
  V16_RATE_LIMITER:{async limit(){return {success:true}}},
  ROOMS:{idFromName:s=>s,get:()=>obj}};
 const opts={verifyId:async()=>({uid:'good-uid'}),verifyApp:async()=>({appId:'ok'})};
 const post=(action,body)=>handleV16Request(request(action,{method:'POST',headers:{authorization:'Bearer '+('A'.repeat(110)),'x-firebase-appcheck':'demo','content-type':'application/json'},body:JSON.stringify(body)}),env,opts);
 const joined=await post('join?scope=free',{uid:'bad-uid',name:'Player'});
 assert.equal(joined.status,200);
 const body=await joined.json();assert.equal(body.result.uid,'good-uid');
 const view=await handleV16Request(request('world?scope=free',{headers:{authorization:'Bearer '+('A'.repeat(110)),'x-firebase-appcheck':'demo'}}),env,opts);
 assert.equal(view.status,200);assert.equal((await view.json()).world.coins.length,200);
 const vip=await post('join?scope=vip',{});assert.equal(vip.status,403);
 const noAuth=await handleV16Request(request('world?scope=free'),env,opts);
 assert.equal(noAuth.status,401);
 const vipWorld=await handleV16Request(request('world?scope=vip',{headers:{authorization:'Bearer '+('A'.repeat(110)),'x-firebase-appcheck':'demo'}}),env,opts);
 assert.equal(vipWorld.status,403);
});
test('App Check rejects missing, invalid token and false signature',async()=>{
 await assert.rejects(()=>verifyAppCheck('',1234567890,'app'));
 await assert.rejects(()=>verifyAppCheck('x.y.z',1234567890,'app'));
});
