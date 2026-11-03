import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runCapacityProbe,sampleStats} from '../scripts/v16-capacity-harness.mjs';

test('latency percentiles are ordered and deterministic without a browser',()=>{
 assert.deepEqual(sampleStats([9,1,4,6,7]),{
  samples:5,minMs:1,p50Ms:6,p95Ms:9,p99Ms:9,maxMs:9
 });
 assert.equal(sampleStats([]).samples,0);
});
test('small in-process multi-player run measures the accepted V16.26 batch protocol',()=>{
 const r=runCapacityProbe({players:25,movesPerPlayer:2,worldPolls:3,contention:10});
 assert.equal(r.schema,'v16-core-capacity-v1');
 assert.equal(r.mode,'offline-no-browser-no-network');
 assert.equal(r.workload.joins,25);
 assert.equal(r.workload.movementBatches,50);
 assert.equal(r.workload.worldSnapshots,3);
 assert.equal(r.workload.sameCoinClaims,10);
 assert.equal(r.workload.successfulCoinClaims,1);
 assert.equal(r.gates.globalCoins,200);
 assert.equal(r.gates.oneCoinClaimPerContention,true);
 assert.equal(r.gates.totalSyntheticPlayers,25);
 assert.equal(r.networkRequests,0);
 assert.equal(r.authenticatedOnlineRequests,0);
 assert.equal(r.verifiedRealConcurrentPlayers,0);
 assert.equal(r.productionReadyConclusion,false);
 assert.ok(r.latencyMs.join.p99Ms>=r.latencyMs.join.p50Ms);
 assert.ok(r.memoryKiB.serializedSnapshot>0);
});
test('capacity probe rejects excessive, noninteger and unsafe workloads',()=>{
 for(const opts of [
  {players:0},{players:10001},{players:1.4},{players:'abc'},
  {players:3,contention:4},{players:1,movesPerPlayer:6},
  {players:1,worldPolls:101}
 ])assert.throws(()=>runCapacityProbe(opts),/Invalid/);
 const noClaims=runCapacityProbe({players:2,movesPerPlayer:0,worldPolls:0,contention:0});
 assert.equal(noClaims.workload.successfulCoinClaims,0);
 assert.equal(noClaims.gates.oneCoinClaimPerContention,true);
});
test('CLI emits machine-readable report with no network or tokens',()=>{
 const raw=execFileSync(process.execPath,
  ['scripts/v16-capacity-harness.mjs','--players','12','--moves','1','--polls','1','--contention','3'],
  {encoding:'utf8',timeout:20_000});
 const r=JSON.parse(raw);
 assert.equal(r.simulatedPlayers,12);
 assert.equal(r.networkRequests,0);
 assert.equal(r.workload.successfulCoinClaims,1);
 assert.ok(!raw.includes('Bearer '));
 assert.ok(!raw.includes('firebaseToken'));
});
test('no remote target argument, launch flag, App Check bypass or production endpoints exist',()=>{
 const code=readFileSync('scripts/v16-capacity-harness.mjs','utf8');
 for(const forbidden of ['fetch(', 'WebSocket(', 'workers.dev','firebaseapp.com','ENABLE_V16_WRITES','https://','exec(', 'child_process'])
  assert.ok(!code.includes(forbidden),'harness must remain offline: '+forbidden);
 assert.ok(code.includes('LIMIT=10_000'));
 assert.ok(code.includes('productionReadyConclusion:false'));
});
