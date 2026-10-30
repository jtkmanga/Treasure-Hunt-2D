// Server-side deterministic map; no DOM, random browser state, or network.
export const MAP_SIZE=26, TICK_MS=200, MAX_TICKS=900, COIN_COOLDOWN_TICKS=300;
const LEVEL_SEEDS=[2121,6381,9477];
function rng(seed){
  let a=seed>>>0;
  return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
// V6: one canonical map is used for collision, visible terrain, collectibles,
// roads, streams, bridges AND minimap. There is no screenshot-background layer.
const SPAWN={x:12.5,y:13.5}, SHRINE={x:22.5,y:7.5};
function inside(x,y){return x>=0&&y>=0&&x<MAP_SIZE&&y<MAP_SIZE;}
function grid(value=false){return Array.from({length:MAP_SIZE},()=>Array(MAP_SIZE).fill(value));}
function drawRoad(mask,points,width=0){
 for(let i=0;i<points.length-1;i++){
  const [ax,ay]=points[i],[bx,by]=points[i+1];
  const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay))*4||1;
  for(let j=0;j<=steps;j++){
   const x=Math.round(ax+(bx-ax)*j/steps),y=Math.round(ay+(by-ay)*j/steps);
   for(let dy=-width;dy<=width;dy++)for(let dx=-width;dx<=width;dx++){
    if(inside(x+dx,y+dy))mask[y+dy][x+dx]=true;
   }
  }
 }
}
export function makeMap(level,seed){
 if(!Number.isInteger(level)||level<0||level>=LEVEL_SEEDS.length
   ||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error("Invalid map configuration");
 const r=rng((LEVEL_SEEDS[level]^seed)>>>0),path=grid(),water=grid(),bridge=grid(),tiles=grid(0);
 // A connected network of winding footpaths connects both banks and the shrine.
 for(const points of [
  [[3,2],[10,2],[12,5],[12,9],[12,13],[10,16],[8,19],[6,23]],
  [[3,10],[6,10],[9,12],[12,13],[15,11],[18,10],[22,9],[22,7]],
  [[12,13],[15,15],[18,18],[22,18],[23,23]],
  [[3,17],[6,17],[9,17],[12,13]]
 ])drawRoad(path,points);
 for(let y=1;y<25;y++){
  const center=18+Math.round(Math.sin(y*.51+level*.3)*.9);
  for(let x=center-1;x<=center+1;x++)if(inside(x,y))water[y][x]=true;
 }
 for(let x=1;x<18;x++){
  const y=21+Math.round(Math.sin(x*.52+level*.2)*.9);
  if(inside(x,y))water[y][x]=true;
  if(inside(x,y+1))water[y+1][x]=true;
 }
 // Bridges cross water using WALKABLE (=0) tiles: visuals cannot disagree.
 const bridgeRows=[2,10,18];
 for(const y of bridgeRows){
  for(let x=14;x<=21;x++)if(water[y]?.[x])bridge[y][x]=true;
 }
 for(let y=19;y<=24;y++)if(water[y]?.[8])bridge[y][8]=true;
 // A dry traversable approach on both sides of each bridge.
 for(let y=1;y<25;y++)for(let x=1;x<25;x++){
  const nearHub=Math.hypot(x-SPAWN.x,y-SPAWN.y)<3;
  const shrine=Math.hypot(x-SHRINE.x,y-SHRINE.y)<2.6;
  const protectedArea=nearHub||shrine||path[y][x]||bridge[y][x]
   ||(y===2&&x>=2&&x<=14);
  if(water[y][x]&&!bridge[y][x]){tiles[y][x]=3;continue;}
  if(protectedArea){tiles[y][x]=0;continue;}
  const density=(x<5||x>23||y<5||y>22)?0.36:0.17;
  const n=r();
  tiles[y][x]=n<density*.69?1:n<density*.93?2:0;
 }
 // Cliffs visually follow the river and block travel just like rock cells.
 for(let y=3;y<25;y++){
  for(let x=1;x<25;x++)if(tiles[y][x]===0&&!path[y][x]&&!bridge[y][x]
    &&!water[y][x]&&water[y][x+1]&&r()<.25)tiles[y][x]=2;
 }
 // Boundary is a solid forest/cliff wall.
 for(let n=0;n<MAP_SIZE;n++){
  tiles[0][n]=2;tiles[25][n]=2;tiles[n][0]=2;tiles[n][25]=2;
 }
 // Preserve an old dry boardwalk test coordinate as a safe road tile.
 tiles[2][11]=0;tiles[2][12]=0;
 const coins=[],reachable=grid();
 const queue=[[Math.floor(SPAWN.x),Math.floor(SPAWN.y)]];
 reachable[queue[0][1]][queue[0][0]]=true;
 for(let i=0;i<queue.length;i++){
  const [x,y]=queue[i];
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const xx=x+dx,yy=y+dy;
   if(inside(xx,yy)&&!reachable[yy][xx]&&tiles[yy][xx]===0){
    reachable[yy][xx]=true;queue.push([xx,yy]);
   }
  }
 }
 const sites=[];
 for(let y=1;y<25;y++)for(let x=1;x<25;x++){
  if(!reachable[y][x]||bridge[y][x]
   ||Math.hypot(x+.5-SPAWN.x,y+.5-SPAWN.y)<2
   ||Math.hypot(x+.5-SHRINE.x,y+.5-SHRINE.y)<1.6)continue;
  sites.push([x,y]);
 }
 for(let i=sites.length-1;i>0;i--){
  const j=Math.floor(r()*(i+1));[sites[i],sites[j]]=[sites[j],sites[i]];
 }
 if(sites.length<82)throw Error("Not enough reachable coin slots");
 for(const [x,y] of sites.slice(0,82))coins.push({x:x+.5,y:y+.5,nextTick:0});
 return {tiles,path,water,bridge,coins,chest:{...SHRINE,claimed:false},spawn:{...SPAWN}};
}
function walkable(tiles,x,y){
  const radius=.26,coords=[[x-radius,y-radius],[x+radius,y-radius],[x-radius,y+radius],[x+radius,y+radius]];
  return coords.every(([a,b])=>{const xx=Math.floor(a),yy=Math.floor(b);
    return xx>=0&&xx<MAP_SIZE&&yy>=0&&yy<MAP_SIZE&&tiles[yy][xx]===0;});
}
// The browser's practice client and the scoring backend share this exact
// deterministic state machine. Practice results are NOT proof of human play.
export function createRunSession(level,seed) {
 const map=makeMap(level,seed);
 return {map,player:{...map.spawn},score:0,coinsCollected:0,chestCollected:false,tick:0};
}
export function advanceRunTick(session,frame) {
 if(!session||typeof session!=="object"||!session.map||
    !Number.isInteger(session.tick)||session.tick<0||session.tick>=MAX_TICKS)
    throw Error("Invalid run session");
 if(!Array.isArray(frame)||frame.length!==3
   ||frame.some(n=>!Number.isInteger(n))
   ||![-1,0,1].includes(frame[0])||![-1,0,1].includes(frame[1])
   ||![0,1].includes(frame[2]))throw Error("Invalid movement frame");
 const tick=session.tick, map=session.map,player=session.player;
 let [x,y,collect]=frame;
 const length=Math.hypot(x,y);
 if(length>1){x/=length;y/=length;}
 // Four collision substeps per 200ms; identical in practice and server replay.
 const movement=3.9*(TICK_MS/1000)/4;
 for(let step=0;step<4;step++){
  const dx=x*movement,dy=y*movement;
  if(walkable(map.tiles,player.x+dx,player.y))player.x+=dx;
  if(walkable(map.tiles,player.x,player.y+dy))player.y+=dy;
 }
 session.tick=tick+1;
 if(collect===1){
  let closest=null,dist=Infinity;
  for(const coin of map.coins){
    if(coin.nextTick>tick)continue;
    const d=Math.hypot(coin.x-player.x,coin.y-player.y);
    if(d<dist){closest=coin;dist=d;}
  }
  const chestDistance=Math.hypot(map.chest.x-player.x,map.chest.y-player.y);
  if(!map.chest.claimed&&chestDistance<.82&&chestDistance<=dist){
    map.chest.claimed=true;session.chestCollected=true;session.score+=100;
  }else if(closest&&dist<.75){
    closest.nextTick=tick+COIN_COOLDOWN_TICKS;
    session.coinsCollected++;session.score+=10;
  }
 }
 if(!Number.isSafeInteger(session.score)||session.score>3500)
  throw Error("Invalid score bound");
 return session;
}
export function replayRun({level,seed,frames}){
 if(!Array.isArray(frames)||frames.length<1||frames.length>MAX_TICKS)
  throw Error("Invalid frame count");
 const session=createRunSession(level,seed);
 for(const frame of frames)advanceRunTick(session,frame);
 return {score:session.score,coinsCollected:session.coinsCollected,
  chestCollected:session.chestCollected,elapsedMs:session.tick*TICK_MS,
  finalX:Math.round(session.player.x*1000)/1000,
  finalY:Math.round(session.player.y*1000)/1000};
}
