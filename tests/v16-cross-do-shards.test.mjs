import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {V16PresenceZone,V16ZoneRouter,zoneName,zoneNamesAround}
 from '../src/v16-online/zone-shards.mjs';
import {V16Room} from '../src/v16-online/room.mjs';
import {V16WorldRoom,handleV16Request} from '../src/v16-online/worker.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const BASE='https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev';
const T=Date.now()-2000;
function zones(){
 const instances=new Map(),requests=[];
 let failRemove=null,failedOnce=false;
 const slowZones=new Map();
 const namespace={
  idFromName(name){return name},
  get(name){
   if(!instances.has(name)){
    const obj=new V16PresenceZone({id:{name}},{});instances.set(name,obj);
   }
   return {async fetch(req){
    const path=new URL(req.url).pathname;
    requests.push({name,path});
    if(path==='/zone/remove'&&name===failRemove&&!failedOnce){
     failedOnce=true;throw Error('Injected old-zone outage');
    }
    const pause=slowZones.get(name)||0;
    if(pause)await new Promise(resolve=>setTimeout(resolve,pause));
    return instances.get(name).fetch(req);
   }};
  }
 };
 return {namespace,instances,requests,slowZone(name,delayMs){
  if(delayMs)slowZones.set(name,delayMs);else slowZones.delete(name);
 },failOldRemoval(name){
  failRemove=name;failedOnce=false;
 },get oldRemovalFailed(){return failedOnce}};
}
function roomWithActors(actors){
 const room=new V16Room('free1',T,()=>0);
 for(const [uid,x,y,label] of actors){
  room.join(uid,T,label||uid);
  const p=room.requirePlayer(uid);
  Object.assign(p,{x,y,lastAt:T,previewNonce:'nonce-'+uid,previewSeq:1});
 }
 return room;
}
function cross(room,uid,x,y,at=T+250){
 const p=room.requirePlayer(uid);
 Object.assign(p,{x,y,lastAt:at,previewSeq:p.previewSeq+1});
}
test('separate Durable Object name is deterministically derived from authoritative coordinates',()=>{
 assert.equal(zoneName(0,0),'v16-preview-zone-v1-x0y0');
 assert.equal(zoneName(9.99,10),'v16-preview-zone-v1-x0y1');
 assert.equal(zoneName(99.99,99.99),'v16-preview-zone-v1-x9y9');
 assert.ok(zoneNamesAround(9.99,10).includes('v16-preview-zone-v1-x1y0'));
 for(const coords of [[-1,0],[100,0],[4,NaN],[Infinity,5]])
  assert.throws(()=>zoneName(...coords),/Invalid/);
 assert.ok(zoneNamesAround(50,50).length<=9);
});
test('zone DO fails closed to direct public requests, wrong destination and old replay',async()=>{
 const name=zoneName(4,4),shard=new V16PresenceZone({id:{name}},{});
 const payload={uid:'private-alice',x:4,y:4,at:T,seq:1,
  epoch:'nonce-alice',alias:'avatar_'+crypto.randomUUID()};
 const internal=(action,body,headers={'x-v16-zone-internal':'1','content-type':'application/json'})=>
  new Request('https://zone-internal/zone/'+action,{method:'POST',
   headers,body:JSON.stringify(body)});
 assert.equal((await shard.fetch(internal('upsert',payload,{'content-type':'application/json'}))).status,403);
 assert.equal((await shard.fetch(internal('upsert',{...payload,x:90}))).status,403);
 assert.equal((await shard.fetch(internal('upsert',payload))).status,200);
 const stale=await shard.fetch(internal('upsert',{...payload,x:5,seq:0,at:T-100}));
 assert.equal((await stale.json()).ignoredStale,true);
 assert.equal((await shard.fetch(internal('remove',{...payload,seq:2,at:T+100}))).status,200);
 const old=await shard.fetch(internal('upsert',payload));
 assert.equal((await old.json()).ignoredStale,true);
 const viewer=await shard.fetch(internal('nearby',{x:4,y:4}));
 assert.deepEqual((await viewer.json()).records,[],'a tombstone prevents ghost resurrection');
 assert.equal((await shard.fetch(internal('nearby',{x:99,y:99}))).status,403);
 const foreign=new V16PresenceZone({id:{name:'live-free-world'}},{});
 assert.equal((await foreign.fetch(internal('upsert',payload))).status,403);
});
test('authoritative router projects positions into distinct zone DOs without exposing UIDs',async()=>{
 const lab=zones(),room=roomWithActors([
  ['viewer',9.5,9.5,'Viewer'],['alice',9.6,9.6,'alice@example.com'],
  ['bob',11.2,10.8,'HunterB'],['far',70,70,'Far']
 ]);
 const router=new V16ZoneRouter(lab.namespace);
 for(const uid of room.players.keys())await router.sync(room,uid);
 assert.ok(lab.instances.size>=3,'multiple distinct named DOs created');
 assert.ok(lab.requests.every(r=>r.name.startsWith('v16-preview-zone-v1-x')));
 const nearby=await router.nearby(room,'viewer',T+1000);
 assert.equal(nearby.viewerActive,true);
 assert.equal(nearby.players.length,2);
 assert.equal(nearby.players.find(x=>x.name==='Hunter').name,'Hunter');
 assert.ok(nearby.players.every(x=>x.id.startsWith('avatar_')));
 const publicResult=JSON.stringify(nearby);
 assert.ok(!publicResult.includes('"uid":'),'Firebase UID field is not serializable');
 for(const uid of ['viewer','alice','bob','far'])
  assert.ok(!nearby.players.some(p=>p.id===uid),
   'opaque avatar identifiers may not equal a Firebase UID');
 assert.equal(nearby.players.find(p=>p.name==='Hunter').id.startsWith('avatar_'),true);
 assert.equal(room.publicView(T+1000).coins.length,200);
 assert.ok(room.publicView(T+1000).chest);
 assert.equal(room.scores.get('alice'),0);
 assert.ok(!('zoneRouter' in room.save()),'persisted state is unchanged');
});
test('crossing a zone migrates once; duplicate sync and stale packets cannot resurrect ghosts',async()=>{
 const lab=zones(),room=roomWithActors([
  ['viewer',9.8,8,'Viewer'],['traveller',9.9,8,'Traveller'],
  ['east',11.5,8,'East']
 ]);
 const router=new V16ZoneRouter(lab.namespace);
 for(const uid of room.players.keys())await router.sync(room,uid);
 const first=await router.nearby(room,'viewer',T+100);
 const original=first.players.find(p=>p.name==='Traveller')?.id;
 assert.ok(original);
 const oldZone=zoneName(9.9,8);
 cross(room,'traveller',10.2,8);
 lab.failOldRemoval(oldZone);
 await assert.rejects(()=>router.sync(room,'traveller'),/Zone shard transport failure/);
 const unconfirmed=await router.nearby(room,'viewer',T+1000);
 assert.ok(!unconfirmed.players.some(p=>p.name==='Traveller'),
  'coordinator must not show an unconfirmed stale projection');
 const retried=await router.sync(room,'traveller');
 assert.equal(retried.transferred,true);
 const after=await router.nearby(room,'viewer',T+1000);
 assert.equal(after.players.filter(x=>x.name==='Traveller').length,1);
 assert.equal(after.players.find(x=>x.name==='Traveller').id,original);
 const again=await router.sync(room,'traveller');
 assert.equal(again.transferred,false);
 const consistent=await router.nearby(room,'viewer',T+1000);
 assert.equal(consistent.players.filter(p=>p.name==='Traveller').length,1);
 assert.equal(room.scores.get('traveller'),0);
});
test('sharded view filters old session, stale locations, unmatched aliases and inactive players',async()=>{
 const lab=zones(),room=roomWithActors([
  ['viewer',51,51,'Viewer'],['peer',51.2,51.2,'Peer']
 ]);
 const router=new V16ZoneRouter(lab.namespace);
 await router.sync(room,'viewer');await router.sync(room,'peer');
 assert.equal((await router.nearby(room,'viewer',T+100)).players.length,1);
 cross(room,'peer',51.3,51.2);
 assert.equal((await router.nearby(room,'viewer',T+350)).players.length,0,
  'movement not yet projected is filtered against canonical sequence');
 await router.sync(room,'peer');
 assert.equal((await router.nearby(room,'viewer',T+350)).players.length,1);
 const p=room.requirePlayer('peer');
 p.previewNonce='new-session-uuid';p.previewSeq=0;p.lastAt=T+500;
 assert.equal((await router.nearby(room,'viewer',T+600)).players.length,0);
 await router.sync(room,'peer');
 assert.equal((await router.nearby(room,'viewer',T+600)).players.length,1);
 assert.equal((await router.nearby(room,'viewer',T+90_000+10)).viewerActive,false);
});
function apiRig(){
 const states=new Map(),worlds=new Map(),lab=zones();
 const env={ENABLE_V16_ZONE_SHARDS:'true',ENABLE_V16_GAME_PREVIEW:'true',
  ENABLE_V16_READS:'true',ENABLE_V16_WRITES:'false',
  ALLOWED_ORIGIN:BASE,FIREBASE_PROJECT_ID:'test-project',
  FIREBASE_PROJECT_NUMBER:'123',FIREBASE_APP_ID:'test-app',
  V16_BETA_UIDS:'alice,bob',
  ACCOUNT_STATUS:{async fetch(_,req){
   const {uid}=JSON.parse(req.body);
   return Response.json({uid,disabled:false,revoked:false});
  }},V16_RATE_LIMITER:{async limit(){return {success:true}}},
  ZONE_ROOMS:lab.namespace,
  ROOMS:{idFromName(name){return name},get(name){
   if(!worlds.has(name)){
    const storage={async get(k){return states.get(name+':'+k)},
     async put(k,v){states.set(name+':'+k,structuredClone(v))}};
    const obj=new V16WorldRoom({storage,blockConcurrencyWhile(fn){void fn()}},env);
    worlds.set(name,obj);
   }
   return worlds.get(name);
  }}
 };
 const testing={
  verifyId:async bearer=>({uid:bearer.startsWith('A')?'alice':'bob',
   provider:'google.com',emailVerified:true,authTime:1760000000}),
  verifyApp:async()=>({appId:env.FIREBASE_APP_ID})
 };
 async function send(actor,route,body=null,extra=''){
  const req=new Request(BASE+'/api/v16/'+route+'?scope=free'+extra,{
   method:body===null?'GET':'POST',headers:{
    origin:BASE,authorization:'Bearer '+actor.repeat(130),
    'x-firebase-appcheck':'token',...(body===null?{}:{'content-type':'application/json'})
   },...(body===null?{}:{body:JSON.stringify(body)})
  });
  const response=await handleV16Request(req,env,testing);
  return {status:response.status,result:await response.json()};
 }
 return {env,send,worlds,lab,testing};
}
test('shard experiment API is disabled by default and requires real verified closed-beta gates',async()=>{
 const t=apiRig();
 t.env.ENABLE_V16_ZONE_SHARDS='false';
 assert.equal((await t.send('A','preview/shard-sync',{})).status,403);
 assert.equal((await t.send('A','preview/shard-nearby')).status,403);
 t.env.ENABLE_V16_ZONE_SHARDS='true';
 const anonymous=await handleV16Request(new Request(BASE+'/api/v16/preview/shard-sync?scope=free',{
  method:'POST',headers:{origin:BASE,'content-type':'application/json'},body:'{}'
 }),t.env);
 assert.equal(anonymous.status,401);
 assert.equal((await t.send('A','preview/shard-sync',{})).status,503,
  'unjoined canonical player cannot publish presence');
 assert.equal((await t.send('A','preview/shard-sync',{x:80,y:80})).status,400,
  'client location injection is rejected');
 assert.equal((await t.send('A','preview/join',{name:'HunterA'})).status,200);
 assert.equal((await t.send('B','preview/join',{name:'HunterB'})).status,200);
 assert.equal((await t.send('A','preview/shard-sync',{})).status,200);
 assert.equal((await t.send('B','preview/shard-sync',{})).status,200);
 const nearby=await t.send('A','preview/shard-nearby',null,'&x=99&y=99');
 assert.equal(nearby.status,200);
 assert.equal(nearby.result.nearby.players.length,1);
 assert.equal(nearby.result.nearby.players[0].name,'HunterB');
 const serialized=JSON.stringify(nearby.result);
 for(const secret of ['alice','bob','@','private-uid','previewNonce'])
  assert.ok(!serialized.includes(secret),'no internal credential or UID leakage: '+secret);
 const world=await t.send('A','preview/world');
 assert.equal(world.status,200);assert.equal(world.result.world.coins.length,200);
 const publicWrites=await t.send('A','join',{name:'Bad'});
 assert.equal(publicWrites.status,403);
 const cross=await handleV16Request(new Request(BASE+'/api/v16/preview/shard-nearby?scope=vip'),t.env);
 assert.equal(cross.status,403);
 assert.equal(t.worlds.size,1,'actual Free production DO remains untouched');
});

