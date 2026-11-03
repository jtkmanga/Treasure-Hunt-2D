import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {ZonePresenceIndex,ZONE_VISIBILITY_CAP,ZONE_IDLE_TTL_MS} from '../src/v16-online/zone-presence.mjs';
import {V16Room} from '../src/v16-online/room.mjs';
import {V16WorldRoom,handleV16Request} from '../src/v16-online/worker.mjs';
import {runZoneBenchmark} from '../scripts/v16-zone-capacity.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const NOW=Date.parse('2026-11-03T10:00:00Z');
const BASE='https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev';
const near=(index,uid,now=NOW)=>index.nearby(uid,now);
function locate(index,uid,x,y,lastAt=NOW){
 return index.upsert(uid,{x,y,lastAt});
}
test('nearby zones include players across boundaries, exclude distant players, and expose no Firebase UID',()=>{
 const z=new ZonePresenceIndex();
 locate(z,'sensitive-viewer',9.8,9.8);
 const id=locate(z,'sensitive-other',10.1,10.2);
 locate(z,'out-of-sight',25,9.8);
 locate(z,'diagonal-visible',15.2,15.2);
 const result=near(z,'sensitive-viewer');
 assert.equal(result.viewerActive,true);
 assert.equal(result.players.length,2);
 assert.equal(result.radius,8);
 assert.equal(result.players[0].id,id);
 assert.ok(result.players.every(p=>p.id.startsWith('avatar_')&&!p.id.includes('sensitive-')));
 assert.ok(result.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert.ok(z.checkInvariants());
 const text=JSON.stringify(result);
 for(const uid of ['sensitive-viewer','sensitive-other','diagonal-visible','out-of-sight'])
  assert.ok(!text.includes(uid),'UID must not be in any publicly serializable response');
});
test('cross-zone movement keeps a single alias and no ghosts in the previous zone',()=>{
 const z=new ZonePresenceIndex();
 locate(z,'viewer-west',6,6);
 locate(z,'viewer-east',26,6);
 const alias=locate(z,'traveller',7,6);
 assert.equal(near(z,'viewer-west').players.length,1);
 assert.equal(near(z,'viewer-east').players.length,0);
 assert.equal(locate(z,'traveller',24,6,NOW+200),alias);
 assert.equal(near(z,'viewer-west',NOW+200).players.length,0);
 assert.equal(near(z,'viewer-east',NOW+200).players.length,1);
 assert.equal(near(z,'viewer-east',NOW+200).players[0].id,alias);
 assert.ok(z.checkInvariants());
 assert.equal(z.delete('traveller'),true);
 assert.equal(z.delete('traveller'),false);
 assert.equal(near(z,'viewer-east',NOW+200).players.length,0);
});
test('bounded TTL removes stale and disconnected players; no presence is persisted',()=>{
 const z=new ZonePresenceIndex();
 locate(z,'viewer',5,5,NOW);
 locate(z,'old',6,5,NOW);
 locate(z,'recent',5,6,NOW+ZONE_IDLE_TTL_MS-1);
 let report=near(z,'viewer',NOW+ZONE_IDLE_TTL_MS-1);
 assert.equal(report.players.length,2);
 report=near(z,'viewer',NOW+ZONE_IDLE_TTL_MS);
 assert.equal(report.viewerActive,false);
 assert.equal(report.players.length,0);
 locate(z,'viewer',5,5,NOW+ZONE_IDLE_TTL_MS+1);
 report=near(z,'viewer',NOW+ZONE_IDLE_TTL_MS+1);
 assert.equal(report.players.length,1);
 assert.ok(z.checkInvariants());
 z.clear();
 assert.equal(z.size,0);assert.equal(z.cells.size,0);
});
test('all 10K actors in one cell return the nearest 24 only; no full-world player payload',()=>{
 const z=new ZonePresenceIndex();
 locate(z,'viewer',50.5,50.5);
 for(let i=0;i<10_000;i++){
  const x=50.01+(i%80)*.01,y=50.01+Math.floor(i/80)*.005;
  locate(z,'private-user-'+i,x,y);
 }
 assert.equal(z.size,10_001);
 const r=near(z,'viewer');
 assert.equal(r.players.length,ZONE_VISIBILITY_CAP);
 assert.equal(new Set(r.players.map(p=>p.id)).size,ZONE_VISIBILITY_CAP);
 assert.ok(z.checkInvariants());
 assert.ok(!JSON.stringify(r).includes('private-user'));
});
test('index rejects untrusted coordinates, excessive range and time rollbacks',()=>{
 const z=new ZonePresenceIndex();
 for(const p of [{x:-1,y:2,lastAt:NOW},{x:100,y:2,lastAt:NOW},
  {x:2,y:2,lastAt:NaN},{x:NaN,y:2,lastAt:NOW}])
  assert.throws(()=>z.upsert('uid',p),/Invalid/);
 locate(z,'uid',50,50);
 assert.throws(()=>locate(z,'uid',50,50,NOW-1),/Stale/);
 for(const options of [{radius:10},{radius:-1},{limit:25},{limit:0}])
  assert.throws(()=>z.nearby('uid',NOW,options),/Invalid/);
});
test('core V16 authoritative join and movement sync presence while coin/Lucky Box remain global',()=>{
 const r=new V16Room('free1',NOW,()=>0);
 r.join('player-A',NOW,'hunter@example.com');
 r.join('player-B',NOW,'HunterB');
 const a=r.nearby('player-A',NOW);
 assert.equal(a.players.length,1);
 assert.equal(a.players[0].name,'HunterB');
 assert.ok(!JSON.stringify(a).includes('player-B'));
 assert.ok(!('presence' in r.save()));
 const global=r.publicView(NOW);
 assert.equal(global.coins.length,200);
 assert.ok(global.chest);
 assert.ok(!('players' in global));
 const p=r.requirePlayer('player-B');
 p.previewNonce='nonce-B';p.previewSeq=0;p.previewCreditMs=100;p.previewBudgetAt=NOW;
 const ack=r.movePreview('player-B',[[100,0]],1,NOW+50,'nonce-B');
 assert.ok(Number.isFinite(ack.x));
 assert.ok(r.presence.checkInvariants());
 r.rebuildPresence();
 assert.ok(r.presence.checkInvariants());
 assert.equal(r.nearby('player-A',NOW+50).players.length,1);
 const restarted=V16Room.restore(r.save(),NOW+50,()=>0);
 assert.equal(restarted.presence.size,0,'ephemeral player whereabouts do not survive a DO restart');
 assert.deepEqual(restarted.publicView(NOW+50).leaders,r.publicView(NOW+50).leaders);
});
function testRig(){
 const instances=new Map(),state=new Map();
 const env={ENABLE_V16_GAME_PREVIEW:'true',ENABLE_V16_READS:'true',ENABLE_V16_WRITES:'false',
  ALLOWED_ORIGIN:BASE,FIREBASE_PROJECT_ID:'test-project',
  FIREBASE_PROJECT_NUMBER:'123',FIREBASE_APP_ID:'test-app',
  V16_BETA_UIDS:'alice,bob',
  ACCOUNT_STATUS:{async fetch(_,request){
   const {uid}=JSON.parse(request.body);
   return Response.json({uid,disabled:false,revoked:false});
  }},
  V16_RATE_LIMITER:{async limit(){return {success:true}}},
  ROOMS:{idFromName(name){return name},get(name){
   if(!instances.has(name)){
    const storage={
     async get(key){return state.get(name+'-'+key)},
     async put(key,value){state.set(name+'-'+key,structuredClone(value))}
    };
    instances.set(name,new V16WorldRoom({storage,blockConcurrencyWhile(fn){void fn()}},{}));
   }
   return instances.get(name);
  }}
 };
 const testing={
  verifyId:async token=>({uid:token.startsWith('A')?'alice':'bob',
   provider:'google.com',emailVerified:true,authTime:1760000000}),
  verifyApp:async()=>({appId:env.FIREBASE_APP_ID})
 };
 async function call(actor,route,body=null,extra=''){
  const req=new Request(BASE+'/api/v16/'+route+'?scope=free'+extra,{
   method:body===null?'GET':'POST',
   headers:{origin:BASE,authorization:'Bearer '+actor.repeat(130),
    'x-firebase-appcheck':'present',...(body===null?{}:{'content-type':'application/json'})},
   ...(body===null?{}:{body:JSON.stringify(body)})
  });
  const res=await handleV16Request(req,env,testing);
  return {status:res.status,body:await res.json()};
 }
 return {env,instances,call};
}
test('preview-nearby requires verified Google/App Check and join, and is isolated from public Free state',async()=>{
 const t=testRig();
 const noAuth=await handleV16Request(new Request(BASE+'/api/v16/preview/nearby?scope=free'),t.env);
 assert.equal(noAuth.status,401);
 const unjoined=await t.call('A','preview/nearby');
 assert.equal(unjoined.status,409);
 const a=await t.call('A','preview/join',{name:'HunterA'});
 const b=await t.call('B','preview/join',{name:'HunterB'});
 assert.equal(a.status,200);assert.equal(b.status,200);
 const list=await t.call('A','preview/nearby',null,'&x=90&y=90&radius=9999');
 assert.equal(list.status,200);
 assert.equal(list.body.nearby.players.length,1);
 assert.equal(list.body.nearby.players[0].name,'HunterB');
 const json=JSON.stringify(list.body);
 assert.ok(!json.includes('"alice"')&&!json.includes('"bob"')&&!json.includes('firebase'));
 assert.ok(!('score' in list.body.nearby.players[0]));
 const actualWorld=await t.call('B','preview/world');
 assert.equal(actualWorld.status,200);
 assert.equal(actualWorld.body.world.coins.length,200);
 assert.ok(!('players' in actualWorld.body.world));
 const crossScope=await handleV16Request(new Request(BASE+'/api/v16/preview/nearby?scope=vip'),t.env);
 assert.equal(crossScope.status,403);
 const unknown=await handleV16Request(new Request(BASE+'/api/v16/nearby?scope=free'),t.env);
 assert.equal(unknown.status,404);
 const stored=JSON.stringify(t.instances.get('free1-forest-game-preview-v1').room.save());
 assert.ok(!stored.includes('avatar_'),'aliases are never stored in canonical score state');
});

test('offline zone benchmark checks 100 and 1000 updates without faking Cloudflare scale',()=>{
 for(const n of [100,1000]){
  const r=runZoneBenchmark({players:n,queries:60});
  assert.equal(r.actors,n);
  assert.equal(r.networkRequests,0);
  assert.equal(r.verifiedRealConcurrentPlayers,0);
  assert.equal(r.productionReadyConclusion,false);
  assert.equal(r.queries,60);
  assert.ok(r.crossZoneMigrations>0);
  assert.ok(r.maxReturnedPlayers<=ZONE_VISIBILITY_CAP);
  assert.ok(r.queryLatencyMs.p99>=r.queryLatencyMs.p50);
 }
});
