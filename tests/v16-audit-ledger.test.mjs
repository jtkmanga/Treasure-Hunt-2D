import test from 'node:test';
import assert from 'node:assert/strict';
import {V16Room,AUDIT_WINDOW} from '../src/v16-online/room.mjs';
import {V16WorldRoom} from '../src/v16-online/worker.mjs';

const START=Date.parse('2026-11-02T03:00:00.000Z');
function coinPosition(room,uid){const c=room.map.coins[0],p=room.requirePlayer(uid);p.x=c.x;p.y=c.y;p.lastAt=START;}

test('one server-authoritative coin award creates one persisted private audit event, never a public UID leak',()=>{
 const r=new V16Room('free1',START,()=>0);
 r.join('alice-private-uid',START,'HunterA');coinPosition(r,'alice-private-uid');
 const first=r.collect('alice-private-uid','audit-claim-0001',START+1000,1);
 assert.equal(first.kind,'coin');assert.equal(first.score,1);
 const audit=r.auditView();
 assert.equal(audit.entries.length,1);
 assert.deepEqual(
  Object.fromEntries(['id','uid','kind','amount','score','requestId','claimSeq','at'].map(k=>[k,audit.entries[0][k]])),
  {id:1,uid:'alice-private-uid',kind:'coin',amount:1,score:1,requestId:'audit-claim-0001',claimSeq:1,at:START+1000});
 assert.equal(audit.nextId,2);
 const same=r.collect('alice-private-uid','audit-claim-0001',START+1050,1);
 assert.deepEqual(same,first,'idempotent retry must return same receipt');
 assert.equal(r.auditView().entries.length,1,'retry must not append a new audit event');
 const publicText=JSON.stringify(r.publicView(START+1100));
 assert.ok(!publicText.includes('alice-private-uid'));
 assert.ok(!publicText.includes('audit-claim-0001'));
 assert.ok(!publicText.includes('auditEvents'));
 const restored=V16Room.restore(r.save(),START+1200,()=>0);
 assert.deepEqual(restored.auditView(),audit,'restart preserves private event and sequence');
});

test('no-award attempts never create score ledger entries',()=>{
 const room=new V16Room('free1',START,()=>0);
 room.join('bob',START,'HunterB');
 const result=room.collect('bob','audit-miss-00001',START+1000,1);
 assert.equal(result,null);
 assert.deepEqual(room.auditView().entries,[]);
 assert.equal(room.auditView().nextId,1);
 assert.equal(room.claimSequences.get('bob'),1,'miss remains deduped');
});
test('bounded audit window preserves strictly increasing event IDs and never grows without limit',()=>{
 const room=new V16Room('free1',START,()=>0);
 room.join('alice',START,'HunterA');coinPosition(room,'alice');
 for(let i=0;i<AUDIT_WINDOW+4;i++){
  const at=START+1000+i*61000;
  const claim=room.collect('alice','audit-repeat-'+String(i).padStart(6,'0'),at,i+1);
  assert.equal(claim?.kind,'coin','coin returns after exactly 60 seconds');
 }
 const audit=room.auditView(50);
 assert.equal(audit.window,AUDIT_WINDOW);
 assert.equal(room.auditEvents.length,AUDIT_WINDOW);
 assert.equal(audit.earliestRetainedId,5);
 assert.equal(audit.nextId,AUDIT_WINDOW+5);
 assert.equal(audit.entries[0].id,AUDIT_WINDOW+4);
 assert.equal(audit.entries.at(-1).id,AUDIT_WINDOW+4-49);
 assert.equal(audit.entries.length,50);
 assert.throws(()=>room.auditView(51),/Invalid admin audit limit/);
 const resumed=V16Room.restore(room.save(),START+4*3600_000,()=>0);
 assert.equal(resumed.auditView().nextId,audit.nextId);
 assert.equal(resumed.auditView().earliestRetainedId,5);
});
test('old persisted rooms without any audit keys restore with an empty history, not invented transactions',()=>{
 const room=new V16Room('free1',START,()=>0);
 room.join('alice',START,'HunterA');
 const legacy=room.save();delete legacy.auditEvents;delete legacy.auditNextId;
 const restored=V16Room.restore(legacy,START+10,()=>0);
 assert.deepEqual(restored.auditView().entries,[]);
 assert.equal(restored.auditView().nextId,1);
 const corrupted=room.save();corrupted.auditEvents=[{id:999}];
 assert.throws(()=>V16Room.restore(corrupted,START+10,()=>0),/Corrupt audit/);
});
function persistedHarness(){
 let init;const durable=new Map();
 const state={storage:{async get(k){return durable.get(k)},async put(k,v){durable.set(k,structuredClone(v))}},blockConcurrencyWhile(cb){init=cb()}};
 const room=new V16WorldRoom(state,{});
 const request=(action,body,uid='alice')=>new Request('https://internal/'+action,{method:'POST',
  headers:{'content-type':'application/json','x-internal-uid':uid,'x-internal-scope':'free1'},
  body:JSON.stringify(body)});
 return {room,durable,ready:()=>init,request};
}
test('award and audit persist in the same durable v16-state snapshot before ACK',async()=>{
 const h=persistedHarness();await h.ready();
 assert.equal((await h.room.fetch(h.request('join',{name:'HunterA'}))).status,200);
 const coin=h.room.room.map.coins[0];
 Object.assign(h.room.room.requirePlayer('alice'),{x:coin.x,y:coin.y});
 const result=await h.room.fetch(h.request('collect',{requestId:'audit-persist-0001',claimSeq:1}));
 assert.equal(result.status,200);
 const body=await result.json();
 assert.equal(body.result.amount,1);
 const saved=h.durable.get('v16-state');
 assert.equal(saved.auditEvents.length,1);
 assert.equal(saved.auditEvents[0].requestId,'audit-persist-0001');
 assert.equal(saved.scores.find(([uid])=>uid==='alice')[1],1);
 const retry=await h.room.fetch(h.request('collect',{requestId:'audit-persist-0001',claimSeq:1}));
 assert.equal(retry.status,200);
 assert.equal(h.durable.get('v16-state').auditEvents.length,1,'network retry is never a second award');
 const unauthorized=await h.room.fetch(new Request('https://internal/admin-audit',{
  headers:{'x-internal-scope':'free1','x-internal-uid':'alice'}}));
 assert.equal(unauthorized.status,403,'DO does not serve raw events without admin marker');
});
