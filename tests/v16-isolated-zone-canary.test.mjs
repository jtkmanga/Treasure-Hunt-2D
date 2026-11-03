import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleCanaryRequest,V16CanaryCoordinator,V16PresenceZone}
 from '../src/v16-canary/worker.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const TOKEN='C'.repeat(48);
const URL='https://synthetic-zone-canary.example/run';
function rig({enabled=true,failZone=false}={}){
 const zones=new Map(),stateStore=new Map();
 const counters={gateInvocations:0,zoneRequests:0};
 const zoneBinding={
  idFromName:name=>name,
  get(name){
   if(!zones.has(name))zones.set(name,new V16PresenceZone({id:{name}},{}));
   return {async fetch(req){
    counters.zoneRequests++;
    if(failZone)throw Error('Simulated injected shard outage');
    return zones.get(name).fetch(req);
   }};
  }
 };
 const gateEnv={ZONE_ROOMS:zoneBinding};
 let gate=new V16CanaryCoordinator({id:{name:'v16-isolated-zone-canary-gate-v1'},
  storage:{async get(k){return stateStore.get(k)},
   async put(k,v){stateStore.set(k,structuredClone(v))}}},gateEnv);
 const gateBinding={
  idFromName:name=>name,
  get(name){
   assert.equal(name,'v16-isolated-zone-canary-gate-v1');
   return {async fetch(req){counters.gateInvocations++;return gate.fetch(req)}};
  }
 };
 const env={CANARY_ENABLED:enabled?'true':'false',
  CANARY_RUN_TOKEN:TOKEN,CANARY_GATE:gateBinding};
 async function call(actors=2,reads=2,token=TOKEN){
  const res=await handleCanaryRequest(new Request(URL,{method:'POST',
   headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({actors,reads})}),env);
  return {status:res.status,data:await res.json()};
 }
 return {call,env,counters,zones,stateStore,
  restart(){gate=new V16CanaryCoordinator({
   id:{name:'v16-isolated-zone-canary-gate-v1'},
   storage:{async get(k){return stateStore.get(k)},
    async put(k,v){stateStore.set(k,structuredClone(v))}}},gateEnv)}};
}
test('public canary health is harmless and disabled flag blocks all DO calls',async()=>{
 const r=rig({enabled:false});
 const status=await handleCanaryRequest(new Request('https://synthetic-zone-canary.example/health'),r.env);
 assert.equal(status.status,200);
 assert.equal((await status.json()).publicGame,false);
 const disabled=await r.call();
 assert.equal(disabled.status,403);
 assert.equal(r.counters.gateInvocations,0);
 assert.equal(r.counters.zoneRequests,0);
 const missing=await handleCanaryRequest(new Request('https://synthetic-zone-canary.example/preview/world'),r.env);
 assert.equal(missing.status,404);
});
test('strict operator token and bounded payload reject unauthorized traffic before billing DO calls',async()=>{
 const r=rig();
 const wrong=await r.call(2,2,'z'.repeat(48));
 assert.equal(wrong.status,401);
 const without=await handleCanaryRequest(new Request(URL,{method:'POST',
  headers:{'content-type':'application/json'},body:'{"actors":2,"reads":2}'}),r.env);
 assert.equal(without.status,401);
 for(const payload of [{actors:10000,reads:1},{actors:10,reads:6},
  {actors:2,reads:2,uid:'private-user'},{actors:'2',reads:1},
  {actors:2.4,reads:1},[],null]){
  const res=await handleCanaryRequest(new Request(URL,{method:'POST',
   headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json'},
   body:JSON.stringify(payload)}),r.env);
  assert.equal(res.status,400,JSON.stringify(payload));
 }
 const tooLong=await handleCanaryRequest(new Request(URL,{method:'POST',
  headers:{authorization:'Bearer '+TOKEN},body:JSON.stringify({junk:'x'.repeat(1000)})}),r.env);
 assert.equal(tooLong.status,413);
 assert.equal(r.counters.gateInvocations,0);
 assert.equal(r.counters.zoneRequests,0);
});
test('isolated synthetic run measures real zone-binding calls with no game data and no credentials leaked',async()=>{
 const r=rig();
 const {status,data}=await r.call(3,2);
 assert.equal(status,200,JSON.stringify(data));
 assert.equal(data.ok,true);
 assert.equal(data.actorsTested,3);
 assert.equal(data.nearbyReads,2);
 assert.ok(data.transport.requestCount>=9);
 assert.equal(data.transport.requestCount,r.counters.zoneRequests);
 assert.ok(data.transport.peakInFlight<=9);
 assert.equal(data.transport.deadlineCount,0);
 assert.equal(data.transport.rejectedCount,0);
 assert.equal(data.transport.transportErrorCount,0);
 assert.ok(data.transport.latency.p99Ms>=data.transport.latency.p50Ms);
 assert.equal(data.gameScoresChanged,false);
 assert.equal(data.realAuthenticatedPlayersTested,0);
 assert.ok(r.zones.size>=2);
 const output=JSON.stringify(data);
 for(const forbidden of [TOKEN,'synthetic-canary-','avatar_','email','firebase'])
  assert.ok(!output.includes(forbidden),'leaked canary internal data '+forbidden);
 assert.equal(data.runsRemainingToday,2);
});
test('global run and initiated request budgets persist across independent coordinator instances',async()=>{
 const r=rig();
 const first=await r.call(2,1);
 assert.equal(first.status,200);
 const spent=r.counters.zoneRequests;
 r.restart();
 assert.equal((await r.call(1,1)).status,200);
 r.restart();
 assert.equal((await r.call(1,1)).status,200);
 r.restart();
 const last=await r.call(1,1);
 assert.equal(last.status,429);
 assert.equal(last.data.error,'Daily canary request budget exhausted');
 assert.ok(r.counters.zoneRequests>spent);
 assert.equal(r.counters.gateInvocations,4);
 const ledger=r.stateStore.get('canary-daily-budget-v1');
 assert.equal(ledger.runs,3);
 assert.ok(ledger.reservedCalls<=300);
});
test('failing shard produces fail-closed sanitized response and still spends a run budget',async()=>{
 const r=rig({failZone:true});
 const failed=await r.call(2,2);
 assert.equal(failed.status,503);
 assert.equal(failed.data.ok,false);
 assert.equal(failed.data.gameScoresChanged,false);
 assert.ok(failed.data.transport.transportErrorCount>=1);
 assert.equal(failed.data.runsRemainingToday,2);
 assert.ok(!JSON.stringify(failed.data).includes('Simulated injected shard outage'));
 assert.equal(r.stateStore.get('canary-daily-budget-v1').runs,1);
});
test('invalid direct coordinator call and non-internal headers cannot run test DOs',async()=>{
 let count=0;
 const co=new V16CanaryCoordinator({
  id:{name:'v16-isolated-zone-canary-gate-v1'},
  storage:{async get(){count++;return undefined},async put(){count++}}},{});
 const r=await co.fetch(new Request('https://internal/run',{method:'POST',body:'{"actors":1,"reads":1}'}));
 assert.equal(r.status,403);
 assert.equal(count,0);
});
