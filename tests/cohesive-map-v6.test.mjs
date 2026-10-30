import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeMapV6,createRunSessionV6,advanceRunTick,replayRunV6,MAP_SIZE,MAX_TICKS,TICK_MS}
 from "../src/online/run-engine.mjs";
import {drawCohesiveWorld,drawCohesiveMiniMap} from "../ranked-preview/cohesive-world.mjs";
const read=file=>readFileSync(new URL(file,import.meta.url),"utf8");
const engine=read("../src/online/run-engine.mjs"),renderer=read("../ranked-preview/cohesive-world.mjs");
const main=read("../ranked-preview/main.mjs");
function reachable(map){
 const visited=new Set(),q=[[Math.floor(map.spawn.x),Math.floor(map.spawn.y)]];
 visited.add(q[0].join(","));
 for(let i=0;i<q.length;i++){
  const [x,y]=q[i];
  for(const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0]]){
   const xx=x+dx,yy=y+dy,key=xx+","+yy;
   if(map.tiles[yy]?.[xx]===0&&!visited.has(key)){visited.add(key);q.push([xx,yy]);}
  }
 }
 return visited;
}
test("V6 layout: every visible bridge is collision-passable, every water crossing drawn from same map",()=>{
 for(let level=0;level<3;level++)for(const seed of [0,1,123456789,0xffffffff]){
  const m=makeMapV6(level,seed),seen=reachable(m);
  assert.equal(m.tiles.length,MAP_SIZE);assert.equal(m.coins.length,82);
  assert.ok(seen.has(Math.floor(m.chest.x)+","+Math.floor(m.chest.y)),"chest reachable");
  assert.ok(seen.size>82,"accessible area");
  let bridges=0,wet=0,paths=0;
  for(let y=0;y<MAP_SIZE;y++)for(let x=0;x<MAP_SIZE;x++){
   const t=m.tiles[y][x];
   if(m.water[y][x]){wet++;if(!m.bridge[y][x])assert.equal(t,3);}
   if(m.bridge[y][x]){
    bridges++;assert.equal(t,0);assert.equal(m.water[y][x],true);
    assert.ok(seen.has(x+","+y),"bridge reachable");
   }
   if(m.path[y][x])paths++;
  }
  assert.ok(wet>60&&bridges>=7&&paths>65);
  for(const coin of m.coins){
   const x=Math.floor(coin.x),y=Math.floor(coin.y);
   assert.ok(seen.has(x+","+y));
   assert.equal(m.tiles[y][x],0);
   assert.equal(m.bridge[y][x],false);
  }
 }
});
test("V6 map is deterministic for each seed, different seeds have distinct obstacles",()=>{
 for(let level=0;level<3;level++){
  const a=makeMapV6(level,1234),b=makeMapV6(level,1234),c=makeMapV6(level,2345);
  assert.deepEqual(a,b);assert.notDeepEqual(a.tiles,c.tiles);
 }
});
test("visual render is read-only: map, pickups and score never modified by drawing",()=>{
 const m=makeMapV6(0,123456789),session=createRunSessionV6(0,123456789);
 const before=JSON.stringify(session);
 const g={
  canvas:{width:1200,height:720},set fillStyle(_) {},set strokeStyle(_) {},
  set lineWidth(_) {},imageSmoothingEnabled:false,drawImage(){},fillRect(){},clearRect(){},
  beginPath(){},ellipse(){},fill(){},strokeRect(){}
 };
 const placeholder={};
 const art={
  grass:Array(16).fill(placeholder),water:Array(5).fill(placeholder),
  tree:Array(5).fill(placeholder),rock:Array(4).fill(placeholder),
  bush:Array(4).fill(placeholder),flower:Array(3).fill(placeholder),
  mushroom:placeholder,coin:placeholder,chest:placeholder,hero:placeholder,
  scenery:{cliff:placeholder,lilypad:placeholder,waterfall:placeholder,p:{wood:["#1","#2","#3","#4","#5"]}},
  p:{water:["#1","#2","#3","#4"],grass:["#1","#2","#3","#4"],path:["#1","#2","#3","#4"],leaf:["#1","#2","#3","#4","#5","#6"]}
 };
 drawCohesiveWorld(g,session,art,1200,720,{...m.spawn},2000);
 drawCohesiveMiniMap(g,m,m.spawn);
 assert.equal(JSON.stringify(session),before);
});
test("same 900-tick replay, illegal frame rejection; no score write, payment, auth or remote art fetch",()=>{
 for(let level=0;level<3;level++){
  const run=createRunSessionV6(level,123456789),frames=[];
  for(let t=0;t<MAX_TICKS;t++){
   const frame=[t%11===0?1:0,t%7===0?1:0,t%5===0?1:0];
   advanceRunTick(run,frame);frames.push(frame);
  }
  const result=replayRunV6({level,seed:123456789,frames});
  assert.equal(result.score,run.score);assert.equal(result.coinsCollected,run.coinsCollected);
  assert.equal(result.elapsedMs,MAX_TICKS*TICK_MS);
 }
 assert.match(engine,/ONE canonical map/i);
 assert.match(main,/from "\.\/cohesive-world\.mjs"/);
 assert.match(renderer,/map\.tiles/);
 assert.match(renderer,/map\.bridge/);
 assert.match(renderer,/map\.path/);
 assert.match(renderer,/map\.water/);
 assert.doesNotMatch(renderer,/fetch\s*\(|XMLHttpRequest|WebSocket|new\s+Image\s*\(|drawImage\s*\(\s*reference|\.png|\.jpg|sendBeacon/);
 assert.doesNotMatch(main,/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
});
