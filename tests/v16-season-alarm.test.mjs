import test from 'node:test';
import assert from 'node:assert/strict';
import {V16WorldRoom} from '../src/v16-online/worker.mjs';
import {V16Room} from '../src/v16-online/room.mjs';
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

test('authenticated Free world shows Bangkok weekly reset and only safe previous winner',()=>{
 const now=Date.parse('2026-10-31T16:59:59.000Z'); // Saturday 23:59:59 Bangkok
 const room=new V16Room('free1',now,()=>0);
 room.join('private-firebase-uid',now,'HunterA');
 room.scores.set('private-firebase-uid',1003);
 const before=room.publicView(now);
 assert.equal(before.period,'2026-10-25');
 assert.equal(before.season.periodId,'2026-10-25');
 assert.equal(before.season.resetsAt,'2026-10-31T17:00:00.000Z');
 assert.equal(before.season.timezone,'Asia/Bangkok');
 assert.equal(before.season.previousWinner,null);
 assert.equal(before.leaders[0].score,1003);
 const reset=room.publicView(now+1000);
 assert.equal(reset.period,'2026-11-01');
 assert.equal(reset.season.startsAt,'2026-10-31T17:00:00.000Z');
 assert.equal(reset.season.resetsAt,'2026-11-07T17:00:00.000Z');
 assert.deepEqual(reset.leaders,[]);
 assert.equal(reset.season.previousWinner.periodId,'2026-10-25');
 assert.deepEqual(reset.season.previousWinner.winner,{name:'HunterA',score:1003});
 assert.equal(room.winners.length,1);
 room.publicView(now+2000);
 assert.equal(room.winners.length,1,'world polling must not create duplicate winners');
 const publicString=JSON.stringify(reset);
 assert.ok(!publicString.includes('private-firebase-uid'),'public ranking must never expose UID');
 assert.ok(!publicString.includes('claimIds'),'public ranking must never expose receipt IDs');
 const stored=V16Room.restore(room.save(),now+2000,()=>0);
 assert.deepEqual(stored.publicView(now+2000).season.previousWinner,reset.season.previousWinner);
});
test('VIP reset is daily at Bangkok midnight and season shows empty winner when nobody scored',()=>{
 const before=Date.parse('2026-10-31T16:59:59.000Z');
 const room=new V16Room('vip1',before,()=>0);
 const initial=room.publicView(before);
 assert.equal(initial.season.resetsAt,'2026-10-31T17:00:00.000Z');
 const after=room.publicView(before+1000);
 assert.equal(after.season.periodId,'2026-11-01');
 assert.equal(after.season.resetsAt,'2026-11-01T17:00:00.000Z');
 assert.deepEqual(after.season.previousWinner,{periodId:'2026-10-31',
  closedAt:'2026-10-31T17:00:00.000Z',winner:null});
});

test('season leaderboard does not expose submitted or legacy email-like display names',()=>{
 const now=Date.parse('2026-10-31T16:59:59.000Z');
 const room=new V16Room('free1',now,()=>0);
 room.join('private-uid-1',now,'someone@example.com');
 room.scores.set('private-uid-1',20);
 assert.equal(room.publicView(now).leaders[0].name,'Hunter','new email nickname must be sanitized');
 room.names.set('private-uid-1','legacy@example.com');
 assert.equal(room.publicView(now).leaders[0].name,'Hunter','historical names must also be redacted');
 const after=room.publicView(now+1000);
 assert.equal(after.season.previousWinner.winner.name,'Hunter','winner snapshot must never display email');
 assert.ok(!JSON.stringify(after).includes('private-uid-1'));
 assert.ok(!JSON.stringify(after).includes('@'));
});
