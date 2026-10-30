import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 MAP_SIZE,MAP_COIN_CAP,COIN_RESPAWN_MS,CHEST_RESPAWN_MS,TICK_MS,SERVER_OPTIONS,
 CHEST_ODDS,makeForestMap,createForestSession,advanceForestTick,selectPracticeReward
} from "../forest-v8/forest-engine.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
function flood(map){
 const visited=new Set(),q=[[Math.floor(map.spawn.x),Math.floor(map.spawn.y)]];
 visited.add(q[0].join(","));
 for(let k=0;k<q.length;k++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const [x,y]=q[k],a=x+dx,b=y+dy,key=a+","+b;
  if(map.tiles[b]?.[a]===0&&!visited.has(key)){visited.add(key);q.push([a,b]);}
 }
 return visited;
}
test("only one 100x100 forest, two server choices, 200 reachable coins",()=>{
 assert.equal(MAP_SIZE,100);assert.equal(MAP_COIN_CAP,200);
 assert.deepEqual(SERVER_OPTIONS,["free","vip"]);
 for(const seed of [0,1,123456789,4294967295]){
  const a=makeForestMap(seed),b=makeForestMap(seed);
  assert.deepEqual(a,b);
  assert.equal(a.tiles.length,100);
  assert.equal(a.tiles[0].length,100);
  assert.equal(a.coins.length,200);
  const seen=flood(a);
  assert.ok(seen.size>2000);
  for(const c of [...a.coins,a.chest]){
   assert.equal(a.tiles[Math.floor(c.y)][Math.floor(c.x)],0);
   assert.ok(seen.has(Math.floor(c.x)+","+Math.floor(c.y)),"collectible reachable");
  }
  for(let y=0;y<100;y++)for(let x=0;x<100;x++)
   if(a.bridge[y][x])assert.equal(a.tiles[y][x],0,"bridge walkable");
 }
});
test("exact Lucky Box reward slots match 50%,30%,19%,0.9%,0.1%",()=>{
 const counts=new Map();
 for(let i=0;i<1000;i++){
  const reward=selectPracticeReward(i);
  counts.set(reward,(counts.get(reward)||0)+1);
 }
 assert.deepEqual([...counts],[[100,500],[500,300],[1000,190],[5000,9],[10000,1]]);
 assert.equal(CHEST_ODDS.reduce((sum,x)=>sum+x.weight,0),1000);
 assert.throws(()=>selectPracticeReward(-1));assert.throws(()=>selectPracticeReward(1000));
});
test("map coin is one leaderboard coin and respawns after exactly 60s",()=>{
 const s=createForestSession(45),c=s.map.coins[0],now=1_000_000;
 s.player={x:c.x,y:c.y};
 assert.deepEqual(advanceForestTick(s,[0,0,1],now),{type:"coin",coins:1});
 assert.equal(s.score,1);assert.equal(s.coinsCollected,1);
 assert.equal(c.respawnAt,now+COIN_RESPAWN_MS);
 assert.equal(advanceForestTick(s,[0,0,1],now+1),null);
 assert.equal(s.score,1);
 assert.deepEqual(advanceForestTick(s,[0,0,1],now+COIN_RESPAWN_MS),{type:"coin",coins:1});
 assert.equal(s.score,2);
});
test("chest grants selected reward once, waits 4h, respawns far from player",()=>{
 const s=createForestSession(45),now=1_000_000;
 s.player={x:s.map.chest.x,y:s.map.chest.y};
 assert.deepEqual(advanceForestTick(s,[0,0,1],now,999),{type:"chest",coins:10000});
 assert.equal(s.score,10000);assert.equal(s.map.chest.claimed,true);
 assert.equal(s.map.chest.respawnAt,now+CHEST_RESPAWN_MS);
 assert.equal(advanceForestTick(s,[0,0,1],now+1000,999),null);
 assert.equal(s.score,10000);
 advanceForestTick(s,[0,0,0],now+CHEST_RESPAWN_MS,999);
 assert.equal(s.map.chest.claimed,false);
 assert.ok(Math.hypot(s.map.chest.x-s.player.x,s.map.chest.y-s.player.y)>6);
});
test("session never ends at 900 ticks; invalid instructions cannot mutate state",()=>{
 const s=createForestSession(9);
 for(let i=0;i<1000;i++)advanceForestTick(s,[0,0,0],1_000_000+i*TICK_MS);
 assert.equal(s.tick,1000);
 assert.throws(()=>advanceForestTick(s,[2,0,0],1_000_000));
 assert.equal(s.tick,1000);
});
test("V8 has no real purchases, score writes or timed stage; V7 assets preserved",()=>{
 const html=read("../forest-v8/index.html"),main=read("../forest-v8/main.mjs");
 const renderer=read("../forest-v8/cohesive-world.mjs"),art=read("../forest-v8/pixel-art.mjs");
 for(const id of ["serverSelect","score","time","world","mini","shop-open","reward-panel","leaderboard-open"]){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.doesNotMatch(html,/เริ่มฝึก 3 นาที|levelSelect|วิหารโบราณ|ถ้ำทองคำ/);
 assert.match(main,/advanceForestTick\(session,frame,Date\.now\(\)\)/);
 assert.doesNotMatch(main,/MAX_TICKS|deadline|endRun\(|frameLog/);
 assert.doesNotMatch(main,/fetch\s*\(|WebSocket|localStorage|sendBeacon/);
 assert.match(renderer,/coin\.respawnAt>Date\.now\(\)/);
 assert.match(art,/createPixelArt/);
 assert.match(html,/20 บาท/);
 assert.match(html,/10 บาท/);
 assert.match(html,/24 ชั่วโมง/);
 assert.match(html,/ยังไม่เปิดขาย/);
});
