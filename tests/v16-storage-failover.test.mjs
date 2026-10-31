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
