// Live HTTP health check. Safe: never authenticates, moves players, grants
// scores, or creates/changes game state. Uses only disabled staging endpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
const BASE='https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev';
test('isolated V16 staging Worker is alive with all gameplay gates disabled',async()=>{
 const health=await fetch(BASE+'/api/v16/health',{signal:AbortSignal.timeout(15000)});
 assert.equal(health.status,200);
 const data=await health.json();
 assert.equal(data.ok,true);
 assert.equal(data.phase,'staging-preview');
 assert.equal(data.map,'v16-forest-100');
 assert.equal(data.writesEnabled,false);
});
test('unauthenticated world reads and score writes stay closed',async()=>{
 const world=await fetch(BASE+'/api/v16/world?scope=free',{signal:AbortSignal.timeout(15000)});
 assert.equal(world.status,403);
 assert.match((await world.text()),/World reads not enabled/);
 const score=await fetch(BASE+'/api/v16/collect?scope=free',{
  method:'POST',headers:{'content-type':'application/json'},
  body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(score.status,403);
 assert.match((await score.text()),/Online writes not enabled/);
});
test('untrusted cross-origin requests are rejected',async()=>{
 const denied=await fetch(BASE+'/api/v16/health',{
  headers:{origin:'https://untrusted.example'},
  signal:AbortSignal.timeout(15000)});
 assert.equal(denied.status,403);
});
