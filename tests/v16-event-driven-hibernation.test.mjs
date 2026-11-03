import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {V16Room} from '../src/v16-online/room.mjs';
import {AuthoritativeEventInput,validateEventInput,
 EVENT_INPUT_MAX_INTERVAL_MS} from '../src/v16-online/event-input.mjs';
import {V16HibernatingPresenceProbe,estimateRealtimeTransport}
 from '../src/v16-online/hibernating-event-probe.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const T=Date.parse('2026-11-03T10:00:00Z');
const signedNonce='test-signed-nonce-20261103';
function rig(){
 const room=new V16Room('free1',T,()=>0);
 room.join('alice-verified',T,'Alice');
 const engine=new AuthoritativeEventInput(room);
 engine.begin('alice-verified',signedNonce,T);
 return {room,engine,p:room.requirePlayer('alice-verified')};
}
test('event packet rejects client positions, timestamps, UIDs, oversized frames and malformed movement',()=>{
 for(const input of [
  {type:'start',seq:1,axes:[100,0],x:99},
  {type:'change',seq:2,axes:[101,0]},
  {type:'change',seq:2,axes:[1.5,0]},
  {type:'stop',seq:3,axes:[0,0]},
  {type:'heartbeat',seq:4,now:T},
  {type:'collect',seq:5},
  {type:'start',seq:1,axes:[0,0],uid:'alice-verified'},
  {type:'start',seq:1,axes:[0,0],padding:'x'.repeat(1000)}
 ])assert.throws(()=>validateEventInput(JSON.stringify(input)),/Invalid|Untrusted|No axes/);
 assert.deepEqual(validateEventInput('{"type":"start","seq":1,"axes":[100,0]}'),
  {type:'start',seq:1,axes:[100,0]});
});
test('event-driven movement remains server-authoritative, speed bounded and retry idempotent',()=>{
 const {room,engine,p}=rig(),x0=p.x,y0=p.y;
 const start=engine.consume('alice-verified',signedNonce,
  {type:'start',seq:1,axes:[100,0]},T);
 assert.equal(start.seq,1);
 assert.equal(start.moving,true);
 const beat=engine.consume('alice-verified',signedNonce,
  {type:'heartbeat',seq:2},T+1000);
 assert.equal(beat.seq,2);
 assert.ok(Math.hypot(p.x-x0,p.y-y0)<=4.0);
 const x1=p.x,y1=p.y;
 const duplicate=engine.consume('alice-verified',signedNonce,
  {type:'heartbeat',seq:2},T+2000);
 assert.equal(duplicate.duplicate,true);
 assert.equal(p.x,x1);
 assert.equal(p.y,y1);
 assert.throws(()=>engine.consume('alice-verified',signedNonce,
  {type:'stop',seq:4},T+2300),/Out-of-order/);
 assert.throws(()=>engine.consume('alice-verified','attacker-wrong-token',
  {type:'stop',seq:3},T+2300),/Stale event session/);
 const stop=engine.consume('alice-verified',signedNonce,
  {type:'stop',seq:3},T+2000);
 assert.equal(stop.moving,false);
 const x2=p.x,y2=p.y;
 engine.flush('alice-verified',signedNonce,T+2500);
 assert.equal(p.x,x2);
 assert.equal(p.y,y2);
 assert.equal(room.publicView(T+2500).coins.length,200);
 assert.equal(room.scores.get('alice-verified'),0);
 assert.ok(room.publicView(T+2500).chest);
 assert.equal(engine.close('alice-verified','wrong'),false);
 assert.equal(engine.close('alice-verified',signedNonce),true);
});
test('rate limit rejects message spam without modifying canonical player position',()=>{
 const {engine,p}=rig();
 engine.consume('alice-verified',signedNonce,{type:'start',seq:1,axes:[100,0]},T);
 const x=p.x,last=p.lastAt;
 assert.throws(()=>engine.consume('alice-verified',signedNonce,
  {type:'change',seq:2,axes:[0,100]},T+10),/rate limited/);
 assert.equal(p.lastAt,last);
 assert.equal(p.x,x);
 assert.equal(engine.consume('alice-verified',signedNonce,
  {type:'change',seq:2,axes:[0,100]},T+100).seq,2);
});
test('missing heartbeat caps elapsed movement at 4 seconds and requires resync',()=>{
 const {engine,p,room}=rig();
 const x=p.x,y=p.y;
 engine.consume('alice-verified',signedNonce,{type:'start',seq:1,axes:[100,0]},T);
 const beat=engine.consume('alice-verified',signedNonce,
  {type:'heartbeat',seq:2},T+60_000);
 assert.equal(beat.needsResync,true);
 assert.equal(beat.moving,false);
 assert.equal(p.lastAt,T+60_000);
 assert.ok(Math.hypot(p.x-x,p.y-y)<16,'60-second mobile dropout cannot move 234 tiles');
 assert.equal(room.scores.get('alice-verified'),0);
 assert.throws(()=>engine.consume('alice-verified',signedNonce,
  {type:'change',seq:1,axes:[0,100]},T+61_000),/Out-of-order/);
 assert.equal(engine.consume('alice-verified',signedNonce,
  {type:'start',seq:3,axes:[0,100]},T+62_000).moving,true);
});
function fakeWs(now=Date.now()){
 let attachment={uid:'synthetic-actor-1',session:'fake',
  seq:0,at:now,axes:[0,0],messages:0};
 const sent=[],closed=[];
 return {
  sent,closed,
  deserializeAttachment(){return structuredClone(attachment)},
  serializeAttachment(next){attachment=structuredClone(next)},
  send(data){sent.push(JSON.parse(data))},
  close(code,reason){closed.push({code,reason})},
  setAt(at){attachment.at=at},
  get state(){return attachment}
 };
}
test('hibernation handler accepts direction-only frames, deduplicates, and never broadcasts or grants score',async()=>{
 const context={getWebSockets(){return []}},room=new V16HibernatingPresenceProbe(context,{});
 const ws=fakeWs(Date.now()-500);
 await room.webSocketMessage(ws,'{"type":"start","seq":1,"axes":[100,0]}');
 assert.deepEqual(ws.sent[0],{
  ok:true,seq:1,authoritative:false,moving:true,needsResync:false
 });
 await room.webSocketMessage(ws,'{"type":"start","seq":1,"axes":[100,0]}');
 assert.equal(ws.sent[1].duplicate,true);
 assert.equal(ws.state.messages,1);
 await room.webSocketMessage(ws,'{"type":"start","seq":2,"axes":[100,0],"score":999}');
 assert.equal(ws.sent[2].ok,false);
 assert.equal(ws.state.messages,1);
 await room.webSocketMessage(ws,'{"type":"stop","seq":2}');
 assert.equal(ws.sent.at(-1).ok,false,'immediate input must be rate limited');
 ws.setAt(Date.now()-500);
 await room.webSocketMessage(ws,'{"type":"stop","seq":2}');
 assert.equal(ws.sent.at(-1).moving,false);
 assert.equal(ws.state.seq,2);
 assert.ok(!JSON.stringify(ws.sent).includes('synthetic-actor-1'));
});
test('hibernation probe closes binary payload, stale session and invalid attachment',async()=>{
 const room=new V16HibernatingPresenceProbe({},{}),bad=fakeWs();
 await room.webSocketMessage(bad,new Uint8Array([1,2,3]).buffer);
 assert.equal(bad.closed[0].code,1008);
 const stale=fakeWs(Date.now()-100_000);
 await room.webSocketMessage(stale,'{"type":"start","seq":1,"axes":[100,0]}');
 assert.equal(stale.closed[0].reason,'Rejoin required');
});
test('monthly $10 budget model explicitly counts incoming messages but never claims full bill',()=>{
 const low=estimateRealtimeTransport({
  concurrent:10_000,movingFraction:0,days:30,
  movingEventIntervalSeconds:4,idleEventIntervalSeconds:60
 });
 const high=estimateRealtimeTransport({
  concurrent:10_000,movingFraction:1,days:30,
  movingEventIntervalSeconds:4,idleEventIntervalSeconds:60
 });
 assert.ok(low.basePlusIncomingMessageRequestsUSD<high.basePlusIncomingMessageRequestsUSD);
 assert.ok(high.basePlusIncomingMessageRequestsUSD>10);
 const fullyIdle=estimateRealtimeTransport({
  concurrent:10_000,movingFraction:0,days:30,
  movingEventIntervalSeconds:3,idleEventIntervalSeconds:null
 });
 assert.equal(fullyIdle.inboundClientMessages,0);
 assert.equal(fullyIdle.estimatedDORequestsFromIncomingMessages,0);
 assert.ok(fullyIdle.basePlusIncomingMessageRequestsUSD<=low.basePlusIncomingMessageRequestsUSD);
 assert.equal(low.completeMonthlyBillKnown,false);
 assert.equal(low.underTenDollarTotalProven,false);
 assert.equal(low.realAuthenticatedConcurrencyTested,0);
 assert.ok(low.omitted.includes('Durable Object active duration'));
 for(const bad of [{movingFraction:1.2},{concurrent:100_001},
  {days:0},{movingEventIntervalSeconds:0}])
  assert.throws(()=>estimateRealtimeTransport(bad),/Invalid/);
});
