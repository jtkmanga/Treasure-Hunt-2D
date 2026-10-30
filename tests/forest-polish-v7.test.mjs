import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeMapV6,makeMap,createRunSessionV6,advanceRunTick,replayRunV6,MAX_TICKS}
 from "../src/online/run-engine.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const art=read("../ranked-preview/pixel-art.mjs"),renderer=read("../ranked-preview/cohesive-world.mjs");
const main=read("../ranked-preview/main.mjs"),html=read("../ranked-preview/index.html");
test("V7 sprite tiles pre-render organic connected paths and two canopy species",()=>{
 assert.match(art,/function trailOverlay\(/);
 assert.match(art,/function pineSprite\(/);
 assert.match(art,/const trail=Array\.from\(\{length:64\}/);
 assert.match(art,/const tree=Array\.from\(\{length:12\}/);
 assert.match(renderer,/const mask=\(cell\(map\.path,x,y-1\)\?1:0\)/);
 assert.match(renderer,/art\.trail\[mask\*4\+\(seed%4\)\]/);
 assert.match(renderer,/shoreline\(g,map,art,x,y,sx,sy,seed\)/);
 assert.match(renderer,/cell\(map\.water,x,y\)/);
 assert.match(renderer,/drawCohesiveMiniMap/);
});
test("V7 no independent photo background, external sprite requests or fake collision",()=>{
 for(const code of [renderer,art,main]){
  assert.doesNotMatch(code,/\bfetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|localStorage|\beval\s*\(/);
 }
 assert.doesNotMatch(renderer,/\.(?:png|jpg|jpeg|webp)\b|new\s+Image\s*\(/);
 assert.match(renderer,/map\.tiles\[y\]\?\.\[x\]/);
 assert.match(renderer,/map\.bridge/);
 assert.match(renderer,/tile===1/);
 assert.match(renderer,/tile===2/);
 assert.match(html,/PRACTICE · ไม่มีคะแนนออนไลน์/);
 for(const id of ["world","score","coins","time","mini","pause","joystick","collect","rotate"]){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
});
test("V7 does not change canonical collision map, coin positions or score replay",()=>{
 for(let level=0;level<3;level++)for(const seed of [0,123,123456789,0xffffffff]){
  const a=makeMapV6(level,seed),b=makeMapV6(level,seed);
  assert.deepEqual(a,b);
  assert.equal(a.coins.length,82);
  assert.equal(a.tiles.length,26);
  const frames=[],s=createRunSessionV6(level,seed);
  for(let i=0;i<MAX_TICKS;i++){
   const f=[i%11===0?1:0,i%19===0?-1:0,i%5===0?1:0];
   frames.push(f);advanceRunTick(s,f);
  }
  const r=replayRunV6({level,seed,frames});
  assert.equal(r.score,s.score);
  assert.equal(r.coinsCollected,s.coinsCollected);
 }
 assert.deepEqual(makeMap(0,1).spawn,{x:2.5,y:2.5});
});
