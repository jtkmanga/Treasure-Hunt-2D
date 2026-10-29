import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeMap,createRunSession,replayRun,advanceRunTick,MAX_TICKS} from "../src/online/run-engine.mjs";
import {isScenicBoardwalk,drawScenicGround,drawScenicObjects,drawScenicBoundary} from "../ranked-preview/scenic-details.mjs";
const source=readFileSync(new URL("../ranked-preview/scenic-details.mjs",import.meta.url),"utf8");
const pixel=readFileSync(new URL("../ranked-preview/pixel-art.mjs",import.meta.url),"utf8");
const ui=readFileSync(new URL("../ranked-preview/index.html",import.meta.url),"utf8");

test("render-only accents preserve scoring and original official map on all 3 levels",()=>{
 for(let level=0;level<3;level++){
  const map=makeMap(level,123456789),before=JSON.stringify(map);
  assert.ok(isScenicBoardwalk(map,11,2));
  assert.equal(isScenicBoardwalk(map,12,2),false);
  const bad=JSON.parse(before);bad.tiles[2][11]=3;
  assert.equal(isScenicBoardwalk(bad,11,2),false);
  const run=createRunSession(level,123456789);
  const frames=[];
  for(let i=0;i<MAX_TICKS;i++){
   const f=[i%9===0?1:0,i%10===0?1:0,i%8===0?1:0];frames.push(f);
   advanceRunTick(run,f);
  }
  assert.equal(JSON.stringify(map),before);
  const replay=replayRun({level,seed:123456789,frames});
  assert.equal(run.score,replay.score);
  assert.equal(run.coinsCollected,replay.coinsCollected);
 }
});

test("scenery draws only from its inputs, no writes to collision or official score",()=>{
 const map=makeMap(0,123456789),before=JSON.stringify(map);
 let draws=0,fills=0;
 const fake={drawImage(){draws++;},fillRect(){fills++;},set fillStyle(_){}};
 const parts={
 p:{fern:["a","b","c","d"],cliff:["1","2","3","4"]},
 waterfall:{},lilypad:{},ferns:[{},{},{}],stump:{},boards:{},crate:{},lamp:{},sign:{},cliff:{}
 };
 for(let y=1;y<map.tiles.length-1;y++)for(let x=1;x<map.tiles[y].length-1;x++){
  const tile=map.tiles[y][x];
  drawScenicGround(fake,map,parts,tile,x,y,x*52,y*52,52,4500);
  drawScenicObjects(fake,map,parts,tile,x,y,x*52,y*52,52);
 }
 drawScenicBoundary(fake,parts,-2,4,0,0,52);
 assert.ok(draws>0);
 assert.ok(fills>=0);
 assert.equal(JSON.stringify(map),before);
});

test("forest UI adds scenic details while preserving controls and offline scope",()=>{
 for(const marker of ["drawScenicGround","drawScenicObjects","drawScenicBoundary","createScenery"]){
  assert.match(pixel,new RegExp(marker));
 }
 for(const marker of ["waterfall","lilypad","plankBridge","foregroundFern","stump","woodSign","lamp","cliff"]){
  assert.match(source,new RegExp(marker));
 }
 assert.match(source,/decorations only|decorations ONLY/i);
 assert.match(ui,/Pixel Forest art-pass 2/);
 for(const id of ["time","score","coins","mini","pause","joystick","collect"])
  assert.match(ui,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sendBeacon|firebase|\/api\/v1/);
 assert.doesNotMatch(pixel,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sendBeacon/);
});
