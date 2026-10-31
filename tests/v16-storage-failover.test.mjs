import test from 'node:test';
import assert from 'node:assert/strict';
import { V16WorldRoom } from '../src/v16-online/worker.mjs';

const request=(action,uid='',body={})=>new Request('https://internal/'+action,{
 method:action==='world'?'GET':'POST',
 headers:{'content-type':'application/json','x-internal-uid':uid,'x-internal-scope':'free1'},
 body:action==='world'?undefined:JSON.stringify(body),
});
function lab(){
 let ready,failNextPut=false,failNextRead=false;
 const persisted=new Map();
 const state={
  storage:{
   async get(k){if(failNextRead){failNextRead=false;throw Error('simulated storage read outage')}return persisted.get(k)},
   async put(k,v){if(failNextPut){failNextPut=false;throw Error('simulated storage write outage')}persisted.set(k,structuredClone(v))},
  },
  blockConcurrencyWhile(fn){ready=fn()},
 };
 const room=new V16WorldRoom(state,{});
 return {room,ready:()=>ready,persisted,
  failPut:()=>{failNextPut=true},failRead:()=>{failNextRead=true}};
}
test('no coin credit leaks from RAM if durable storage temporarily refuses writes',async()=>{
 const l=lab();await l.ready();
 const joined=await l.room.fetch(request('join','alice',{name:'Alice'}));assert.equal(joined.status,200);
 const coin=l.room.room.map.coins[0];
 Object.assign(l.room.room.players.get('alice'),{x:coin.x,y:coin.y});
 l.failPut();
 const response=await l.room.fetch(request('collect','alice',{requestId:'coin-claim-0001',claimSeq:1}));
 assert.equal(response.status,503);
 assert.equal(l.room.room.scores.get('alice'),0);
 assert.equal(l.room.room.coinReadyAt[0],0);
 assert.equal(l.room.room.claimSequences.get('alice')||0,0);
 assert.equal(l.persisted.get('v16-state').scores.find(([uid])=>uid==='alice')[1],0);
 const retry=await l.room.fetch(request('collect','alice',{requestId:'coin-claim-0001',claimSeq:1}));
 assert.equal(retry.status,200);
 assert.equal((await retry.json()).result.amount,1);
 assert.equal(l.room.room.scores.get('alice'),1);
 assert.equal(l.persisted.get('v16-state').scores.find(([uid])=>uid==='alice')[1],1);
});
test('if storage cannot be read after failed write, all later operations fail closed',async()=>{
 const l=lab();await l.ready();
 const joined=await l.room.fetch(request('join','alice',{name:'Alice'}));assert.equal(joined.status,200);
 const coin=l.room.room.map.coins[0];
 Object.assign(l.room.room.players.get('alice'),{x:coin.x,y:coin.y});
 l.failPut();l.failRead();
 const fail=await l.room.fetch(request('collect','alice',{requestId:'coin-claim-0001',claimSeq:1}));
 assert.equal(fail.status,503);
 const next=await l.room.fetch(request('collect','alice',{requestId:'coin-claim-0001',claimSeq:1}));
 assert.equal(next.status,503);
 assert.equal(l.persisted.get('v16-state').scores.find(([uid])=>uid==='alice')[1],0);
});

test('public world rollover does not expose a reset that failed to persist',async()=>{
 const l=lab();await l.ready();
 await l.room.fetch(request('join','alice',{name:'Alice'}));
 l.room.room.period='2026-10-18';
 l.room.room.scores.set('alice',59);
 l.persisted.set('v16-state',l.room.room.save());
 l.failPut();
 const unavailable=await l.room.fetch(request('world'));
 assert.equal(unavailable.status,503);
 assert.equal(l.room.room.scores.get('alice'),59);
 assert.equal(l.room.room.winners.length,0);
 const retried=await l.room.fetch(request('world'));
 assert.equal(retried.status,200);
 assert.equal(l.room.room.scores.size,0);
 assert.equal(l.room.room.winners.at(-1).top.score,59);
 assert.equal(l.persisted.get('v16-state').winners.at(-1).top.score,59);
});

test('failed midnight alarm persists winner exactly once on the next retry',async()=>{
 const l=lab();await l.ready();
 await l.room.fetch(request('join','alice',{name:'Alice'}));
 l.room.room.period='2026-10-18';
 l.room.room.scores.set('alice',77);
 l.persisted.set('v16-state',l.room.room.save());
 l.failPut();
 await assert.rejects(()=>l.room.alarm(),/Persistent world storage unavailable/);
 assert.equal(l.room.room.scores.get('alice'),77);
 assert.equal(l.room.room.winners.length,0);
 await l.room.alarm();
 assert.equal(l.room.room.winners.length,1);
 assert.equal(l.room.room.winners[0].top.score,77);
 assert.equal(l.persisted.get('v16-state').winners[0].top.score,77);
 await l.room.alarm();
 assert.equal(l.room.room.winners.length,1);
});
