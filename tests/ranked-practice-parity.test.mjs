import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRunSession,advanceRunTick,replayRun,makeMap,MAX_TICKS,TICK_MS}
 from "../src/online/run-engine.mjs";

test("practice tick is identical to server replay across 3 levels and complex input",()=>{
 for(let level=0;level<3;level++){
  for(const seed of [0,123,123456789,0xffffffff]){
   const session=createRunSession(level,seed),frames=[];
   for(let t=0;t<MAX_TICKS;t++){
    const x=(t%11===0?1:t%13===0?-1:0);
    const y=(t%7===0?1:t%17===0?-1:0);
    const collect=t%5===0?1:0;
    const frame=[x,y,collect];
    frames.push(frame);
    const returned=advanceRunTick(session,frame);
    assert.equal(returned,session);
    assert.equal(session.tick,t+1);
    assert.ok(session.player.x>=0&&session.player.x<26);
    assert.ok(session.player.y>=0&&session.player.y<26);
   }
   const backend=replayRun({level,seed,frames});
   assert.equal(backend.score,session.score);
   assert.equal(backend.coinsCollected,session.coinsCollected);
   assert.equal(backend.chestCollected,session.chestCollected);
   assert.equal(backend.finalX,Math.round(session.player.x*1000)/1000);
   assert.equal(backend.finalY,Math.round(session.player.y*1000)/1000);
   assert.equal(backend.elapsedMs,MAX_TICKS*TICK_MS);
  }
 }
});
test("server seed materially changes preview map, same seed reproduces every tile",()=>{
 const first=makeMap(0,123456789),same=makeMap(0,123456789),other=makeMap(0,98765);
 assert.deepEqual(first,same);
 assert.notDeepEqual(first.tiles,other.tiles);
 assert.equal(first.coins.length,82);
 assert.equal(first.chest.claimed,false);
});
test("preview step rejects forged inputs, exceeding 3-minute frame budget",()=>{
 for(const bad of [[2,0,1],[0.1,1,0],[0,0,2],[1,0,1,9],["1",0,0]]){
  const session=createRunSession(0,123);
  assert.throws(()=>advanceRunTick(session,bad),/Invalid/);
  assert.equal(session.tick,0);
 }
 const run=createRunSession(0,123);
 for(let i=0;i<MAX_TICKS;i++)advanceRunTick(run,[0,0,0]);
 assert.equal(run.tick,MAX_TICKS);
 assert.throws(()=>advanceRunTick(run,[0,0,1]),/Invalid/);
});
test("client only renders practice; no score writes, payments, login token or remote fetch",()=>{
 const script=readFileSync(new URL("../ranked-preview/main.mjs",import.meta.url),"utf8");
 const html=readFileSync(new URL("../ranked-preview/index.html",import.meta.url),"utf8");
 assert.match(script,/from "\.\/run-engine\.mjs"/);
 assert.match(script,/advanceRunTick\(session,frame\)/);
 assert.match(script,/replayRun\(\{level,seed:SEED,frames:frameLog\}\)/);
 assert.match(script,/frameLog\.push\(frame\)/);
 assert.match(html,/PRACTICE · ไม่มีคะแนนออนไลน์/);
 assert.match(html,/คะแนนฝึกเท่านั้น ยังไม่มีการส่งข้อมูลจริง/);
 assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|WebSocket|firebase|localStorage|\.\/api\/|\/api\/v1\/|sendBeacon/);
 assert.doesNotMatch(script,/console\.log|eval\s*\(/);
});
