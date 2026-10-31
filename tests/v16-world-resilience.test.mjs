import test from 'node:test';
import assert from 'node:assert/strict';
import {V16Room,COIN_RESPAWN_MS} from '../src/v16-online/room.mjs';
import {V16WorldRoom,handleV16Request} from '../src/v16-online/worker.mjs';
const t=Date.parse('2026-10-30T10:00:00Z');

test('sequenced pickups are durable and stale tokens cannot claim a respawn',()=>{
 const room=new V16Room('free1',t,()=>0);
 room.join('alice',t,'Alice');
 const coin=room.map.coins[0];Object.assign(room.players.get('alice'),{x:coin.x,y:coin.y});
 const granted=room.collect('alice','claim-0000000001',t,1);
 assert.equal(granted.amount,1);
 assert.equal(room.collect('alice','claim-0000000001',t+50,1).amount,1);
 for(let seq=2;seq<=45;seq++){
  const miss=room.collect('alice','claim-'+String(seq).padStart(10,'0'),t+1000,seq);
  assert.equal(miss,null);
 }
 const restored=V16Room.restore(room.save(),t+COIN_RESPAWN_MS,()=>0);
 restored.join('alice',t+COIN_RESPAWN_MS,'Alice');
 assert.equal(restored.privateView('alice',t+COIN_RESPAWN_MS).nextClaimSeq,46);
 Object.assign(restored.players.get('alice'),{x:coin.x,y:coin.y});
 assert.throws(()=>restored.collect('alice','claim-0000000001',t+COIN_RESPAWN_MS,1),/Stale/);
 assert.throws(()=>restored.collect('alice','claim-next99999',t+COIN_RESPAWN_MS,47),/Out-of-order/);
 assert.equal(restored.collect('alice','claim-next00046',t+COIN_RESPAWN_MS,46).amount,1);
 assert.equal(restored.scores.get('alice'),2);
});

function objectHarness(saved=new Map()){
 let ready;
 const state={
  storage:{async get(k){return saved.get(k)},async put(k,v){saved.set(k,structuredClone(v));}},
  blockConcurrencyWhile(fn){ready=fn();},
 };
 const object=new V16WorldRoom(state,{});
 return {object,ready:()=>ready,saved};
}
function internal(action,uid='',scope='free1',body={},since=null){
 return new Request('https://internal/'+action,{
  method:action==='world'?'GET':'POST',
  headers:{'content-type':'application/json','x-internal-scope':scope,
   'x-internal-uid':uid,...(since!==null?{'x-world-since':String(since)}:{})},
  body:action==='world'?undefined:JSON.stringify(body),
 });
}
test('room storage survives DO reconstruction and one coin cannot credit twice',async()=>{
 const store=new Map(),a=objectHarness(store);await a.ready();
 const join=await a.object.fetch(internal('join','alice','free1',{name:'Alice'}));
 assert.equal(join.status,200);
 const c=a.object.room.map.coins[0];
 Object.assign(a.object.room.players.get('alice'),{x:c.x,y:c.y});
 const picked=await a.object.fetch(internal('collect','alice','free1',{requestId:'coin-claim-0001',claimSeq:1}));
 assert.equal((await picked.json()).result.amount,1);
 const b=objectHarness(store);await b.ready();
 assert.equal(b.object.room.scores.get('alice'),1);
 const view=await b.object.fetch(internal('world','','free1',{},b.object.room.version));
 const payload=await view.json();assert.equal(payload.unchanged,true);
 assert.equal(payload.version,b.object.room.version);
 const joined=await b.object.fetch(internal('join','alice','free1',{name:'Alice'}));
 assert.equal((await joined.json()).result.nextClaimSeq,2);
 Object.assign(b.object.room.players.get('alice'),{x:c.x,y:c.y});
 const missed=await b.object.fetch(internal('collect','alice','free1',{requestId:'coin-claim-0002',claimSeq:2}));
 assert.equal((await missed.json()).result,null);
 assert.equal(b.object.room.scores.get('alice'),1);
});
test('public world is opt-in and compact polling rejects malformed versions',async()=>{
 const blocked=await handleV16Request(new Request('https://example.test/api/v16/world?scope=free'),{ENABLE_V16_READS:'false'});
 assert.equal(blocked.status,403);
 const room=objectHarness();await room.ready();
 const env={ENABLE_V16_READS:'true',ROOMS:{idFromName:s=>s,get:()=>room.object},
  FIREBASE_PROJECT_ID:'project-test',FIREBASE_PROJECT_NUMBER:'1234567890',
  FIREBASE_APP_ID:'1:1234567890:web:demo',
  ACCOUNT_STATUS:{async fetch(){return Response.json({uid:'alice',disabled:false,revoked:false})}},
  V16_RATE_LIMITER:{async limit(){return {success:true}}},
 };
 const testing={verifyId:async()=>({uid:'alice'}),verifyApp:async()=>({appId:'demo'})};
 const requestWorld=path=>new Request('https://example.test/api/v16/'+path,{
  headers:{authorization:'Bearer '+('A'.repeat(110)),'x-firebase-appcheck':'valid-app-check'},
 });
 const anonymous=await handleV16Request(new Request('https://example.test/api/v16/world?scope=free'),env,testing);
 assert.equal(anonymous.status,401);
 const first=await handleV16Request(requestWorld('world?scope=free'),env,testing);
 const firstData=await first.json();
 assert.equal(firstData.world.coins.length,200);
 const since=firstData.world.version;
 const second=await handleV16Request(requestWorld('world?scope=free&since='+since),env,testing);
 const secondData=await second.json();
 assert.equal(secondData.unchanged,true);
 assert.equal(Object.hasOwn(secondData,'world'),false);
 const bad=await handleV16Request(requestWorld('world?scope=free&since=not_a_version'),env,testing);
 assert.equal(bad.status,400);
});
