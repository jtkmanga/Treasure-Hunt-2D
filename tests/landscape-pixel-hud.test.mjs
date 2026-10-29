import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MAP_SIZE,makeMap,createRunSession} from "../src/online/run-engine.mjs";

const html=readFileSync(new URL("../ranked-preview/index.html",import.meta.url),"utf8");
const code=readFileSync(new URL("../ranked-preview/main.mjs",import.meta.url),"utf8");
const art=readFileSync(new URL("../ranked-preview/pixel-art.mjs",import.meta.url),"utf8");
test("landscape gameplay fills the screen; score, coins and timer overlay the canvas",()=>{
 assert.match(html,/content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/);
 assert.match(html,/#game\{position:fixed;inset:0;width:100vw;height:100dvh/);
 assert.match(html,/<div class="hud"/);
 for(const id of ["world","score","coins","time","mini","pause","joystick","stick","collect","menu","rotate","fullscreen","start","resume","levelSelect","result"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/แผนที่ย่อ/);
 assert.match(html,/fullscreen/);
 assert.match(html,/rotate-full/);
 assert.match(code,/screen\.orientation\?\.lock/);
 assert.match(code,/requestFullscreen/);
 assert.match(code,/rotate\.hidden=!isPortrait\(\)/);
});
test("live timer shown in HUD, pauses on background or portrait and does not mutate server scoring",()=>{
 assert.match(code,/deadline=performance\.now\(\)\+remainingMs/);
 assert.match(code,/remainingMs=Math\.max\(0,Math\.min\(remainingMs,deadline-performance\.now\(\)\)\)/);
 assert.match(code,/if\(isPortrait\(\)\)pauseRun\(\)/);
 assert.match(code,/visibilitychange/);
 assert.match(code,/frameLog\.push\(frame\)/);
 assert.match(code,/advanceRunTick\(session,frame\)/);
 assert.match(code,/replayRun\(\{level,seed:SEED,frames:frameLog\}\)/);
 assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|firebase|\/api\/v1/);
});
test("pixel scenery is locally drawn and deterministic collision map is untouched",()=>{
 assert.match(code,/drawPixelWorld/);
 assert.match(code,/drawMiniMap/);
 assert.match(art,/original/i);
 assert.match(art,/function treeSprite/);
 assert.match(art,/function waterTile/);
 assert.match(art,/function chestSprite/);
 assert.match(art,/function heroSprite/);
 assert.doesNotMatch(art, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
 for(let level=0;level<3;level++){
  const map=makeMap(level,123456789),session=createRunSession(level,123456789);
  assert.equal(map.tiles.length,MAP_SIZE);
  assert.equal(map.coins.length,82);
  assert.deepEqual(session.map,map);
 }
});
