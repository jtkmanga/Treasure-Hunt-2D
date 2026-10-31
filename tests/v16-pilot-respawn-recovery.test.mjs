import test from 'node:test';
import assert from 'node:assert/strict';
import {V16Room,COIN_RESPAWN_MS} from '../src/v16-online/room.mjs';
import {V16WorldRoom,handleV16Request} from '../src/v16-online/worker.mjs';

const T=Date.parse('2026-10-31T10:00:00Z'); // stable Saturday in Bangkok, no reset
const COIN0='pilot-respawn-00001';
const ALICE='pilot-alice-claim1';
const BOB='pilot-bob-claim001';
function placeAtCoinZero(room,uid,time){
 room.join(uid,time,uid);
 const c=room.map.coins[0],p=room.requirePlayer(uid);
 p.x=c.x;p.y=c.y;p.lastAt=time;
}
test('exact 60-second coin respawn boundary, immutable earlier miss and globally visible version',()=>{
 const room=new V16Room('free1',T,()=>0);
 placeAtCoinZero(room,'alice',T);placeAtCoinZero(room,'bob',T);
 const alice=room.collect('alice',ALICE,T,1);
 assert.equal(alice.kind,'coin');assert.equal(alice.coinId,0);
 assert.equal(room.collect('bob',BOB,T,1),null);
 const version=room.version;
 const before=room.publicView(T+COIN_RESPAWN_MS-1);
 assert.equal(before.coins[0].readyAt,T+COIN_RESPAWN_MS);
 assert.equal(before.version,version);
 const bobMiss=room.collect('bob','pilot-bob-claim002',T+COIN_RESPAWN_MS-1,2);
 assert.equal(bobMiss,null);
 const after=room.publicView(T+COIN_RESPAWN_MS);
 assert.equal(after.coins[0].readyAt,0);
 assert.equal(after.version,version+1,'server should advance world version on respawn');
 assert.equal(room.collect('alice',ALICE,T+COIN_RESPAWN_MS,1).requestId,ALICE,'identical replay returns old receipt');
 assert.equal(room.collect('bob','pilot-bob-claim002',T+COIN_RESPAWN_MS,2),null,'old miss cannot turn into free credit');
 const bob=room.collect('bob','pilot-bob-claim003',T+COIN_RESPAWN_MS,3);
 assert.equal(bob.kind,'coin');assert.equal(bob.coinId,0);assert.equal(bob.score,1);
 assert.equal(room.scores.get('alice')+room.scores.get('bob'),2,'only two distinct respawn cycles award points');
 assert.equal(room.collect('bob','pilot-bob-claim003',T+COIN_RESPAWN_MS+100,3).score,1);
 assert.throws(()=>room.collect('bob',BOB,T+COIN_RESPAWN_MS+150,1),/Stale claim sequence/);
 assert.equal(room.scores.get('alice')+room.scores.get('bob'),2);
});

