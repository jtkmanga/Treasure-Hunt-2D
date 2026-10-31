import test from 'node:test';
import assert from 'node:assert/strict';
import {V16WorldRoom} from '../src/v16-online/worker.mjs';
import {periodFor} from '../src/v16-online/periods.mjs';

function harness(){
 const records=new Map(),timers={next:null};
 let initialized;
 const state={
  storage:{
   async get(key){return records.get(key)},
   async put(key,value){records.set(key,structuredClone(value))},
   async getAlarm(){return timers.next},
   async setAlarm(ms){timers.next=ms},
  },
  blockConcurrencyWhile(fn){initialized=fn()},
 };
 const obj=new V16WorldRoom(state,{});
 return {obj,records,timers,ready:()=>initialized};
}
const request=(scope='free1')=>new Request('https://internal/world',{
 headers:{'x-internal-scope':scope},
});
test('Free/VIP world schedule exact next midnight Bangkok alarm',async()=>{
 for(const scope of ['free1','vip1']){
  const h=harness();await h.ready();
  const resp=await h.obj.fetch(request(scope));
  assert.equal(resp.status,200);
  const next=Date.parse(periodFor(scope,Date.now()).resetsAt);
  assert.equal(h.timers.next,next);
 }
});
test('season alarm records winner once, persists reset and reschedules',async()=>{
 const h=harness();await h.ready();
 await h.obj.fetch(request());
 h.obj.room.period='2026-10-18'; // Force an earlier already-closed season.
 h.obj.room.scores.set('winner-uid',1234);
 h.obj.room.names.set('winner-uid','Winner');
 await h.obj.alarm();
 assert.equal(h.obj.room.scores.size,0);
 assert.equal(h.obj.room.winners.at(-1).top.score,1234);
 assert.equal(h.records.get('v16-state').winners.at(-1).top.score,1234);
 assert.equal(h.timers.next,Date.parse(periodFor('free1',Date.now()).resetsAt));
 await h.obj.alarm();
 assert.equal(h.obj.room.winners.length,1); // At-least-once alarms cannot duplicate history.
});
