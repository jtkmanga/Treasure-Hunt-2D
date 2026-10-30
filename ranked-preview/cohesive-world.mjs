// V6: ONE coherent tile world. No image screenshots, compositing halves,
// remote textures, or visual bridges over collision-water.
// Every surface is drawn from server-shared map.tiles/path/water/bridge.
import {TILE_SIZE} from "./pixel-art.mjs";
const T=TILE_SIZE;
const H=(x,y,s=0)=>{let v=Math.imul(x+71,374761393)^Math.imul(y+139,668265263)^Math.imul(s+7,1442695041);v=Math.imul(v^(v>>>13),1274126177);return (v^(v>>>16))>>>0;};
const cell=(a,x,y)=>a?.[y]?.[x]??false;
function drawImage(g,img,x,y,w,h){g.drawImage(img,Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
function rect(g,x,y,w,h,color){g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
// Natural shore pixels are still VISUAL ONLY: physics uses map.tiles === 0.
// Small broken bank silhouettes keep the river from resembling blue rectangles.
function shoreline(g,map,art,x,y,sx,sy,seed){
 const north=cell(map.water,x,y-1),south=cell(map.water,x,y+1);
 const west=cell(map.water,x-1,y),east=cell(map.water,x+1,y);
 const c=art.p.water,earth=art.p.path;
 const bank="#416e46",edge="#92b76a";
 for(let i=0;i<10;i++){
  const n=H(x*19+i,y*11-i,68);
  const offset=(n%4),v=i*5;
  if(!west){
   rect(g,sx,sy+v,3+offset,5,bank);
   if(i%3===0)rect(g,sx+3+offset,sy+v+1,2,2,edge);
   if(i%2===0)rect(g,sx+5+offset,sy+v+2,2,1,c[3]);
  }
  if(!east){
   rect(g,sx+T-5-offset,sy+v,6+offset,5,bank);
   if(i%3===1)rect(g,sx+T-7-offset,sy+v+1,2,2,edge);
   if(i%2===0)rect(g,sx+T-9-offset,sy+v+2,2,1,c[3]);
  }
  if(!north){
   rect(g,sx+v,sy,5,4+offset,earth[0]);
   if(i%2===0)rect(g,sx+v+1,sy+5+offset,4,1,c[3]);
  }
  if(!south){
   rect(g,sx+v,sy+T-4-offset,5,5+offset,bank);
   if(i%2===0)rect(g,sx+v+1,sy+T-7-offset,4,1,c[3]);
  }
 }
}
function terrainTile(g,map,art,x,y,sx,sy,now){
 const tile=map.tiles[y]?.[x],seed=H(x,y,17);
 const inside=tile!==undefined,wet=inside&&cell(map.water,x,y);
 const bridged=inside&&cell(map.bridge,x,y);
 const road=inside&&cell(map.path,x,y),wild=!inside;
 drawImage(g,wet?art.water[seed%art.water.length]:art.grass[seed%art.grass.length],sx,sy,T+1,T+1);
 if(wet){
  const moving=Math.floor(now/340);
  if(!bridged&&seed%3===0){
   const n=H(x,y,moving);
   rect(g,sx+6+(n%13),sy+6+(n>>>4)%27,11,2,art.p.water[2]);
   rect(g,sx+9+(n%9),sy+12+(n>>>7)%19,5,1,art.p.water[3]);
  }
  shoreline(g,map,art,x,y,sx,sy,seed);
 }
 if(road&&!wet&&tile===0){
  const mask=(cell(map.path,x,y-1)?1:0)
    |(cell(map.path,x+1,y)?2:0)
    |(cell(map.path,x,y+1)?4:0)
    |(cell(map.path,x-1,y)?8:0);
  // Organic path has rounded, grainy edges and is cached as a sprite.
  if(art.trail)drawImage(g,art.trail[mask*4+(seed%4)],sx,sy,T,T);
  else drawImage(g,art.path[seed%art.path.length],sx,sy,T,T);
 }
 if(!wet&&!road&&seed%6===0){
  // Sparse moss / wild ground patches, not giant repeating square fills.
  const color=art.p.grass[seed%4];
  for(let i=0;i<7;i++){
   const n=H(x+i*7,y-i*4,44),px=n%38,py=(n>>>6)%35;
   rect(g,sx+px,sy+py,2+n%5,2+(n>>>4)%2,color);
  }
 }
 if(!wet&&seed%29===0&&!road){
  for(let i=0;i<3;i++){
   const n=H(x+i,y,42),px=n%35,py=(n>>>4)%36;
   rect(g,sx+px,sy+py,4,1,art.p.grass[3]);
   rect(g,sx+px+2,sy+py-2,1,4,art.p.leaf[2]);
  }
 }
 // Outside uses the same local texture family, no photographic reference panel.
 if(wild&&seed%11===0)drawImage(g,art.bush[seed%art.bush.length],sx+T*.15,sy+T*.39,T*.65,T*.44);
}
function bridgePiece(g,map,art,x,y,sx,sy){
 if(!cell(map.bridge,x,y))return;
 const wood=art.scenery.p.wood,seed=H(x,y,18);
 const horizontal=cell(map.bridge,x-1,y)||cell(map.bridge,x+1,y);
 if(horizontal){
  rect(g,sx,sy+T*.19,T+1,T*.66,"#2c2119");
  for(let i=0;i<6;i++){
   const xx=sx+i*T/6,k=H(i,x,y);
   rect(g,xx,sy+T*.23,T/6-1,T*.54,wood[2+k%2]);
   rect(g,xx+2,sy+T*.28,T/6-3,T*.06,wood[3]);
   rect(g,xx+3,sy+T*.63,T/6-4,1,wood[1]);
  }
  // Directionally continuous rail, posts only at actual ends.
  rect(g,sx,sy+T*.15,T+1,3,wood[3]);
  rect(g,sx,sy+T*.79,T+1,4,wood[1]);
  if(!cell(map.bridge,x-1,y)){
   rect(g,sx,sy+T*.02,6,T*.96,wood[1]);
   rect(g,sx+1,sy,4,6,wood[4]);
  }
  if(!cell(map.bridge,x+1,y)){
   rect(g,sx+T-6,sy+T*.02,6,T*.96,wood[1]);
   rect(g,sx+T-5,sy,4,6,wood[4]);
  }
 }else{
  rect(g,sx+T*.17,sy,T*.67,T+1,"#2c2119");
  for(let i=0;i<6;i++){
   const yy=sy+i*T/6,k=H(i,y,x);
   rect(g,sx+T*.23,yy,T*.55,T/6-1,wood[2+k%2]);
   rect(g,sx+T*.25,yy+2,T*.49,2,wood[3]);
  }
  rect(g,sx+T*.13,sy,4,T+1,wood[3]);
  rect(g,sx+T*.82,sy,4,T+1,wood[1]);
  if(!cell(map.bridge,x,y-1)){
   rect(g,sx+T*.12,sy,T*.74,5,wood[1]);
   rect(g,sx+T*.12,sy-3,5,9,wood[4]);
   rect(g,sx+T*.78,sy-3,5,9,wood[4]);
  }
  if(!cell(map.bridge,x,y+1)){
   rect(g,sx+T*.12,sy+T-5,T*.74,5,wood[1]);
   rect(g,sx+T*.12,sy+T-5,5,9,wood[4]);
   rect(g,sx+T*.78,sy+T-5,5,9,wood[4]);
  }
 }
 if(seed%2===0){
  rect(g,sx+T*.41,sy+T*.33,4,2,wood[4]);
  rect(g,sx+T*.53,sy+T*.48,3,2,wood[0]);
 }
}
// Decorative sprites are always derived from actual collision tiles.
// Trees, rocks, mushrooms, butterflies and grasses never add phantom walls.
function obstacle(g,map,art,x,y,sx,sy,now=0){
 const tile=map.tiles[y]?.[x],seed=H(x,y);
 if(tile===1){
  // Forest species: varied crowns, sparse tall pines and anchored shadows.
  const variant=(seed>>>4)%art.tree.length;
  const scale=.86+(seed%5)*.065;
  const w=T*2.02*scale,h=T*2.1*scale;
  rect(g,sx+T*.09,sy+T*.77,T*.85,T*.15,"#061b1e53");
  drawImage(g,art.tree[variant],sx+T*.5-w*.5,sy+T*.9-h*.9,w,h);
  if(seed%17===0){
   rect(g,sx+T*.83,sy+T*.66,5,2,"#d54842");
   rect(g,sx+T*.85,sy+T*.63,2,2,"#ffebad");
  }
 }else if(tile===2){
  const touchesWater=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>cell(map.water,x+dx,y+dy));
  if(touchesWater){
   drawImage(g,art.scenery.cliff,sx,sy-T*.18,T+1,T*1.19);
   rect(g,sx+T*.12,sy+T*.1,T*.18,2,"#d1c3a1");
   if(seed%6===0)rect(g,sx+T*.72,sy+T*.42,4,5,art.p.leaf[2]);
  }else{
   const scale=.70+(seed%4)*.08;
   const shift=(seed>>>7)%9;
   rect(g,sx+T*.1,sy+T*.78,T*.8,T*.13,"#0b292451");
   drawImage(g,art.rock[(seed>>>3)%art.rock.length],sx+T*(1-scale)/2,sy+T*.08+shift*.25,T*scale,T*.95*scale);
   if(seed%11===0)rect(g,sx+T*.67,sy+T*.53,4,3,art.p.leaf[3]);
  }
 }else if(tile===0&&!cell(map.bridge,x,y)){
  // Wildflowers, mushrooms, saplings only decorate traversable ground.
  if(seed%15===0)drawImage(g,art.flower[seed%art.flower.length],sx+T*.21,sy+T*.50,T*.35,T*.36);
  if(seed%23===0&&!cell(map.path,x,y))drawImage(g,art.bush[seed%art.bush.length],sx+T*.17,sy+T*.54,T*.56,T*.37);
  if(seed%39===0)drawImage(g,art.mushroom,sx+T*.62,sy+T*.55,T*.29,T*.32);
  if(seed%71===0&&!cell(map.path,x,y)){
   rect(g,sx+T*.57,sy+T*.52,3,2,"#ffe6bd");
   rect(g,sx+T*.59,sy+T*.54,2,3,"#d74f66");
   rect(g,sx+T*.62,sy+T*.51,3,2,"#ffe7d0");
  }
 }else if(tile===3){
  if(seed%8===0)drawImage(g,art.scenery.lilypad,sx+T*.29,sy+T*.41,T*.47,T*.36);
  if(seed%27===0&&map.tiles[y-1]?.[x]===2){
   const bob=Math.floor(now/180)%5;
   drawImage(g,art.scenery.waterfall,sx+T*.33,sy+bob,T*.43,T*.83);
  }
 }else if(tile===undefined){
  // Outside the protected map: same forest species, not a separate image.
  if(seed%7<5){
   const variant=(seed>>>5)%art.tree.length;
   drawImage(g,art.tree[variant],sx-T*.46,sy-T*1.2,T*1.95,T*2.2);
  }
 }
}
function shrineProps(g,map,art,cameraX,cameraY,now){
 const c=map.chest,sx=c.x*T-cameraX,sy=c.y*T-cameraY;
 // Decorative safe-zone pedestal: it does not make a new blocking tile.
 rect(g,sx-T*.59,sy-T*.06,T*1.18,T*.29,"#534e3b");
 rect(g,sx-T*.6,sy-T*.15,T*1.2,6,"#b9a17a");
 rect(g,sx-T*.52,sy-T*.19,T*1.04,4,"#d5c390");
 rect(g,sx-T*.56,sy+T*.14,T*1.12,3,"#283c33");
 const pulse=(Math.sin(now*.004)+1)*.5;
 rect(g,sx-T*.36,sy-T*.43,T*.7,4,pulse>.5?"#ffcd6c":"#c29e45");
 const flame=(x,y)=>{
  const n=2+Math.floor(Math.sin(now*.009+x)*1.5);
  rect(g,x-5,y-7,10,9,"#393027");rect(g,x-4,y-11,8,4,"#e8b555");
  rect(g,x-3,y-17-n,6,9+n,"#ef7a2e");
  rect(g,x-1,y-14-n,3,8+n,"#fff7ac");
 };
 flame(sx-T*.73,sy-T*.23);flame(sx+T*.73,sy-T*.23);
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
  for(let x=left;x<=right;x++)obstacle(g,map,art,x,y,x*T-cameraX,y*T-cameraY,now);
  for(const coin of coinsByRow.get(y)||[]){
   const sx=coin.x*T-cameraX,sy=coin.y*T-cameraY;
   const bob=Math.sin(now*.004+coin.x)*2;
   // One small glint (not an expensive per-coin gradient).
   if(H(Math.floor(coin.x),Math.floor(coin.y),4)%3===0){
    const pulse=(Math.sin(now*.005+coin.x*1.7)+1)*.5;
    rect(g,sx-2,sy-T*.46+bob-3*pulse,4,2,"#fff8cb");
    rect(g,sx,sy-T*.5+bob-3*pulse,1,7,"#fff4bd");
   }
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
