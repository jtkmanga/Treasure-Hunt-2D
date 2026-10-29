import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRunSession,advanceRunTick,replayRun,MAX_TICKS,MAP_SIZE,TICK_MS}
 from "../src/online/run-engine.mjs";
import {TILE_SIZE} from "../ranked-preview/pixel-art.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const art=read("../ranked-preview/pixel-art.mjs");
const scene=read("../ranked-preview/scenic-details.mjs");
const html=read("../ranked-preview/index.html");
const main=read("../ranked-preview/main.mjs");
test("camera zoom matches wider concept framing and no 74px V3 zoom",()=>{
 assert.equal(TILE_SIZE,43);
 assert.match(art,/const cameraX=display\.x\*T-width\/2/);
 assert.match(art,/const cameraY=display\.y\*T-height\/2/);
 assert.doesNotMatch(art,/TILE_SIZE=74/);
 assert.match(art,/function treeSprite/);
 assert.match(art,/function pathTile/);
 assert.match(art,/function waterTile/);
});
test("reference HUD elements, thumbnail, mini-map, landscape and touch controls retained",()=>{
 for(const id of ["world","score","coins","time","mini","pause","collect","joystick","stick","area-art","levelSelect","start","resume","menu","rotate"]){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/position:fixed;inset:0;width:100vw;height:100dvh/);
 assert.match(html,/<div class="hud"/);
 assert.match(html,/แผนที่ย่อ/);
 assert.match(html,/ฝึกเท่านั้น/);
 assert.match(main,/paintAreaThumbnail\(\)/);
 assert.match(main,/requestFullscreen/);
 assert.match(main,/screen\.orientation\?\.lock/);
 assert.match(main,/advanceRunTick\(session,frame\)/);
 assert.match(main,/replayRun\(\{level,seed:SEED,frames:frameLog\}\)/);
});
test("scenic decoration no server scoring endpoints, no fake online winners",()=>{
 for(const src of [art,scene,main])
  assert.doesNotMatch(src,/\bfetch\s*\(|WebSocket|sendBeacon|localStorage|indexedDB|\/api\/v1\/scores/);
 assert.match(scene,/drawScenicBoundary/);
 assert.match(scene,/code%19===0/);
 assert.match(scene,/map\.tiles\[y-1\]/);
 assert.match(art,/function grassTile/);
 assert.match(art,/outside&&Math\.sin/);
});
test("900 frame server replay exact across three stages after art-only change",()=>{
 for(let level=0;level<3;level++){
  const run=createRunSession(level,123456789);
  const frames=[];
  for(let i=0;i<MAX_TICKS;i++){
   const frame=[i%8===0?1:0,i%13===0?1:0,i%7===0?1:0];
   frames.push(frame);advanceRunTick(run,frame);
  }
  const server=replayRun({level,seed:123456789,frames});
  assert.equal(run.tick,MAX_TICKS);
  assert.equal(server.elapsedMs,MAX_TICKS*TICK_MS);
  assert.equal(server.score,run.score);
  assert.equal(server.coinsCollected,run.coinsCollected);
  assert.equal(run.map.tiles.length,MAP_SIZE);
 }
});
