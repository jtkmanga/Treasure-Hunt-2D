import test from 'node:test';
import assert from 'node:assert/strict';
import {EventDrivenMobileInput} from '../src/v16-online/event-mobile-input.mjs';
import {AuthoritativeEventInput} from '../src/v16-online/event-input.mjs';
import {V16Room} from '../src/v16-online/room.mjs';
import {handleEventProbe} from '../src/v16-event-probe/worker.mjs';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const BASE='https://synthetic-event-probe.test';
const TOKEN='E'.repeat(48);
const INTERNAL='I'.repeat(48);
function rig(){
 const requests=[],config={
  EVENT_PROBE_ENABLED:'false',EVENT_PROBE_BILLING_REVIEWED:'false',
  EVENT_PROBE_OPERATOR_TOKEN:TOKEN,EVENT_PROBE_INTERNAL_SECRET:INTERNAL,
  EVENT_PROBE_ROOMS:{idFromName(name){return name},
   get(name){return {fetch:async req=>{
    requests.push({name,secret:req.headers.get('x-internal-event-secret'),
     actor:req.headers.get('x-synthetic-actor'),
     forwardedOperatorToken:req.headers.get('authorization')});
    return Response.json({ok:true});
   }}}
  }
 };
 return {config,requests};
}
function req(headers={},url=BASE+'/connect'){
 return new Request(url,{headers:{upgrade:'websocket',...headers}});
}
test('mobile sender emits start/change/stop on direction changes and no idle heartbeat',()=>{
 const sent=[],c=new EventDrivenMobileInput(data=>sent.push(JSON.parse(data)));
 for(let t=0;t<60_000;t+=50)c.tick(t);
 assert.equal(sent.length,0,'inactive browser sends no periodic packets');
 c.onInput([100,0],60_000);
 assert.equal(sent[0].type,'start');
 c.onInput([90,15],60_010);
 c.onInput([20,80],60_030);
 assert.equal(sent.length,1,'rapid changes coalesce into latest vector');
 c.tick(60_080);
 assert.equal(sent[1].type,'change');
 assert.deepEqual(sent[1].axes,[20,80]);
 c.tick(63_500);
 assert.equal(sent[2].type,'heartbeat');
 c.onInput([0,0],63_590);
 assert.equal(sent[3].type,'stop');
 c.tick(300_000);
 assert.equal(sent.length,4,'a stopped player must not use paid heartbeat frames');
 assert.deepEqual(sent.map(x=>x.seq),[1,2,3,4]);
});
test('mobile tab background sends immediate stop without waiting for next animation frame',()=>{
 const frames=[],client=new EventDrivenMobileInput(raw=>frames.push(JSON.parse(raw)));
 client.onInput([100,0],1000);
 const stopped=client.stop(1005);
 assert.equal(stopped.type,'stop');
 assert.equal(stopped.seq,2);
 client.tick(1_000_000);
 assert.equal(frames.length,2);
 assert.deepEqual(frames.map(x=>x.type),['start','stop']);
});
test('event-driven mobile packets can be replayed through canonical server without duplicate movement',()=>{
 const now=Date.parse('2026-11-03T10:00:00Z');
 const room=new V16Room('free1',now,()=>0);
 room.join('signed-user',now,'Hunter');
 const engine=new AuthoritativeEventInput(room);
 engine.begin('signed-user','nonce-created-by-server',now);
 const packets=[],client=new EventDrivenMobileInput(x=>packets.push(JSON.parse(x)));
 client.onInput([100,0],now);
 client.tick(now+3000);
 client.onInput([0,0],now+3100);
 for(let i=0;i<packets.length;i++){
  const at=[now,now+3000,now+3100][i];
  const ack=engine.consume('signed-user','nonce-created-by-server',packets[i],at);
  assert.equal(ack.seq,i+1);
 }
 const pos=room.requirePlayer('signed-user');
 assert.ok(Math.hypot(pos.x-room.map.spawn.x,pos.y-room.map.spawn.y)<=12.2);
 assert.equal(room.scores.get('signed-user'),0);
 assert.equal(room.map.coins.length,200);
});
test('realtime operator-only gateway fails closed before any DO calls',async()=>{
 const {config,requests}=rig();
 const none=await handleEventProbe(req({
  authorization:'Bearer '+TOKEN,'x-synthetic-actor':'synthetic-actor-7'
 }),config);
 assert.equal(none.status,403);
 config.EVENT_PROBE_ENABLED='true';
 const denied=await handleEventProbe(req({
  authorization:'Bearer '+TOKEN,'x-synthetic-actor':'synthetic-actor-7'
 }),config);
 assert.equal(denied.status,403);
 config.EVENT_PROBE_BILLING_REVIEWED='true';
 const bad=await handleEventProbe(req({
  authorization:'Bearer '+('X'.repeat(48)),
  'x-synthetic-actor':'synthetic-actor-7'
 }),config);
 assert.equal(bad.status,401);
 const unverified=await handleEventProbe(req({
  authorization:'Bearer '+TOKEN,
  'x-synthetic-actor':'real-firebase-user-7'
 }),config);
 assert.equal(unverified.status,403);
 assert.equal(requests.length,0);
 const noUpgrade=await handleEventProbe(new Request(BASE+'/connect'),config);
 assert.equal(noUpgrade.status,426);
});
test('realtime operator-only gateway strips secret auth and forwards only synthetic identity to its own DO',async()=>{
 const {config,requests}=rig();
 config.EVENT_PROBE_ENABLED='true';config.EVENT_PROBE_BILLING_REVIEWED='true';
 const response=await handleEventProbe(req({
  authorization:'Bearer '+TOKEN,'x-synthetic-actor':'synthetic-actor-7',
  'x-malicious-world':'free1'
 }),config);
 assert.equal(response.status,200);
 assert.equal(requests.length,1);
 assert.equal(requests[0].name,'event-probe-isolated-synthetic-v1');
 assert.equal(requests[0].actor,'synthetic-actor-7');
 assert.equal(requests[0].secret,INTERNAL);
 assert.equal(requests[0].forwardedOperatorToken,null);
 assert.ok(!JSON.stringify(requests[0]).includes(TOKEN));
 const health=await handleEventProbe(new Request(BASE+'/health'),config);
 assert.equal((await health.json()).liveGame,false);
});
test('reconnect creates a new sequence and idle time stays free of event frames',()=>{
 const sent=[],c=new EventDrivenMobileInput(raw=>sent.push(JSON.parse(raw)));
 c.onInput([0,100],0);
 c.stop(100);
 c.resetAfterReconnect();
 c.onInput([100,0],1000);
 assert.deepEqual(sent.map(v=>v.seq),[1,2,1]);
 assert.deepEqual(sent.map(v=>v.type),['start','stop','start']);
 for(let i=1100;i<=100_000;i+=100)c.tick(i);
 assert.ok(sent.length>=30&&sent.length<=40,'only roughly one heartbeat per 3 seconds while active');
 c.stop(100_100);
 const stopCount=sent.length;
 for(let i=100_200;i<1_000_000;i+=100)c.tick(i);
 assert.equal(sent.length,stopCount);
});
