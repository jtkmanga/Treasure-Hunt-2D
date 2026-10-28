import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {makeMap,replayRun,MAX_TICKS,TICK_MS} from "../src/online/run-engine.mjs";
import {startVerifiedRun,finishVerifiedRun} from "../src/online/run-store.mjs";
const dir=fileURLToPath(new URL("../",import.meta.url));
const NOW=Date.parse("2026-10-28T12:00:00.000Z");
const ID="be4e9a2b-f4be-4d35-9e0b-a7f99c6d5401";
const identity={uid:"test-user-a"};
function dbFixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(dir+"db/schema.sql","utf8"));
  sqlite.exec(readFileSync(dir+"db/runs.sql","utf8"));
  function prepare(q){
    return {bind(...args){return {
      first:async()=>sqlite.prepare(q).get(...args),
      all:async()=>({results:sqlite.prepare(q).all(...args)}),
      run:async()=>({meta:{changes:Number(sqlite.prepare(q).run(...args).changes)}})
    };}};
  }
  const db={
    prepare,
    batch:async(statements)=>{
      sqlite.exec("BEGIN");
      try{for(const s of statements)await s.run();sqlite.exec("COMMIT");}
      catch(e){sqlite.exec("ROLLBACK");throw e;}
    }
  };
  return {sqlite,db};
}
function chestFrames(){
  return [...Array.from({length:27},()=>[1,0,0]),
    ...Array.from({length:27},()=>[0,1,0]),[0,0,1]];
}
test("map seed is deterministic; two levels differ, input never teleports",()=>{
  const first=makeMap(0,123),second=makeMap(0,123),other=makeMap(1,123);
  assert.deepEqual(first,second);
  assert.notDeepEqual(first.tiles,other.tiles);
  assert.equal(first.coins.length,82);
  assert.equal(first.tiles[0][0],2);
  const run=replayRun({level:0,seed:123,frames:[[1,0,0]]});
  assert.ok(run.finalX>2.5&&run.finalX<3.4);
  assert.equal(run.elapsedMs,TICK_MS);
});
test("reject malformed vectors, floats, oversized runs, forged score property",()=>{
  for(const frames of [[],[[2,0,0]],[[0,0,2]],[[1.5,0,0]],[[0,0]],[[0,0,0,1]],null,
    Array.from({length:MAX_TICKS+1},()=>[0,0,0])]){
    assert.throws(()=>replayRun({level:0,seed:123,frames}),/Invalid/);
  }
  assert.throws(()=>makeMap(0,2**45),/Invalid/);
  assert.throws(()=>makeMap(9,123),/Invalid/);
});
test("server-simulated input picks at most one chest and produces no client-score trust",()=>{
  const frames=chestFrames();
  const a=replayRun({level:0,seed:123,frames});
  const b=replayRun({level:0,seed:123,frames:[...frames,[0,0,1],[0,0,1]]});
  assert.equal(a.score,100);
  assert.equal(a.chestCollected,true);
  assert.equal(b.score,100);
  assert.equal(b.chestCollected,true);
  assert.equal(a.coinsCollected,0);
});
test("D1 trigger credits one finished run once; duplicate input does not double credit",async()=>{
  const {db,sqlite}=dbFixture();
  const a=await startVerifiedRun(db,identity,{level:0,now:NOW,idFactory:()=>ID,seedFactory:()=>123});
  assert.equal(a.scope,"free1");
  const frames=chestFrames();
  const got=await finishVerifiedRun(db,identity,{runId:ID,frames},{now:NOW+60000});
  assert.equal(got.score,100);
  assert.equal(got.credited,true);
  const duplicate=await finishVerifiedRun(db,identity,{runId:ID,frames},{now:NOW+61000});
  assert.equal(duplicate.credited,false);
  assert.equal(duplicate.alreadyFinished,true);
  const row=sqlite.prepare("SELECT score FROM leaderboard_entries WHERE uid=? AND period_id=?")
    .get(identity.uid,a.periodId);
  assert.equal(row.score,100);
  assert.equal(sqlite.prepare("SELECT status FROM game_runs WHERE run_id=?").get(ID).status,"finished");
  sqlite.close();
});
test("duplicate parallel finish requests cannot award twice",async()=>{
  const {db,sqlite}=dbFixture();
  await startVerifiedRun(db,identity,{now:NOW,idFactory:()=>ID,seedFactory:()=>123});
  const finish=()=>finishVerifiedRun(db,identity,{runId:ID,frames:chestFrames()},{now:NOW+60000});
  const [a,b]=await Promise.all([finish(),finish()]);
  assert.equal(Number(a.credited)+Number(b.credited),1);
  assert.equal(sqlite.prepare("SELECT score FROM leaderboard_entries WHERE uid=?").get(identity.uid).score,100);
  sqlite.close();
});
test("reject impossible elapsed time, invalid identity, unknown UID and VIP unverified",async()=>{
  const {db,sqlite}=dbFixture();
  await assert.rejects(startVerifiedRun(db,{uid:"bad\nuid"},{now:NOW}),/Verified/);
  await assert.rejects(startVerifiedRun(db,identity,{now:NOW,scope:"vip1"}),/VIP/);
  await startVerifiedRun(db,identity,{now:NOW,idFactory:()=>ID,seedFactory:()=>123});
  await assert.rejects(finishVerifiedRun(db,identity,{runId:ID,frames:chestFrames(),score:999999},{now:NOW+60000}),/Invalid run submission/);
  await assert.rejects(finishVerifiedRun(db,identity,{runId:ID,frames:chestFrames()},{now:NOW+500}),/faster than real time/);
  await assert.rejects(finishVerifiedRun(db,{uid:"other"},{runId:ID,frames:chestFrames()},{now:NOW+60000}),/Run not found/);
  await assert.rejects(finishVerifiedRun(db,identity,{runId:ID,frames:chestFrames()},{now:NOW+200000}),/expired/);
  assert.equal(sqlite.prepare("SELECT status FROM game_runs WHERE run_id=?").get(ID).status,"active");
  sqlite.close();
});
test("database limits a UID to 10 ranked starts per period, rolls back failed 11th",async()=>{
  const {db,sqlite}=dbFixture();
  for(let i=0;i<10;i++){
    const id="11111111-1111-4111-8111-"+String(i).padStart(12,"0");
    await startVerifiedRun(db,identity,{now:NOW+i*1000,idFactory:()=>id,seedFactory:()=>i});
  }
  await assert.rejects(startVerifiedRun(db,identity,{now:NOW+11000,
    idFactory:()=>"11111111-1111-4111-8111-999999999999",seedFactory:()=>11}),/budget/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM game_runs").get().n,10);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM game_runs WHERE status='active'").get().n,1);
  sqlite.close();
});
