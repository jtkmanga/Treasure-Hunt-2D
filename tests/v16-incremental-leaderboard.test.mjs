import test from 'node:test';
import assert from 'node:assert/strict';
import {V16Room} from '../src/v16-online/room.mjs';
import {IncrementalLeaderboard} from '../src/v16-online/incremental-leaderboard.mjs';

const START=Date.parse('2026-11-03T10:00:00.000Z');
const safeName=value=>{
 const name=String(value||'Hunter').trim().slice(0,36);
 return !name||name.includes('@')||/[<>\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/i.test(name)
  ?'Hunter':name;
};
function reference(scores,names,count=20){
 return [...scores.entries()]
  .sort(([a,x],[b,y])=>y-x||(names.get(a)||a).localeCompare(names.get(b)||b))
  .slice(0,count).map(([uid,score],i)=>({rank:i+1,name:safeName(names.get(uid)),score}));
}
function equal(room,message=''){
 for(const n of [0,1,2,5,20,21,50,-1]){
  assert.deepEqual(room.leaders(n),reference(room.scores,room.names,n),
   'Exact ranking must match legacy full sort '+message+' count='+n);
 }
 assert.ok(room.ranking.top.length<=20,'only 20 UIDs may be cached');
 assert.ok(!JSON.stringify(room.publicView(START+100)).includes('test-private-uid'),
  'public list must never expose any Firebase UIDs');
}
function rng(seed=20261103){
 let x=seed>>>0;
 return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/2**32};
}
const choices=['Same','Same','Alice','Bob','Álvaro','äbc','ไทย','Ö','zero','Zed','Hunter'];
test('index preserves legacy stable tie ordering and sanitizes only public labels',()=>{
 const room=new V16Room('free1',START,()=>0);
 for(let i=0;i<50;i++){
  const uid='test-private-uid-'+i;
  room.join(uid,START,choices[i%choices.length]);
  room.scores.set(uid,i%6);
 }
 equal(room,'initial 50');
 const a=room.scores.keys().next().value;
 const name=room.names.get(a);
 room.names.set(a,'person@example.com');
 equal(room,'sanitization without comparator rewrite');
 room.names.set(a,name);
 equal(room,'name round-trip');
 const saved=room.save();
 assert.equal(saved.schema,1,'no persistent format migration');
 assert.ok(!('ranking' in saved),'cached index cannot alter Durable Object storage');
 const loaded=V16Room.restore(saved,START+50,()=>0);
 equal(loaded,'restored format');
 assert.deepEqual(loaded.publicView(START+50).leaders,room.publicView(START+50).leaders);
});
test('random score and name mutations, deletions, re-joins and old rank API match exact stable full sort',()=>{
 const r=new V16Room('free1',START,()=>0),random=rng();
 const uids=Array.from({length:100},(_,i)=>'test-private-uid-'+i);
 for(const uid of uids)r.join(uid,START,'Same');
 equal(r,'stable joins');
 for(let i=0;i<650;i++){
  const uid=uids[Math.floor(random()*uids.length)],op=Math.floor(random()*6);
  if(op===0)r.join(uid,START,choices[Math.floor(random()*choices.length)]);
  else if(op===1)r.scores.set(uid,Math.floor(random()*300));
  else if(op===2)r.names.set(uid,choices[Math.floor(random()*choices.length)]);
  else if(op===3)r.scores.delete(uid);
  else if(op===4){
   if(!r.scores.has(uid))r.scores.set(uid,Math.floor(random()*100));
   else r.scores.set(uid,(r.scores.get(uid)||0)+1);
  }else r.names.delete(uid);
  if(i%11===0)equal(r,'operation '+i);
 }
 equal(r,'final');
 const state=r.save();
 const fresh=V16Room.restore(state,START+1000,()=>0);
 equal(fresh,'randomized restore');
});
test('index handles top member scoring down, name worsening and rank-21 promotion',()=>{
 const room=new V16Room('free1',START,()=>0);
 for(let i=0;i<30;i++){
  const uid='test-private-uid-'+String(i).padStart(2,'0');
  room.join(uid,START,'Same');
  room.scores.set(uid,200-i);
 }
 equal(room,'top 20');
 room.scores.set('test-private-uid-00',0);
 equal(room,'top score decreased');
 room.names.set('test-private-uid-02','zzzzzz');
 equal(room,'top name changed');
 room.scores.delete('test-private-uid-03');
 equal(room,'top score deleted');
 room.scores.clear();
 equal(room,'reset with empty score map');
 room.join('test-private-uid-29',START+10,'Hunter');
 equal(room,'after rejoin');
});
test('Free weekly and VIP daily winner snapshot still exact across rollover',()=>{
 const beforeFree=Date.parse('2026-10-31T16:59:59Z');
 const resetFree=Date.parse('2026-10-31T17:00:00Z');
 const resetVip=Date.parse('2026-10-30T17:00:00Z');
 for(const [scope,at] of [['free1',resetFree],['vip1',resetVip]]){
  const room=new V16Room(scope,at-1000,()=>0);
  for(let i=0;i<35;i++){
   const uid='test-private-uid-'+i;
   room.join(uid,at-1000,'Same');
   room.scores.set(uid,i===22?888:i);
  }
  const previous=reference(room.scores,room.names,1)[0];
  assert.deepEqual(room.leaders(1)[0],previous);
  assert.equal(room.rollover(at),true);
  assert.deepEqual(room.winners.at(-1).top,previous);
  assert.deepEqual(room.leaders(),[]);
  room.join('test-private-uid-4',at+20,'Returning');
  assert.deepEqual(room.leaders(),[{rank:1,name:'Returning',score:0}]);
  equal(room,'new season');
 }
});
test('incremental leaderboard can reconstruct 10K canonical ranks with bounded cached list',()=>{
 const count=10_000,entries=[],names=[];
 for(let i=0;i<count;i++){
  const uid='test-private-uid-'+String(i).padStart(5,'0');
  entries.push([uid,i%43]);
  names.push([uid,'same-'+i%29]);
 }
 const ranking=new IncrementalLeaderboard(entries,names,safeName);
 assert.equal(ranking.scores.size,count);
 assert.ok(ranking.top.length<=20);
 assert.deepEqual(ranking.leaders(),reference(ranking.scores,ranking.names));
 ranking.scores.set('test-private-uid-09999',10_000);
 assert.deepEqual(ranking.leaders(),reference(ranking.scores,ranking.names));
 ranking.names.set('test-private-uid-09999','Zulu');
 assert.deepEqual(ranking.leaders(),reference(ranking.scores,ranking.names));
});
