import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {ZoneTransport,ZONE_MAX_FANOUT} from '../src/v16-online/zone-transport.mjs';
import {runCrossDoBenchmark} from '../scripts/v16-cross-do-cost-probe.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const named='v16-preview-zone-v1-x3y4';
function bind(handler){
 return {idFromName:name=>name,get:name=>({fetch:req=>handler(name,req)})};
}
const good=()=>Response.json({ok:true,records:[]});
test('transport exposes redacted metrics, bounded latency samples and no credential fields',async()=>{
 const transport=new ZoneTransport(bind(async()=>good()),{timeoutMs:100});
 await transport.send(named,'/zone/nearby',{x:32,y:42});
 await transport.send(named,'/zone/nearby',{x:32,y:42});
 const s=transport.report();
 assert.equal(s.requestCount,2);
 assert.equal(s.successful,2);
 assert.equal(s.deadlineCount,0);
 assert.equal(s.peakInFlight,1);
 assert.equal(s.inFlight,0);
 assert.equal(s.actionCounts.nearby,2);
 assert.ok(s.latency.p99Ms>=s.latency.p50Ms);
 assert.ok(!JSON.stringify(s).includes('x-v16-zone-internal'));
 assert.equal(ZONE_MAX_FANOUT,9);
});
test('budget and destination checks reject unbounded requests without dispatching',async()=>{
 let calls=0;
 const ns=bind(async()=>{calls++;return good()});
 assert.throws(()=>new ZoneTransport(ns,{timeoutMs:49}),/Invalid/);
 assert.throws(()=>new ZoneTransport(ns,{timeoutMs:5001}),/Invalid/);
 const transport=new ZoneTransport(ns);
 for(const name of ['https://evil.test','v16-preview-zone-v1-x10y0','v16-live-world'])
  await assert.rejects(()=>transport.send(name,'/zone/nearby',{x:0,y:0}),
   error=>error.code==='invalid destination');
 await assert.rejects(()=>transport.send(named,'/zone/payment',{uid:'any'}),
  error=>error.code==='invalid destination');
 await assert.rejects(()=>transport.send(named,'/zone/upsert',{note:'a'.repeat(5000)}),
  error=>error.code==='oversized packet');
 assert.equal(calls,0,'invalid requests cannot reach a Durable Object');
});
test('failed, rejected, delayed and malformed response classes are counted separately',async()=>{
 const transport=new ZoneTransport(bind(async(name,req)=>{
  const op=JSON.parse(await req.text()).op;
  if(op==='reject')return Response.json({error:'unavailable'},{status:503});
  if(op==='malformed')return new Response('not JSON');
  if(op==='throw')throw Error('Should not leak private uid: sensitive-user-42');
  return good();
 }),{timeoutMs:100});
 await assert.rejects(()=>transport.send(named,'/zone/nearby',{op:'reject'}),
  error=>error.code==='rejected');
 await assert.rejects(()=>transport.send(named,'/zone/nearby',{op:'malformed'}),
  error=>error.code==='transport failure');
 await assert.rejects(()=>transport.send(named,'/zone/nearby',{op:'throw'}),
  error=>error.code==='transport failure'&&!error.message.includes('sensitive-user-42'));
 const report=transport.report();
 assert.equal(report.requestCount,3);
 assert.equal(report.successful,0);
 assert.equal(report.rejectedCount,1);
 assert.equal(report.transportErrorCount,2);
 assert.equal(report.inFlight,0);
});
test('slow response times out and no stale late response gets returned as success',async()=>{
 const transport=new ZoneTransport(bind(async()=>{
  await new Promise(resolve=>setTimeout(resolve,130));
  return good();
 }),{timeoutMs:60});
 const started=performance.now();
 await assert.rejects(()=>transport.send(named,'/zone/nearby',{x:32,y:42}),
  error=>error.code==='deadline');
 assert.ok(performance.now()-started<120);
 await new Promise(resolve=>setTimeout(resolve,100));
 const report=transport.report();
 assert.equal(report.deadlineCount,1);
 assert.equal(report.successful,0);
 assert.equal(report.inFlight,0);
});
test('cross-DO offline cost probe maintains one canonical coin world with 100 actors',async()=>{
 const report=await runCrossDoBenchmark({actors:100,queries:30});
 assert.equal(report.simulatedPlayers,100);
 assert.equal(report.syntheticZoneInstances,100);
 assert.equal(report.globalCoinCount,200);
 assert.equal(report.canonicalScoreEntries,100);
 assert.ok(report.transport.requestCount>=100+200+30);
 assert.ok(report.transport.peakInFlight<=ZONE_MAX_FANOUT);
 assert.equal(report.networkRequests,0);
 assert.equal(report.actualCloudflareDORuns,0);
 assert.equal(report.verifiedRealConcurrentPlayers,0);
 assert.equal(report.productionReadyConclusion,false);
 assert.ok(report.transport.latency.p99Ms>=report.transport.latency.p50Ms);
});
