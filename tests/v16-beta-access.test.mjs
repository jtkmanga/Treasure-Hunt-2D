import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeClosedBeta,configuredBetaUids} from '../src/v16-online/beta-access.mjs';
import {handleV16Request,V16WorldRoom} from '../src/v16-online/worker.mjs';

test('beta invitations accept only 1–10 unique valid Firebase UIDs',()=>{
 assert.equal(configuredBetaUids(undefined),null);
 assert.equal(configuredBetaUids(''),null);
 assert.equal(configuredBetaUids('*'),null);
 assert.equal(configuredBetaUids('alice,alice'),null);
 assert.equal(configuredBetaUids('alice,,bob'),null);
 assert.equal(configuredBetaUids(Array.from({length:11},(_,i)=>'player'+i).join(',')),null);
 assert.equal(configuredBetaUids('alice\nbob'),null);
 assert.deepEqual([...configuredBetaUids('alice, bob')],['alice','bob']);
});
test('beta access requires cryptographically verified Google provider and exact UID invitation',()=>{
 const env={V16_BETA_UIDS:'alice,bob'};
 const verified={uid:'alice',provider:'google.com',emailVerified:true};
 assert.equal(authorizeClosedBeta(verified,env).allowed,true);
 assert.equal(authorizeClosedBeta({...verified,uid:'other'},env).allowed,false);
 assert.equal(authorizeClosedBeta({...verified,provider:'password'},env).allowed,false);
 assert.equal(authorizeClosedBeta({...verified,emailVerified:false},env).allowed,false);
 assert.equal(authorizeClosedBeta(verified,{}).allowed,false);
 assert.equal(authorizeClosedBeta(verified,{V16_BETA_UIDS:'*'}).allowed,false);
});
const ID_TOKEN='A'.repeat(112);
function testingEnv({allowlist='alice',rate=true}={}){
 let ready;
 const saved=new Map();
 const room=new V16WorldRoom({storage:{
  async get(k){return saved.get(k);},async put(k,v){saved.set(k,structuredClone(v))}
 },blockConcurrencyWhile(fn){ready=fn();}},{});
 const calls=[];
 const env={
  ALLOWED_ORIGIN:'https://preview.test',ENABLE_V16_READS:'true',ENABLE_V16_WRITES:'true',
  V16_BETA_UIDS:allowlist,FIREBASE_PROJECT_ID:'project-id',
  FIREBASE_PROJECT_NUMBER:'123456789',FIREBASE_APP_ID:'1:123456789:web:beta',
  ACCOUNT_STATUS:{async fetch(_url,opts){const body=JSON.parse(opts.body);return Response.json({
   uid:body.uid,disabled:false,revoked:false
  });}},
  V16_RATE_LIMITER:{async limit(params){calls.push(params.key);return {success:rate}}},
  ROOMS:{idFromName:s=>s,get:()=>room},
 };
 const opts={verifyId:async()=>({uid:'alice',provider:'google.com',emailVerified:true}),
  verifyApp:async()=>({appId:env.FIREBASE_APP_ID})};
 function request(path,method='GET',body){
  return new Request('https://preview.test/api/v16/'+path,{
   method,headers:{authorization:'Bearer '+ID_TOKEN,'x-firebase-appcheck':'appcheck',
    ...(method==='POST'?{'content-type':'application/json'}:{})},
   body:method==='POST'?JSON.stringify(body||{}):undefined});
 }
 return {env,room,calls,ready:()=>ready,opts,request};
}
test('closed beta rejects nonmembers before reaching world room',async()=>{
 const lab=testingEnv({allowlist:'someone-else'});await lab.ready();
 const response=await handleV16Request(lab.request('world?scope=free'),lab.env,lab.opts);
 assert.equal(response.status,403);
 assert.match(await response.text(),/invitation/);
 assert.equal(lab.room.room,null);
 assert.equal(lab.calls.length,0);
});
test('invited users are rate limited on both reads and writes',async()=>{
 const lab=testingEnv({rate:false});await lab.ready();
 const read=await handleV16Request(lab.request('world?scope=free'),lab.env,lab.opts);
 const write=await handleV16Request(lab.request('join?scope=free','POST',{name:'Alice'}),lab.env,lab.opts);
 assert.equal(read.status,429);
 assert.equal(write.status,429);
 assert.deepEqual(lab.calls,['world:alice','write:alice']);
 assert.equal(lab.room.room,null);
});
test('invalid beta list fails closed on write as well as world reads',async()=>{
 const lab=testingEnv({allowlist:''});await lab.ready();
 for(const [path,method] of [['world?scope=free','GET'],['join?scope=free','POST']]){
  const response=await handleV16Request(lab.request(path,method),lab.env,lab.opts);
  assert.equal(response.status,403);
 }
 assert.equal(lab.room.room,null);
});
