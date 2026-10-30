
// V14 practice-only playable authored island. All visuals use canonical tiles.
// 0=walkable, 1=ONE trunk collision tile, 2=stone ridge, 3=river.
// Undergrowth and tree crowns are DRAW ONLY; they never block movement.
// No remote imagery, screenshot, DOM state, Math.random or network access.
const ISLAND_SIZE=36;
const N=ISLAND_SIZE;
const SPAWN={x:17.5,y:19.5},SHRINE={x:24.5,y:14.5};
const grid=(v=false)=>Array.from({length:N},()=>Array(N).fill(v));
const inside=(x,y)=>x>0&&y>0&&x<N-1&&y<N-1;
const hash=(x,y,s=0)=>{let v=Math.imul(x+37,374761393)^Math.imul(y+79,668265263)^Math.imul(s+11,1442695041);v=Math.imul(v^(v>>>13),1274126177);return(v^(v>>>16))>>>0;};
const points={
  center:[[17,19],[20,17],[22,16],[24,14]],
  north:[[17,19],[14,15],[12,12],[9,12],[5,11]],
  west:[[17,19],[14,21],[11,22],[8,22],[4,23]],
  east:[[17,19],[21,19],[27,20],[31,20]],
  south:[[17,19],[17,23],[15,26],[15,32]],
  upper:[[24,14],[22,11],[20,7],[15,7],[10,7],[5,7]],
  altar:[[24,14],[28,12],[31,12]],
  low:[[17,24],[23,25],[28,27],[32,27]]
};
function trace(mask,route,rad=0){
 for(let i=0;i<route.length-1;i++){
  const [ax,ay]=route[i],[bx,by]=route[i+1];
  const steps=Math.ceil(Math.hypot(bx-ax,by-ay)*6);
  for(let j=0;j<=steps;j++){
   const x=Math.round(ax+(bx-ax)*j/steps),y=Math.round(ay+(by-ay)*j/steps);
   for(let yy=-rad;yy<=rad;yy++)for(let xx=-rad;xx<=rad;xx++)if(inside(x+xx,y+yy))mask[y+yy][x+xx]=true;
  }
 }
}
function makeIslandMapV14(level,seed){
 if(!Number.isInteger(level)||level<0||level>2||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid V14 map seed/level');
 const tiles=grid(0),water=grid(),bridge=grid(),path=grid(),elevation=grid(0),undergrowth=grid(0);
 // Winding western brook and eastern gorge and a lower channel. All are
 // real impassable water cells except deliberate bridge tiles.
 for(let y=2;y<N-2;y++){
  const left=8+Math.sin(y*.37+level*.19)*1.5+Math.sin(y*.11)*.7;
  const right=29+Math.sin(y*.31+level*.25)*1.1;
  for(let x=1;x<N-1;x++){
   if(Math.abs(x-left)<1.45||Math.abs(x-right)<1.45)water[y][x]=true;
  }
 }
 for(let x=7;x<31;x++){
  const y=26+Math.sin(x*.32)*.95;
  for(let j=1;j<N-1;j++)if(Math.abs(j-y)<1.1)water[j][x]=true;
 }
 // These bridges are actual collision-0 tiles across matching river channels.
 for(const y of [7,12,22])for(let x=4;x<=13;x++)if(water[y][x])bridge[y][x]=true;
 for(const y of [12,20,27])for(let x=24;x<=33;x++)if(water[y][x])bridge[y][x]=true;
 for(const x of [15,23])for(let y=23;y<=29;y++)if(water[y][x])bridge[y][x]=true;
 for(const route of Object.values(points))trace(path,route);
 // Guarantee connective roads to all actual bridges, not merely painted planks.
 for(const y of [7,12,22])trace(path,[[3,y],[14,y]]);
 for(const y of [12,20,27])trace(path,[[23,y],[33,y]]);
 for(const x of [15,23])trace(path,[[x,23],[x,30]]);
 // Shrine terrace occupies genuinely walkable area, stone rim is genuinely blocked.
 for(let y=9;y<=16;y++)for(let x=20;x<=27;x++)elevation[y][x]=1;
 for(let x=20;x<=27;x++)if(x!==24)tiles[16][x]=2;
 // Fixed authored grove clusters with lighter edge foliage, no full-screen tree grid.
 const groves=[[3,5,4],[14,5,3],[19,4,3],[32,6,3],[4,17,4],[12,17,2.6],[32,16,2.5],[4,31,3],[21,32,3],[32,32,3]];
 for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
  if(water[y][x]){tiles[y][x]=bridge[y][x]?0:3;continue;}
  if(tiles[y][x]===2)continue;
  const protectedArea=path[y][x]||Math.hypot(x+.5-SPAWN.x,y+.5-SPAWN.y)<3||Math.hypot(x+.5-SHRINE.x,y+.5-SHRINE.y)<3;
  if(protectedArea)continue;
  let grove=0;
  for(const [cx,cy,r] of groves)grove=Math.max(grove,Math.max(0,1-Math.hypot(x-cx,y-cy)/r));
  const n=hash(x,y,seed^level*131),chance=(n%1000)/1000;
  // Place exactly one collision cell at each actual tree trunk. The canopy
  // extends visually over neighboring walkable cells, but those cells remain 0.
  // Thin nearby anchors so the forest reads as a grove, not a wall of tiles.
  const forestDensity=grove*.94+.07;
  if(chance<forestDensity){
   let adjacentTrunk=false;
   for(let dy=-1;dy<=1&&!adjacentTrunk;dy++)
    for(let dx=-1;dx<=1;dx++)if(tiles[y+dy]?.[x+dx]===1){adjacentTrunk=true;break;}
   if(!adjacentTrunk&&hash(x,y,seed+703)%100<76){tiles[y][x]=1;continue;}
   // Small bushes/ferns and flowers are cosmetic. Their whole cell stays walkable.
   const detail=hash(x,y,seed+1039)%100;
   if(detail<30)undergrowth[y][x]=1;
   else if(detail<37)undergrowth[y][x]=2;
   continue;
  }
  const nearRiver=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>water[y+dy]?.[x+dx]);
  if((nearRiver&&chance>.66)||chance>.981){tiles[y][x]=2;}
 }
 // Protected temple stair and visitor route, with actual walkable gap in rim.
 for(let y=16;y<=18;y++)for(const x of [23,24]){tiles[y][x]=0;path[y][x]=true;}
 tiles[14][24]=0;tiles[19][17]=0;
 for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(x===0||y===0||x===N-1||y===N-1)tiles[y][x]=2;
 // Validate every reachable pickup position with a 4-neighbor BFS from spawn.
 const visited=grid(),queue=[[Math.floor(SPAWN.x),Math.floor(SPAWN.y)]];
 visited[queue[0][1]][queue[0][0]]=true;
 for(let i=0;i<queue.length;i++){
  const [x,y]=queue[i];
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const xx=x+dx,yy=y+dy;
   if(inside(xx,yy)&&!visited[yy][xx]&&tiles[yy][xx]===0){visited[yy][xx]=true;queue.push([xx,yy]);}
  }
 }
 if(!visited[Math.floor(SHRINE.y)][Math.floor(SHRINE.x)])throw Error('V14 shrine unreachable');
 const candidates=[];
 for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
  if(!visited[y][x]||bridge[y][x]||Math.hypot(x+.5-SPAWN.x,y+.5-SPAWN.y)<2||Math.hypot(x+.5-SHRINE.x,y+.5-SHRINE.y)<1.8)continue;
  candidates.push({x:x+.5,y:y+.5,key:hash(x,y,seed^level*131+907)});
 }
 candidates.sort((a,b)=>a.key-b.key);
 if(candidates.length<25)throw Error('V14 fewer than 25 reachable coin positions');
 const coins=candidates.slice(0,25).map(({x,y})=>({x,y,nextTick:0}));
 const features={
  shrine:{x:24.5,y:14.5}, stairs:[[24,16],[24,17],[24,18]],
  waterfalls:[[8,17],[9,25],[29,18]],
  ruins:[[20,13],[27,13],[22,11]],
  fences:[[20,17],[21,17],[27,17],[28,17],[11,11],[13,11]],
  props:[[17,16,'sign'],[21,13,'barrel'],[26,12,'crate'],[18,23,'stump'],[13,18,'stump'],[26,18,'sign'],[15,24,'log']],
  lily:[[8,18],[9,20],[29,18],[29,23],[16,29]],
  critters:[[14.5,18.5],[26.5,18.5]]
 };
 // Waterfalls and lily pads must be grounded on real river tiles, never float on grass.
 for(const arr of [features.waterfalls,features.lily])for(const spot of arr){
  const [x,y]=spot;
  if(water[y]?.[x]&&!bridge[y][x])continue;
  const matches=[];
  for(let dx=-3;dx<=3;dx++){
   const xx=x+dx;
   if(water[y]?.[xx]&&!bridge[y][xx])matches.push(xx);
  }
  if(matches.length)spot[0]=matches.sort((a,b)=>Math.abs(a-x)-Math.abs(b-x))[0];
 }
 return {version:15,tiles,path,water,bridge,elevation,undergrowth,features,coins,chest:{...SHRINE,claimed:false},spawn:{...SPAWN}};
}

export {ISLAND_SIZE,makeIslandMapV14};