function fakeDurableObject(saved){
 let startup;
 const state={storage:{
  async get(key){return saved.get(key)},
  async put(key,value){saved.set(key,structuredClone(value))}
 },blockConcurrencyWhile(fn){startup=fn()}};
 const object=new V16WorldRoom(state,{});
 return {object,startup:()=>startup};
}
function internal(action,uid='',body=null){
 return new Request('https://internal/'+action,{
  method:body===null?'GET':'POST',
  headers:{'x-internal-scope':'free1','x-internal-uid':uid,...(body===null?{}:{'content-type':'application/json'})},
  ...(body===null?{}:{body:JSON.stringify(body)})
 });
}
async function request(object,action,uid,body){
 const res=await object.fetch(internal(action,uid,body));
 return {status:res.status,body:await res.json()};
}
test('Durable Object restart and browser rejoin preserve score, cooldown and request sequence',async()=>{
 const nativeNow=Date.now;
 const saved=new Map();
 try{
  let clock=T;
  Date.now=()=>clock;
  const a=fakeDurableObject(saved);await a.startup();
  const j=await request(a.object,'pilot-join','alice',{name:'Alice'});
  assert.equal(j.status,200);
  assert.equal(j.body.result.nextClaimSeq,1);
  const pick=await request(a.object,'pilot-collect','alice',{requestId:COIN0,claimSeq:1});
  assert.equal(pick.status,200);assert.equal(pick.body.result?.score,1);
  assert.ok(saved.has('v16-state'),'acknowledged claim persisted');
  const b=fakeDurableObject(saved);await b.startup();
  clock=T+COIN_RESPAWN_MS-1;
  const before=await request(b.object,'pilot-world');
  assert.equal(before.body.world.coins[0].readyAt,T+COIN_RESPAWN_MS);
  assert.equal(before.body.world.leaders[0].score,1);
  // A browser retry should recover its original receipt even when this DO's
  // ephemeral players map is empty following hibernation or reconstruction.
  const replay=await request(b.object,'pilot-collect','alice',{requestId:COIN0,claimSeq:1});
  assert.equal(replay.status,200);
  assert.equal(replay.body.result.requestId,COIN0);
  assert.equal(b.object.room.players.size,0,'replaying a receipt must not create player position');
  assert.equal(b.object.room.scores.get('alice'),1);
  const freshWithoutJoin=await request(b.object,'pilot-collect','alice',{requestId:'pilot-unjoined0001',claimSeq:2});
  assert.equal(freshWithoutJoin.status,400);
  assert.match(freshWithoutJoin.body.error,/Player not joined/);
  const rejoin=await request(b.object,'pilot-join','alice',{name:'Alice'});
  assert.equal(rejoin.body.result.nextClaimSeq,2,'reloading browser uses persisted server sequence');
  clock=T+COIN_RESPAWN_MS;
  const fresh=await request(b.object,'pilot-world');
  assert.equal(fresh.body.world.coins[0].readyAt,0,'expired cooldown cleared');
  assert.ok(fresh.body.world.version>before.body.world.version);
  assert.equal(saved.get('v16-state').coinReadyAt[0],0,'respawn state persisted');
  const second=await request(b.object,'pilot-collect','alice',{requestId:'pilot-secondclaim1',claimSeq:2});
  assert.equal(second.body.result?.kind,'coin');assert.equal(second.body.result?.score,2);
  const c=fakeDurableObject(saved);await c.startup();
  const again=await request(c.object,'pilot-world');
  assert.equal(again.body.world.leaders[0].score,2);
  assert.ok(again.body.world.coins[0].readyAt>clock);
  const replayLatest=await request(c.object,'pilot-collect','alice',{requestId:'pilot-secondclaim1',claimSeq:2});
  assert.equal(replayLatest.status,200,'last accepted receipt remains readable without joining');
  assert.equal(replayLatest.body.result?.score,2);
  assert.equal(c.object.room.players.size,0);
  const cannotCollect=await request(c.object,'pilot-collect','alice',{requestId:'pilot-freshclaim3',claimSeq:3});
  assert.equal(cannotCollect.status,400,'fresh pickup still requires active player');
  assert.match(cannotCollect.body.error,/Player not joined/);
  const reconnected=await request(c.object,'pilot-join','alice',{name:'Alice'});
  assert.equal(reconnected.body.result.nextClaimSeq,3,'server restores next claim sequence after rejoin');
  const old=await request(c.object,'pilot-collect','alice',{requestId:COIN0,claimSeq:1});
  assert.equal(old.status,400,'older sequence refused after second award');
  assert.match(old.body.error,/Stale claim sequence/);
  assert.equal(c.object.room.scores.get('alice'),2);
 }finally{Date.now=nativeNow}
});
test('pilot read and real Free-world scores remain separate after reload/restart',async()=>{
 const storePilot=new Map(),storeFree=new Map();
 let clock=T;const nativeNow=Date.now;Date.now=()=>clock;
 try{
  const pilot=fakeDurableObject(storePilot),free=fakeDurableObject(storeFree);
  await Promise.all([pilot.startup(),free.startup()]);
  await request(pilot.object,'pilot-join','alice',{name:'Alice'});
  const picked=await request(pilot.object,'pilot-collect','alice',{requestId:'pilot-isolated-001',claimSeq:1});
  assert.equal(picked.body.result?.score,1);
  const normal=await request(free.object,'world');
  assert.equal(normal.body.world.coins[0].readyAt,0);
  assert.equal(normal.body.world.leaders.length,0);
  const recreated=fakeDurableObject(storePilot);await recreated.startup();
  const pilotView=await request(recreated.object,'pilot-world');
  assert.equal(pilotView.body.world.leaders[0].score,1);
  assert.equal((await request(free.object,'world')).body.world.leaders.length,0);
 }finally{Date.now=nativeNow}
});
