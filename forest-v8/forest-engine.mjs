// V8 forest practice simulator. This is offline-only: NEVER authoritative for
// multi-user pickup, real-money purchases, or competitive leaderboard awards.
// Original V1/V6 replay engines are deliberately unchanged for past audit logs.
export const MAP_SIZE=100;
export const TICK_MS=200;
export const MAP_COIN_CAP=200;
export const COIN_RESPAWN_MS=60_000;
export const CHEST_RESPAWN_MS=4*60*60_000;
export const FOREST_SEED=123456789;
export const SERVER_OPTIONS=Object.freeze(["free","vip"]);
export const CHEST_ODDS=Object.freeze([
  Object.freeze({coins:100,weight:500}),
  Object.freeze({coins:500,weight:300}),
  Object.freeze({coins:1000,weight:190}),
  Object.freeze({coins:5000,weight:9}),
  Object.freeze({coins:10000,weight:1})
]);
const SPAWN={x:50.5,y:50.5};
function rng(seed){
 let a=seed>>>0;
 return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function makeGrid(initial=false){return Array.from({length:MAP_SIZE},()=>Array(MAP_SIZE).fill(initial));}
function inside(x,y){return x>=0&&y>=0&&x<MAP_SIZE&&y<MAP_SIZE;}
function road(mask,coords,width=1){
 for(let i=0;i<coords.length-1;i++){
  const [ax,ay]=coords[i],[bx,by]=coords[i+1],steps=Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay))*3);
  for(let j=0;j<=steps;j++){
   const x=Math.round(ax+(bx-ax)*j/Math.max(steps,1)),y=Math.round(ay+(by-ay)*j/Math.max(steps,1));
   for(let dy=-width;dy<=width;dy++)for(let dx=-width;dx<=width;dx++)
    if(inside(x+dx,y+dy))mask[y+dy][x+dx]=true;
  }
 }
}
function shuffle(a,r){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
export function makeForestMap(seed=FOREST_SEED){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error("Invalid forest seed");
 const r=rng(seed),tiles=makeGrid(0),path=makeGrid(),water=makeGrid(),bridge=makeGrid();
 // A broad traversable ring and spokes keep the expanded forest explorable.
 road(path,[[5,5],[23,7],[48,8],[73,6],[94,8],[94,28],[92,51],[94,73],[90,93],[69,92],[48,94],[23,92],[6,94],[7,70],[5,48],[7,23],[5,5]]);
 road(path,[[8,49],[25,49],[40,50],[50,50],[61,50],[76,50],[92,49]]);
 road(path,[[50,7],[50,24],[50,50],[50,75],[50,93]]);
 road(path,[[7,23],[25,26],[50,50],[75,75],[92,92]]);
 road(path,[[7,75],[25,72],[50,50],[74,25],[94,23]]);
 road(path,[[22,8],[23,48],[23,91]]);
 road(path,[[76,7],[76,50],[76,92]]);
 for(let y=1;y<MAP_SIZE-1;y++){
  const center=67+Math.round(5*Math.sin(y*.12)+2*Math.sin(y*.31));
  for(let dx=-1;dx<=1;dx++)if(inside(center+dx,y))water[y][center+dx]=true;
 }
 // Any road over the river is an actual walkable bridge, never a fake overlay.
 for(let y=1;y<MAP_SIZE-1;y++)for(let x=1;x<MAP_SIZE-1;x++){
  if(water[y][x]&&path[y][x]){
   bridge[y][x]=true;
   // cross-river bridges connect both banks in the collision layer
   for(let dx=-4;dx<=4;dx++)if(inside(x+dx,y)){
    path[y][x+dx]=true;
    if(water[y][x+dx])bridge[y][x+dx]=true;
   }
  }
 }
 for(let y=0;y<MAP_SIZE;y++)for(let x=0;x<MAP_SIZE;x++){
  if(!x||!y||x===MAP_SIZE-1||y===MAP_SIZE-1){tiles[y][x]=2;continue;}
  if(water[y][x]&&!bridge[y][x]){tiles[y][x]=3;continue;}
  if(path[y][x]||Math.hypot(x+.5-SPAWN.x,y+.5-SPAWN.y)<5){tiles[y][x]=0;continue;}
  const density=(x<5||y<5||x>94||y>94)?.45:.20;
  const n=r();tiles[y][x]=n<density*.64?1:n<density*.88?2:0;
 }
 // Keep every object reachable from the start, including forest clearings.
 const reachable=makeGrid(),queue=[[Math.floor(SPAWN.x),Math.floor(SPAWN.y)]];
 reachable[50][50]=true;
 for(let i=0;i<queue.length;i++){
  const [x,y]=queue[i];
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const xx=x+dx,yy=y+dy;
   if(inside(xx,yy)&&!reachable[yy][xx]&&tiles[yy][xx]===0){
    reachable[yy][xx]=true;queue.push([xx,yy]);
   }
  }
 }
 const eligible=[];
 for(let y=1;y<MAP_SIZE-1;y++)for(let x=1;x<MAP_SIZE-1;x++)
  if(reachable[y][x]&&!bridge[y][x]&&Math.hypot(x+.5-SPAWN.x,y+.5-SPAWN.y)>6)
   eligible.push({x:x+.5,y:y+.5});
 if(eligible.length<MAP_COIN_CAP+20)throw Error("Not enough reachable forest tiles");
 shuffle(eligible,r);
 const chestCandidates=eligible.filter(c=>Math.hypot(c.x-SPAWN.x,c.y-SPAWN.y)>22);
 const chestSite=chestCandidates[0];
 const coins=eligible.filter(c=>c.x!==chestSite.x||c.y!==chestSite.y)
  .slice(0,MAP_COIN_CAP).map((c,i)=>({...c,id:i,nextTick:0,respawnAt:0}));
 return {tiles,path,water,bridge,coins,
  chest:{...chestSite,claimed:false,respawnAt:0},
  spawn:{...SPAWN},chestSites:chestCandidates,seed};
}
export function selectPracticeReward(slot){
 if(!Number.isInteger(slot)||slot<0||slot>=1000)throw Error("Invalid reward slot");
 for(const reward of CHEST_ODDS){
  if(slot<reward.weight)return reward.coins;
  slot-=reward.weight;
 }
 throw Error("Invalid reward table");
}
export function createForestSession(seed=FOREST_SEED){
 const map=makeForestMap(seed);
 return {map,player:{...map.spawn},score:0,coinsCollected:0,
  chestCollected:0,tick:0,lastReward:null,boosterCoins:false,boosterSpeed:false};
}
function walkable(tiles,x,y){
 const r=.26;
 return [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]].every(([xx,yy])=>{
  const a=Math.floor(xx),b=Math.floor(yy);
  return inside(a,b)&&tiles[b][a]===0;
 });
}
function chestNewSite(map,player,tick){
 const sites=map.chestSites;
 for(let n=0;n<sites.length;n++){
  const c=sites[(tick*13+n*97)%sites.length];
  if(Math.hypot(c.x-player.x,c.y-player.y)>6)return c;
 }
 return sites[0];
}
// Practice-only local simulation. Actual online reward MUST be selected by
// the authenticated server using crypto randomness and an atomic claim.
export function advanceForestTick(session,frame,nowMs=Date.now(),rewardSlot=null){
 if(!session||!session.map||!Number.isInteger(session.tick)||session.tick<0)throw Error("Invalid session");
 if(!Array.isArray(frame)||frame.length!==3
  ||frame.some(n=>!Number.isInteger(n))||![-1,0,1].includes(frame[0])
  ||![-1,0,1].includes(frame[1])||![0,1].includes(frame[2]))throw Error("Invalid frame");
 if(!Number.isFinite(nowMs)||nowMs<0)throw Error("Invalid clock");
 let [dx,dy,collect]=frame;const mag=Math.hypot(dx,dy);
 if(mag>1){dx/=mag;dy/=mag;}
 const step=(3.9*(session.boosterSpeed?2:1)*TICK_MS/1000)/6;
 for(let i=0;i<6;i++){
  if(walkable(session.map.tiles,session.player.x+dx*step,session.player.y))
   session.player.x+=dx*step;
  if(walkable(session.map.tiles,session.player.x,session.player.y+dy*step))
   session.player.y+=dy*step;
 }
 session.tick++;
 const chest=session.map.chest;
 if(chest.claimed&&chest.respawnAt<=nowMs){
  const pos=chestNewSite(session.map,session.player,session.tick);
  chest.x=pos.x;chest.y=pos.y;chest.claimed=false;chest.respawnAt=0;
 }
 let event=null;
 if(collect){
  let closest=null,distance=Infinity;
  for(const coin of session.map.coins){
   if(coin.respawnAt>nowMs)continue;
   const d=Math.hypot(coin.x-session.player.x,coin.y-session.player.y);
   if(d<distance){distance=d;closest=coin;}
  }
  const chestDist=Math.hypot(chest.x-session.player.x,chest.y-session.player.y);
  if(!chest.claimed&&chestDist<.82&&chestDist<=distance){
   // Deterministic offline fallback draw; no live leaderboards or payments.
   const slot=rewardSlot===null?Math.floor(Math.random()*1000):rewardSlot;
   const reward=selectPracticeReward(slot);
   chest.claimed=true;chest.respawnAt=nowMs+CHEST_RESPAWN_MS;
   session.lastReward=reward;session.chestCollected++;session.score+=reward;
   event={type:"chest",coins:reward};
  }else if(closest&&distance<.75){
   closest.respawnAt=nowMs+COIN_RESPAWN_MS;
   session.coinsCollected++;
   const reward=session.boosterCoins?2:1;
   session.score+=reward;event={type:"coin",coins:reward};
  }
 }
 if(!Number.isSafeInteger(session.score))throw Error("Score overflow");
 return event;
}
