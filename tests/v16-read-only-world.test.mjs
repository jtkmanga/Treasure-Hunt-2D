import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {V16WorldRoom,handleV16Request} from '../src/v16-online/worker.mjs';
import {BETA_LOGIN_PAGE} from '../src/v16-online/beta-login-page.mjs';

const ROOT='https://treasure-hunt-2d-v16-world-staging.example';
const TOKEN='A'.repeat(130);
function lab(){
 const storage=new Map(),calls=[],changes=[];
 let ready;
 const room=new V16WorldRoom({
  storage:{async get(k){return storage.get(k)},async put(k,v){changes.push(k);storage.set(k,structuredClone(v))}},
  blockConcurrencyWhile(fn){ready=fn();}
 },{});
 const env={
  ENABLE_V16_READS:'true',ENABLE_V16_WRITES:'false',
  ALLOWED_ORIGIN:ROOT,FIREBASE_PROJECT_ID:'treasure-hunt-2d',
  FIREBASE_PROJECT_NUMBER:'439998873632',
  FIREBASE_APP_ID:'1:439998873632:web:4b694f8159d9d9e0163c45',
  V16_BETA_UIDS:'alice',
  ACCOUNT_STATUS:{async fetch(){return Response.json({uid:'alice',disabled:false,revoked:false})}},
  V16_RATE_LIMITER:{async limit({key}){calls.push(key);return {success:true}}},
  ROOMS:{idFromName(s){return s},get(){return room}},
 };
 const testHooks={
  verifyId:async()=>({uid:'alice',provider:'google.com',emailVerified:true,authTime:1760000000}),
  verifyApp:async()=>({appId:env.FIREBASE_APP_ID})
 };
 const req=(path,method='GET',includeTokens=true)=>new Request(ROOT+'/api/v16/'+path,{
  method,headers:includeTokens?{authorization:'Bearer '+TOKEN,'x-firebase-appcheck':'valid-app-check'}:{},
  body:method==='POST'?'{}':undefined
 });
 return {ready:()=>ready,room,storage,calls,changes,env,testHooks,req};
}
test('Invited player can read Free shared world of 200 coins with no score writes',async()=>{
 const t=lab();await t.ready();
 const response=await handleV16Request(t.req('world?scope=free'),t.env,t.testHooks);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.ok,true);
 assert.equal(data.world.scope,'free1');
 assert.equal(data.world.coins.length,200);
 assert.ok(data.world.chest&&Number.isFinite(data.world.chest.x));
 assert.deepEqual(data.world.leaders,[]);
 assert.equal(t.room.room.scores.size,0);
 assert.deepEqual(t.changes,[]);
 assert.deepEqual(t.calls,['world:alice']);
 const unchanged=await handleV16Request(t.req('world?scope=free&since='+data.world.version),t.env,t.testHooks);
 assert.equal(unchanged.status,200);
 assert.equal((await unchanged.json()).unchanged,true);
});
test('World read rejects anonymous, noninvited, invalid App Check and VIP accounts',async()=>{
 const t=lab();await t.ready();
 assert.equal((await handleV16Request(t.req('world?scope=free','GET',false),t.env,t.testHooks)).status,401);
 assert.equal((await handleV16Request(t.req('world?scope=free'),{...t.env,V16_BETA_UIDS:'bob'},t.testHooks)).status,403);
 assert.equal((await handleV16Request(t.req('world?scope=free'),t.env,{
  ...t.testHooks,verifyApp:async()=>{throw Error('Invalid App Check')}
 })).status,401);
 assert.equal((await handleV16Request(t.req('world?scope=vip'),t.env,t.testHooks)).status,403);
 assert.equal(t.room.room,null);
});
test('All score-changing API routes remain disabled even for verified invited users',async()=>{
 const t=lab();await t.ready();
 for(const route of ['join','move','collect']){
  const response=await handleV16Request(t.req(route+'?scope=free','POST'),t.env,t.testHooks);
  assert.equal(response.status,403);
  assert.match((await response.json()).error,/writes not enabled/);
 }
 assert.equal(t.room.room,null);
 assert.equal(t.storage.size,0);
});
test('Mobile world read UI requires completed beta check, uses in-memory tokens and displays safe summary',()=>{
 assert.match(BETA_LOGIN_PAGE,/id="worldRead"[^>]*disabled/);
 assert.match(BETA_LOGIN_PAGE,/id="worldState"/);
 assert.match(BETA_LOGIN_PAGE,/betaVerified=true;el\("worldRead"\)\.disabled=false/);
 assert.match(BETA_LOGIN_PAGE,/if\(!betaVerified\|\|!ready/);
 assert.match(BETA_LOGIN_PAGE,/auth\.currentUser\.getIdToken\(\),getToken\(appCheck\)/);
 assert.match(BETA_LOGIN_PAGE,/api\/v16\/world\?scope=free/);
 assert.match(BETA_LOGIN_PAGE,/world\.coins\.length!==200/);
 assert.match(BETA_LOGIN_PAGE,/เหรียญพร้อมเก็บ:/);
 assert.match(BETA_LOGIN_PAGE,/อ่านข้อมูลอย่างเดียว ไม่มีการเพิ่มคะแนน/);
 const script=BETA_LOGIN_PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new vm.Script(script.replace(/^import\s+.+?;\s*$/gm,'')));
});
