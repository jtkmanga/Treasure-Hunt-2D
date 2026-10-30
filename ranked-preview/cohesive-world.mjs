// V6: ONE coherent tile world. No image screenshots, compositing halves,
// remote textures, or visual bridges over collision-water.
// Every surface is drawn from server-shared map.tiles/path/water/bridge.
import {TILE_SIZE} from "./pixel-art.mjs";
const T=TILE_SIZE;
const H=(x,y,s=0)=>{let v=Math.imul(x+71,374761393)^Math.imul(y+139,668265263)^Math.imul(s+7,1442695041);v=Math.imul(v^(v>>>13),1274126177);return (v^(v>>>16))>>>0;};
const cell=(a,x,y)=>a?.[y]?.[x]??false;
function drawImage(g,img,x,y,w,h){g.drawImage(img,Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
function rect(g,x,y,w,h,color){g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
function terrainTile(g,map,art,x,y,sx,sy,now){
 const tile=map.tiles[y]?.[x],seed=H(x,y,17);
 const inside=tile!==undefined;
 const wet=inside&&cell(map.water,x,y);
 const bridged=inside&&cell(map.bridge,x,y);
 const road=inside&&cell(map.path,x,y);
 const wild=!inside;
 const terrain=wet?art.water[seed%art.water.length]:art.grass[seed%art.grass.length];
 drawImage(g,terrain,sx,sy,T+1,T+1);
 if(wet){
  // Preserve continuous river water even under traversable wooden bridges.
  if(!bridged){
   const moving=Math.floor(now/240),n=H(x,y,moving);
   const c=art.p.water;
   rect(g,sx+3+(n%17),sy+9+(n>>>5)%25,9,2,c[2]);
   rect(g,sx+8,sy+3+(n>>>7)%33,7,1,c[3]);
  }
  const north=cell(map.water,x,y-1),south=cell(map.water,x,y+1);
  const west=cell(map.water,x-1,y),east=cell(map.water,x+1,y);
  const foam=art.p.water[3];
  if(!west)rect(g,sx,sy,3,T,foam);
  if(!east)rect(g,sx+T-3,sy,3,T,foam);
  if(!north)rect(g,sx,sy, T,2,"#8ebea4");
  if(!south)rect(g,sx,sy+T-3,T,3,foam);
 }
 if(road&&!wet&&tile===0){
  // Neighbor-aware dirt road surface: continuous through adjacent path tiles,
  // with natural grass on the outer banks. Never a separate image collage.
  const n=cell(map.path,x,y-1),s=cell(map.path,x,y+1);
  const w=cell(map.path,x-1,y),e=cell(map.path,x+1,y);
  const dirt=art.p.path,variant=seed%4;
  const pad=8+seed%4;
  const left=w?0:pad,right=e?T:T-pad,top=n?0:pad,bottom=s?T:T-pad;
  rect(g,sx+left,sy+top,right-left,bottom-top,dirt[variant]);
  for(let i=0;i<17;i++){
   const k=H(x*19+i,y*23+i,10);
   const px=left+(k%Math.max(1,right-left)),py=top+((k>>>7)%Math.max(1,bottom-top));
   rect(g,sx+px,sy+py,1+k%3,1,dirt[(k>>>10)%4]);
  }
  for(let i=0;i<7;i++){
   const k=H(x*8+i,y*9-i,9);
   const py=(k>>>9)%T;
   if(!w)rect(g,sx+left-2+(k%4),sy+py,3,2,art.p.grass[3]);
   if(!e)rect(g,sx+right-2-(k%3),sy+py,3,2,art.p.grass[2]);
  }
 }
 // Boundary beyond 26x26 is matching forest, not an imported pixel-art panel.
 if(wild&&seed%11===0)drawImage(g,art.bush[seed%art.bush.length],sx+T*.15,sy+T*.39,T*.65,T*.44);
}
function bridgePiece(g,map,art,x,y,sx,sy){
 if(!cell(map.bridge,x,y))return;
 const p=art.scenery.p.wood;
 const horizontal=cell(map.bridge,x-1,y)||cell(map.bridge,x+1,y);
 // Crossing is actually tile 0 in the map shared with collision logic.
 if(horizontal){
  rect(g,sx,sy+T*.2,T+1,T*.62,p[0]);
  for(let i=0;i<6;i++){
   rect(g,sx+i*T/6,sy+T*.24,T/6-1,T*.54,p[2]);
   rect(g,sx+i*T/6+2,sy+T*.27,2,T*.42,p[3]);
  }
  rect(g,sx,sy+T*.16,T+1,3,p[3]);
  rect(g,sx,sy+T*.8,T+1,3,p[1]);
  if(!cell(map.bridge,x-1,y)){
   rect(g,sx,sy+T*.02,5,T*.92,p[1]);
   rect(g,sx+1,sy,3,6,p[4]);
  }
  if(!cell(map.bridge,x+1,y)){
   rect(g,sx+T-5,sy+T*.02,5,T*.92,p[1]);
   rect(g,sx+T-4,sy,3,6,p[4]);
  }
 }else{
  rect(g,sx+T*.2,sy,T*.6,T+1,p[0]);
  for(let i=0;i<6;i++){
   rect(g,sx+T*.25,sy+i*T/6,T*.49,T/6-1,p[2]);
   rect(g,sx+T*.28,sy+i*T/6+2,T*.43,2,p[4]);
  }
  rect(g,sx+T*.16,sy,3,T+1,p[3]);
  rect(g,sx+T*.82,sy,3,T+1,p[1]);
 }
}
function obstacle(g,map,art,x,y,sx,sy){
 const tile=map.tiles[y]?.[x],seed=H(x,y);
 if(tile===1){
  // Tree trunk = blocked tile. Canopy is tall, rendered in proper y-order.
  drawImage(g,art.tree[seed%art.tree.length],sx-T*.53,sy-T*1.18,T*2.08,T*2.15);
 }else if(tile===2){
  const touchesWater=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>cell(map.water,x+dx,y+dy));
  if(touchesWater){
   drawImage(g,art.scenery.cliff,sx,sy-T*.15,T+1,T*1.14);
   rect(g,sx+T*.12,sy+T*.08,T*.14,2,"#b6b8a3");
  }else{
   drawImage(g,art.rock[seed%art.rock.length],sx+T*.05,sy+T*.1,T*.9,T*.92);
  }
 }else if(tile===0&&!cell(map.bridge,x,y)){
  // Small decorative flora never changes the movement map, unlike fake walls.
  if(seed%16===0)drawImage(g,art.flower[seed%art.flower.length],sx+T*.17,sy+T*.45,T*.35,T*.36);
  if(seed%27===0&&!cell(map.path,x,y))drawImage(g,art.bush[seed%art.bush.length],sx+T*.17,sy+T*.49,T*.56,T*.42);
  if(seed%41===0)drawImage(g,art.mushroom,sx+T*.62,sy+T*.52,T*.29,T*.32);
 }else if(tile===3){
  if(seed%8===0)drawImage(g,art.scenery.lilypad,sx+T*.29,sy+T*.41,T*.47,T*.36);
  if(seed%27===0&&map.tiles[y-1]?.[x]===2){
   const bob=Math.floor(Date.now()/180)%5;
   drawImage(g,art.scenery.waterfall,sx+T*.33,sy+bob,T*.43,T*.83);
  }
 }else if(tile===undefined){
  // Beyond the border: keep decorative foliage consistent with the same scene.
  if(seed%7<5)drawImage(g,art.tree[seed%art.tree.length],sx-T*.53,sy-T*1.18,T*2.08,T*2.15);
 }
}
function shrineProps(g,map,art,cameraX,cameraY,now){
 const c=map.chest,sx=c.x*T-cameraX,sy=c.y*T-cameraY;
 if(sx< -100||sy< -110||sx>g.canvas.width*2||sy>g.canvas.height*2)return;
 // Small glowing ground halo and torches, decoration only.
 g.fillStyle="#ffb93b38";g.beginPath();g.ellipse(sx,sy-7,T*.85,T*.45,0,0,Math.PI*2);g.fill();
 const flame=(x,y)=>{const pulse=2+Math.floor(Math.sin(now*.009+x)*1.5);
  rect(g,x-3,y-7,6,11,"#5d3821");rect(g,x-2,y-14-pulse,4,9+pulse,"#ffb737");rect(g,x-1,y-12-pulse,2,8+pulse,"#fff9aa");};
 flame(sx-T*.72,sy-T*.33);flame(sx+T*.72,sy-T*.33);
}
export function drawCohesiveWorld(g,session,art,width,height,display,now=0){
 const map=session.map,cameraX=display.x*T-width/2,cameraY=display.y*T-height/2;
 const left=Math.floor(cameraX/T)-2,right=Math.ceil((cameraX+width)/T)+2;
 const top=Math.floor(cameraY/T)-3,bottom=Math.ceil((cameraY+height)/T)+2;
 g.imageSmoothingEnabled=false;
 rect(g,0,0,width,height,"#285d40");
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)
  terrainTile(g,map,art,x,y,x*T-cameraX,y*T-cameraY,now);
 // Every bridge is a genuinely traversable collision-0 tile over a wet tile.
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)
  if(cell(map.bridge,x,y))bridgePiece(g,map,art,x,y,x*T-cameraX,y*T-cameraY);
 const coinsByRow=new Map();
 for(const coin of map.coins){
  if(coin.nextTick>session.tick)continue;
  const row=Math.floor(coin.y);
  if(!coinsByRow.has(row))coinsByRow.set(row,[]);
  coinsByRow.get(row).push(coin);
 }
 const heroRow=Math.floor(display.y),chestRow=Math.floor(map.chest.y);
 for(let y=top;y<=bottom;y++){
  // Depth-sort tree canopies with items and hero by their feet/ground Y.
  for(let x=left;x<=right;x++)obstacle(g,map,art,x,y,x*T-cameraX,y*T-cameraY);
  for(const coin of coinsByRow.get(y)||[]){
   const sx=coin.x*T-cameraX,sy=coin.y*T-cameraY;
   const bob=Math.sin(now*.004+coin.x)*2;
   drawImage(g,art.coin,sx-T*.26,sy-T*.44+bob,T*.52,T*.56);
  }
  if(y===chestRow&&!map.chest.claimed){
   shrineProps(g,map,art,cameraX,cameraY,now);
   const x=map.chest.x*T-cameraX,yc=map.chest.y*T-cameraY;
   drawImage(g,art.chest,x-T*.44,yc-T*.52,T*.88,T*.83);
  }
  if(y===heroRow){
   const px=display.x*T-cameraX,py=display.y*T-cameraY;
   drawImage(g,art.hero,px-T*.32,py-T*.92,T*.64,T*.9);
  }
 }
}
export function drawCohesiveMiniMap(g,map,player){
 const w=g.canvas.width,h=g.canvas.height,n=map.tiles.length;
 g.imageSmoothingEnabled=false;g.clearRect(0,0,w,h);
 const cellSize=Math.min(w,h)/n,ox=(w-n*cellSize)/2,oy=(h-n*cellSize)/2;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const tile=map.tiles[y][x],wet=cell(map.water,x,y);
  g.fillStyle=wet?"#1877a7":tile===1?"#194e33":tile===2?"#858778":cell(map.path,x,y)?"#c39b55":"#73af51";
  g.fillRect(Math.floor(ox+x*cellSize),Math.floor(oy+y*cellSize),Math.ceil(cellSize),Math.ceil(cellSize));
  if(cell(map.bridge,x,y)){
   g.fillStyle="#c79553";
   g.fillRect(Math.floor(ox+x*cellSize),Math.floor(oy+y*cellSize),Math.ceil(cellSize),Math.ceil(cellSize));
  }
 }
 if(!map.chest.claimed){
  g.fillStyle="#ffe055";g.fillRect(ox+map.chest.x*cellSize-3,oy+map.chest.y*cellSize-3,6,6);
 }
 g.fillStyle="#f9fff0";g.fillRect(ox+player.x*cellSize-3,oy+player.y*cellSize-3,6,6);
 g.strokeStyle="#11302f";g.lineWidth=1;g.strokeRect(ox,oy,n*cellSize,n*cellSize);
}
