
// Forest expansion from original V16 island: preserves the exact central island
// terrain, collisions, shrine and decorative props, extending all directions.
// Offline preview only; online shared pickups require an authoritative server.
import {makeIslandMapV14} from "./island-map-v14.mjs";
const FOREST_SIZE=100;
const N=FOREST_SIZE,SHIFT=32;
const grid=(v=false)=>Array.from({length:N},()=>Array(N).fill(v));
const hash=(x,y,s=0)=>{let v=Math.imul(x+37,374761393)^Math.imul(y+79,668265263)^Math.imul(s+11,1442695041);v=Math.imul(v^(v>>>13),1274126177);return(v^(v>>>16))>>>0;};
const inside=(x,y)=>x>0&&y>0&&x<N-1&&y<N-1;
function trace(mask,route,width=1){
 for(let i=0;i<route.length-1;i++){
  const [ax,ay]=route[i],[bx,by]=route[i+1];
  const steps=Math.ceil(Math.hypot(bx-ax,by-ay)*5);
  for(let j=0;j<=steps;j++){
   const x=Math.round(ax+(bx-ax)*j/steps),y=Math.round(ay+(by-ay)*j/steps);
   for(let dy=-width;dy<=width;dy++)for(let dx=-width;dx<=width;dx++)
    if(inside(x+dx,y+dy))mask[y+dy][x+dx]=true;
  }
 }
}
function makeForestMapV17(seed=123456789){
 const base=makeIslandMapV14(0,seed),tiles=grid(0),water=grid(),bridge=grid(),path=grid(),elevation=grid(0),undergrowth=grid(0);
 // Keep every V16 inner tile except the old hard map edge, so the visual
 // content near the original start and shrine is recognizable and identical.
 const central=(x,y)=>x>=33&&x<=66&&y>=33&&y<=66;
 for(let y=1;y<35;y++)for(let x=1;x<35;x++){
  const X=x+SHIFT,Y=y+SHIFT;
  for(const key of ['tiles','water','bridge','path','elevation','undergrowth']){
   ({tiles,water,bridge,path,elevation,undergrowth})[key][Y][X]=base[key][y][x];
  }
 }
 // Seamless larger forest, without copying or repeating the central landscape.
 // Rivers in outer exploration follow natural curves, with walkable bridges.
 for(let y=2;y<N-2;y++)for(let x=2;x<N-2;x++){
  if(central(x,y))continue;
  const river1=18+3.2*Math.sin(y*.13)+1.4*Math.sin(y*.31);
  const river2=83+3.1*Math.sin(y*.11+.7);
  if(Math.abs(x-river1)<1.25||Math.abs(x-river2)<1.3)water[y][x]=true;
  if(y>73&&y<82&&x>24&&x<77&&Math.abs(y-(77+2*Math.sin(x*.17)))<1.05)water[y][x]=true;
 }
 const sp={x:base.spawn.x+SHIFT,y:base.spawn.y+SHIFT};
 const sh={x:base.chest.x+SHIFT,y:base.chest.y+SHIFT};
 const routes=[
  [[4,5],[23,7],[49,7],[75,7],[94,7],[94,28],[93,50],[94,73],[93,94],[74,93],[51,94],[26,92],[6,94],[6,70],[6,51],[5,27],[4,5]],
  [[50,7],[49,20],[49,34]],[[49,65],[50,79],[51,94]],
  [[6,51],[22,51],[33,51]],[[66,51],[79,50],[93,50]],
  [[6,27],[20,27],[33,43]],[[66,43],[80,27],[94,27]],
  [[6,73],[23,73],[42,66]],[[60,66],[77,74],[94,73]],
  [[23,8],[23,27],[23,49],[23,72],[26,92]],
  [[77,7],[77,27],[77,50],[77,72],[74,93]],
  [[36,33],[36,23],[23,23]],[[63,33],[64,23],[77,23]],
  [[33,60],[23,60]],[[66,60],[77,60]],
 ];
 // Roads are added ONLY in the expanded area. Preserve original V16 paths
 // inside the island so nearby scenery and movement remain familiar.
 for(const route of routes){
  const mask=grid();trace(mask,route,1);
  for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++)if(!central(x,y)&&mask[y][x])path[y][x]=true;
 }
 // Make complete crossing strips where a road meets a river, including landings.
 for(let y=2;y<N-2;y++)for(let x=2;x<N-2;x++){
  if(central(x,y)||!water[y][x]||!path[y][x])continue;
  bridge[y][x]=true;
  for(let dx=-3;dx<=3;dx++){
   const X=x+dx;if(!inside(X,y)||central(X,y))continue;
   path[y][X]=true;if(water[y][X])bridge[y][X]=true;
  }
 }
 // Stable single-cell trunk collision, passable bushes, and protected roads.
 for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
  if(central(x,y))continue;
  if(water[y][x]&&!bridge[y][x]){tiles[y][x]=3;continue;}
  if(path[y][x]||Math.hypot(x+.5-sp.x,y+.5-sp.y)<4){tiles[y][x]=0;continue;}
  const z=hash(x,y,seed),v=z%1000/1000;
  const grove=(Math.sin(x*.18+y*.11)*.5+.5)*.30+.04;
  const trunk=v<grove;
  const touching=tiles[y-1]?.[x]===1||tiles[y]?.[x-1]===1||tiles[y-1]?.[x-1]===1;
  if(trunk&&!touching){tiles[y][x]=1;continue;}
  if(v>.976){tiles[y][x]=2;continue;}
  if(z%11===0)undergrowth[y][x]=1;else if(z%37===0)undergrowth[y][x]=2;
 }
 for(let a=0;a<N;a++){tiles[0][a]=2;tiles[N-1][a]=2;tiles[a][0]=2;tiles[a][N-1]=2;}
 // Ensure transitions into original 36x36 without preserving old border walls.
 for(const [x,y] of [[32,51],[33,51],[34,51],[66,51],[67,51],[68,51],[49,32],[49,33],[49,34],[49,65],[49,66],[49,67]]){
  tiles[y][x]=0;path[y][x]=true;water[y][x]=false;bridge[y][x]=false;
 }
 // Spawn-reachability filters every coin. Exactly 200 at any instant.
 const visited=grid(),queue=[[Math.floor(sp.x),Math.floor(sp.y)]];
 visited[queue[0][1]][queue[0][0]]=true;
 for(let i=0;i<queue.length;i++){
  const [x,y]=queue[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const X=x+dx,Y=y+dy;
   if(inside(X,Y)&&!visited[Y][X]&&tiles[Y][X]===0){visited[Y][X]=true;queue.push([X,Y]);}
  }
 }
 const candidates=[];
 for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
  if(!visited[y][x]||bridge[y][x]||Math.hypot(x+.5-sp.x,y+.5-sp.y)<3||Math.hypot(x+.5-sh.x,y+.5-sh.y)<3)continue;
  candidates.push({x:x+.5,y:y+.5,key:hash(x,y,seed^1777)});
 }
 candidates.sort((a,b)=>a.key-b.key);
 if(candidates.length<220)throw Error('Forest: too few reachable coin sites');
 const coins=candidates.slice(0,200).map((c,i)=>({id:i,x:c.x,y:c.y,nextTick:0}));
 const offsetPoint=([x,y,...rest])=>[x+SHIFT,y+SHIFT,...rest];
 const old=base.features;
 const features={
  shrine:{x:sh.x,y:sh.y},
  stairs:old.stairs.map(offsetPoint),waterfalls:old.waterfalls.map(offsetPoint),
  ruins:old.ruins.map(offsetPoint),fences:old.fences.map(offsetPoint),
  props:old.props.map(offsetPoint),lily:old.lily.map(offsetPoint),
  critters:old.critters.map(offsetPoint)
 };
 // More landmarks across the broad outer forest, not a second Lucky Box.
 for(const [x,y] of [[24,15],[70,9],[89,39],[17,65],[74,87],[37,89],[12,31]])
  if(tiles[y][x]===0)features.props.push([x,y,'sign']);
 const chestSites=candidates.filter(c=>Math.hypot(c.x-sp.x,c.y-sp.y)>10).map(c=>({x:c.x,y:c.y}));
 return {version:17,tiles,water,bridge,path,elevation,undergrowth,features,coins,
  chest:{x:sh.x,y:sh.y,claimed:false,respawnAt:0},spawn:sp,chestSites,seed};
}

export {FOREST_SIZE,makeForestMapV17};