test('slow neighbor shard is bounded by deadline, never returns stale or partial avatar results',async()=>{
 const lab=zones(),room=roomWithActors([
  ['viewer',9.8,9.8,'Viewer'],['peer',10.4,9.8,'Peer']
 ]);
 const router=new V16ZoneRouter(lab.namespace,{timeoutMs:60});
 await router.sync(room,'viewer');await router.sync(room,'peer');
 assert.equal((await router.nearby(room,'viewer',T+100)).players.length,1);
 lab.slowZone(zoneName(10.4,9.8),150);
 const start=performance.now();
 await assert.rejects(()=>router.nearby(room,'viewer',T+100),error=>error.code==='deadline');
 const took=performance.now()-start;
 assert.ok(took<300,'timeout guards a stuck neighbor read instead of hanging');
 // In-flight work from unabortable DO mocks must not affect the authoritative room.
 assert.equal(room.publicView(T+100).coins.length,200);
 assert.equal(room.scores.get('peer'),0);
 await new Promise(resolve=>setTimeout(resolve,175));
 const report=router.report();
 assert.ok(report.requestCount>=4);
 assert.ok(report.deadlineCount>=1);
 assert.equal(report.inFlight,0);
 assert.equal(report.timeoutBudgetMs,60);
 assert.ok(report.peakInFlight<=9,'at most 9 zone DO reads per viewer');
 assert.ok(!JSON.stringify(report).includes('peer'),'metrics never expose UID');
 lab.slowZone(zoneName(10.4,9.8),0);
 const restored=await router.nearby(room,'viewer',T+100);
 assert.equal(restored.players.length,1);
});
test('timed-out old-zone removal keeps move unconfirmed and retry repairs handoff safely',async()=>{
 const lab=zones(),room=roomWithActors([
  ['viewer',9.5,8,'Viewer'],['traveller',9.9,8,'Traveller']
 ]);
 const router=new V16ZoneRouter(lab.namespace,{timeoutMs:60});
 for(const uid of room.players.keys())await router.sync(room,uid);
 const oldZone=zoneName(9.9,8),original=(await router.nearby(room,'viewer',T+100)).players[0].id;
 cross(room,'traveller',10.2,8);
 lab.slowZone(oldZone,135);
 await assert.rejects(()=>router.sync(room,'traveller'),error=>error.code==='deadline');
 assert.equal(router.published.get('traveller'),oldZone,'failed handoff cannot be acknowledged');
 assert.equal((await router.nearby(room,'viewer',T+500).catch(()=>({players:[]}))).players.length,0,
  'stale unconfirmed player must never be returned');
 await new Promise(resolve=>setTimeout(resolve,155));
 lab.slowZone(oldZone,0);
 const repaired=await router.sync(room,'traveller');
 assert.equal(repaired.transferred,true);
 const after=await router.nearby(room,'viewer',T+500);
 assert.equal(after.players.filter(p=>p.name==='Traveller').length,1);
 assert.equal(after.players.find(p=>p.name==='Traveller').id,original);
 assert.equal(room.scores.get('traveller'),0);
 assert.ok(router.report().deadlineCount>=1);
});
test('zone transport validates budgets and returns private aggregate-only metrics',async()=>{
 const lab=zones();
 assert.throws(()=>new V16ZoneRouter(lab.namespace,{timeoutMs:5}),/Invalid zone timeout/);
 const room=roomWithActors([['viewer',44,44,'Viewer']]);
 const router=new V16ZoneRouter(lab.namespace,{timeoutMs:100});
 await router.sync(room,'viewer');
 await router.nearby(room,'viewer',T+100);
 const m=router.report();
 assert.ok(m.requestCount>=1);
 assert.equal(m.requestCount,m.successful+m.deadlineCount+m.rejectedCount+m.transportErrorCount);
 assert.equal(m.inFlight,0);
 assert.equal(m.timeoutBudgetMs,100);
 assert.ok(m.latency.p99Ms>=m.latency.p50Ms);
 const serialized=JSON.stringify(m);
 assert.ok(!serialized.includes('viewer')&&!serialized.includes('avatar_'));
});
