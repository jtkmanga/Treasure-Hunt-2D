// Server-side deterministic map; no DOM, random browser state, or network.
export const MAP_SIZE=26, TICK_MS=200, MAX_TICKS=900, COIN_COOLDOWN_TICKS=300;
const LEVEL_SEEDS=[2121,6381,9477];
function rng(seed){
  let a=seed>>>0;
  return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function makeMap(level,seed){
  if(!Number.isInteger(level)||level<0||level>=LEVEL_SEEDS.length
    ||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error("Invalid map configuration");
  const r=rng((LEVEL_SEEDS[level]^seed)>>>0), tiles=[],coins=[];
  for(let y=0;y<MAP_SIZE;y++){
    const row=[];
    for(let x=0;x<MAP_SIZE;x++){
      const safe=(Math.abs(x-2)<3&&Math.abs(y-2)<3)
        ||(Math.abs(x-23)<3&&Math.abs(y-23)<3)
        ||(y===2&&x>=2&&x<=23)||(x===23&&y>=2&&y<=23);
      const n=r(),edge=x===0||y===0||x===MAP_SIZE-1||y===MAP_SIZE-1;
      row.push(edge?2:safe?0:n<.105?1:n<.165?2:n<.205?3:0);
    }
    tiles.push(row);
  }
  let attempts=0;
  while(coins.length<82&&attempts++<4000){
    const x=1+Math.floor(r()*(MAP_SIZE-2)),y=1+Math.floor(r()*(MAP_SIZE-2));
    if(tiles[y][x]||Math.hypot(x-2.5,y-2.5)<2
      ||Math.hypot(x-23.5,y-23.5)<1.5
      ||coins.some(c=>c.x===x+.5&&c.y===y+.5))continue;
    coins.push({x:x+.5,y:y+.5,nextTick:0});
  }
  return {tiles,coins,chest:{x:23.5,y:23.5,claimed:false},spawn:{x:2.5,y:2.5}};
}
function walkable(tiles,x,y){
  const radius=.26,coords=[[x-radius,y-radius],[x+radius,y-radius],[x-radius,y+radius],[x+radius,y+radius]];
  return coords.every(([a,b])=>{const xx=Math.floor(a),yy=Math.floor(b);
    return xx>=0&&xx<MAP_SIZE&&yy>=0&&yy<MAP_SIZE&&tiles[yy][xx]===0;});
}
export function replayRun({level,seed,frames}){
  if(!Array.isArray(frames)||frames.length<1||frames.length>MAX_TICKS)
    throw Error("Invalid frame count");
  const map=makeMap(level,seed);
  let player={...map.spawn},score=0,coinsCollected=0,chestCollected=false;
  for(let tick=0;tick<frames.length;tick++){
    const frame=frames[tick];
    if(!Array.isArray(frame)||frame.length!==3
      ||frame.some(n=>!Number.isInteger(n))
      ||![-1,0,1].includes(frame[0])||![-1,0,1].includes(frame[1])
      ||![0,1].includes(frame[2]))throw Error("Invalid movement frame");
    let [x,y,collect]=frame;
    const length=Math.hypot(x,y);
    if(length>1){x/=length;y/=length;}
    // Four collision substeps per 200 ms prevent jumping through one-cell walls.
    const movement=3.9*(TICK_MS/1000)/4;
    for(let step=0;step<4;step++){
      const dx=x*movement,dy=y*movement;
      if(walkable(map.tiles,player.x+dx,player.y))player.x+=dx;
      if(walkable(map.tiles,player.x,player.y+dy))player.y+=dy;
    }
    if(collect!==1)continue;
    let closest=null,dist=Infinity;
    for(const coin of map.coins){
      if(coin.nextTick>tick)continue;
      const d=Math.hypot(coin.x-player.x,coin.y-player.y);
      if(d<dist){closest=coin;dist=d;}
    }
    const chestDistance=Math.hypot(map.chest.x-player.x,map.chest.y-player.y);
    if(!map.chest.claimed&&chestDistance<.82&&chestDistance<=dist){
      map.chest.claimed=true;chestCollected=true;score+=100;
    }else if(closest&&dist<.75){
      closest.nextTick=tick+COIN_COOLDOWN_TICKS;
      coinsCollected++;score+=10;
    }
  }
  // This is a simulation-bounded score, not proof a human played the controls.
  if(!Number.isSafeInteger(score)||score>3500)throw Error("Invalid score bound");
  return {score,coinsCollected,chestCollected,elapsedMs:frames.length*TICK_MS,
    finalX:Math.round(player.x*1000)/1000,finalY:Math.round(player.y*1000)/1000};
}
