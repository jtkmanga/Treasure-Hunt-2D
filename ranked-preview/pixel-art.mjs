// Original, locally drawn retro pixel artwork; no licensed sprites or external assets.
// Decoration must never change the collision map or position of official coins/chests.
export const TILE_SIZE=52;
const palettes=[
 {grass:["#538d38","#679d43","#42792f","#7eae52"],dark:"#214d2c",leaf:["#174f36","#1f7046","#298651","#3c9b53","#83c04e","#a9d76c"],trunk:["#513b29","#745033","#a47443"],path:["#997243","#b88b50","#d9ae65","#e9c47d"],rock:["#455668","#708077","#98a49a"],water:["#104e83","#156eac","#289bd0","#80d4f0"]},
 {grass:["#766139","#8e7945","#67522e","#a08b54"],dark:"#3b3928",leaf:["#544b32","#76612e","#988140","#b3a052","#c4ad64","#dfc77b"],trunk:["#4e3925","#725033","#b18c55"],path:["#796043","#aa8355","#cba36e","#e0c08c"],rock:["#514b43","#8b8171","#ada28b"],water:["#294b5f","#326c80","#4597a4","#93d2ce"]},
 {grass:["#557b55","#68896b","#47684e","#83a17c"],dark:"#273b37",leaf:["#234836","#38634b","#4b8055","#689969","#a4b576","#d5d0a0"],trunk:["#524437","#806749","#b19a6f"],path:["#8c8169","#aea084","#d2c4a2","#ebe2bc"],rock:["#52636a","#859397","#b5b8ad"],water:["#174965","#26778a","#41a3a7","#91d2d2"]}
];
function hash(a,b,c=0){let n=Math.imul(a+71,374761393)^Math.imul(b+139,668265263)^Math.imul(c+11,1442695041);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;}
function rnd(x,y,z=0){return hash(x,y,z)/4294967295;}
function sprite(w,h,draw){const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");g.imageSmoothingEnabled=false;draw(g);return c;}
function px(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(Math.floor(x),Math.floor(y),Math.ceil(w),Math.ceil(h));}
function poly(g,coords,color){g.fillStyle=color;g.beginPath();g.moveTo(coords[0],coords[1]);for(let i=2;i<coords.length;i+=2)g.lineTo(coords[i],coords[i+1]);g.closePath();g.fill();}
function bloom(g,x,y,color="#e8ef8a"){px(g,x,y,3,3,color);px(g,x+1,y-2,1,7,"#ffffff9a");px(g,x-2,y+1,7,1,"#ffffff9a");}
function grassTile(p,variant){return sprite(32,32,g=>{
 const k=variant%4;px(g,0,0,32,32,p.grass[k]);
 for(let i=0;i<38;i++){
  const v=hash(i,variant,13),x=v%32,y=(v>>>7)%32;
  px(g,x,y,(v%7===0?3:1)+(v%3),1,p.grass[(k+((v>>>5)%3)+1)%4]);
 }
 for(let i=0;i<6;i++){
  const v=hash(i,variant,18),x=2+v%27,y=3+((v>>>6)%27);
  px(g,x,y,1,3,p.dark);px(g,x+2,y+1,1,2,p.leaf[3]);
 }
 if(variant%7===0){px(g,7,20,3,3,"#f7e3a3");px(g,8,21,1,1,"#f5a770");px(g,11,22,1,1,"#d5db9a");}
 if(variant%9===0){px(g,23,13,2,2,"#c4b99a");px(g,24,12,2,2,"#d3c5a0");}
});}
function pathTile(p,variant){return sprite(32,32,g=>{
 g.drawImage(grassTile(p,variant),0,0);
 px(g,0,4,32,25,p.path[0]);
 for(let y=4;y<29;y+=3)for(let x=0;x<32;x+=4){
  const n=hash(x,y,variant);
  px(g,x+(n%2),y,(n%5)+1,1,p.path[1+(n%3)]);
 }
 for(let x=0;x<32;x+=5){const n=hash(x,variant,88);px(g,x,3+n%3,3,2,p.grass[n%4]);px(g,x,27+n%3,4,2,p.grass[(n>>>3)%4]);}
});}
function waterTile(p,variant){return sprite(32,32,g=>{
 px(g,0,0,32,32,p.water[0]);
 for(let i=0;i<32;i+=3){
  const n=hash(i,variant,5),x=n%32,y=(n>>>5)%32;
  px(g,x,y,4+n%6,1,p.water[1+n%3]);
 }
 px(g,2,2,10,1,p.water[2]);px(g,13,16,8,1,p.water[3]);
 if(variant%3===0){px(g,22,23,9,3,p.leaf[2]);px(g,24,21,5,2,p.leaf[4]);}
});}
function rockSprite(p,variant){return sprite(46,50,g=>{
 px(g,7,37,30,9,"#0b2924a0");
 poly(g,[6,15,15,7,31,8,39,18,38,34,28,40,13,38,5,31],p.rock[0]);
 poly(g,[15,9,30,8,37,18,29,24,10,21],p.rock[2]);
 px(g,7,22,28,13,p.rock[1]);
 px(g,12,12,4,3,"#cdd1b5");px(g,31,25,3,2,p.dark);
 px(g,9,32,8,3,p.rock[0]);px(g,22,36,13,3,p.rock[0]);
 for(let i=0;i<5;i++){const n=hash(i,variant,62);px(g,8+n%26,19+n%13,2,1,p.rock[n%3]);}
});}
function treeSprite(p,variant){return sprite(66,78,g=>{
 // cast shadow and the textured trunk; treetops intentionally overlap the tile above
 px(g,13,65,41,6,"#06281ca0");
 px(g,29,40,12,28,p.trunk[0]);px(g,33,46,7,19,p.trunk[1]);px(g,34,51,2,12,p.trunk[2]);
 px(g,24,58,5,9,p.trunk[0]);px(g,40,57,5,9,p.trunk[0]);
 const clusters=[[23,29,17],[41,31,19],[32,16,20],[16,44,16],[50,46,14],[31,43,19]];
 for(let i=0;i<clusters.length;i++){
  const [cx,cy,r]=clusters[i];
  for(let y=-r;y<r;y+=3)for(let x=-r;x<r;x+=3){
   if((x*x)/(r*r)+(y*y)/(r*r)>1.1)continue;
   const color=p.leaf[(hash(x+cx,y+cy,i+variant)%6)];
   px(g,cx+x,cy+y,4,4,color);
  }
  for(let j=0;j<8;j++){const n=hash(j,i,variant);px(g,cx-r/2+n%(r),cy-r/2+(n>>>4)%r,4,2,p.leaf[5]);}
 }
 px(g,24,11,3,2,"#c2e581");px(g,46,24,3,2,"#c7ed86");
});}
function flowerSprite(p,variant){return sprite(18,18,g=>{
 px(g,7,7,3,9,p.leaf[2]);px(g,4,11,5,3,p.leaf[3]);
 const petal=variant%3===0?"#fdf2d1":variant%3===1?"#ff9d9f":"#e5aaff";
 for(const [x,y] of [[7,3],[3,7],[11,7],[7,11]])px(g,x,y,5,4,petal);
 px(g,8,8,4,4,"#f8c14b");
});}
function bushSprite(p,variant){return sprite(30,24,g=>{
 for(let i=0;i<14;i++){
  const n=hash(i,variant,3),x=n%22,y=(n>>>6)%12;
  px(g,x,y+6,8,7,p.leaf[n%6]);
 }
 px(g,3,17,20,4,p.leaf[0]);px(g,8,7,4,2,p.leaf[5]);
});}
function mushroomSprite(){return sprite(18,18,g=>{
 px(g,6,9,7,7,"#edd6a1");px(g,3,6,13,5,"#ca4431");
 px(g,6,4,7,3,"#eb6b44");px(g,6,7,3,2,"#fff4c8");px(g,12,7,2,2,"#fff4c8");
});}
function coinSprite(){return sprite(30,32,g=>{
 px(g,6,27,19,3,"#12321b7a");
 px(g,7,5,17,23,"#a96811");px(g,5,7,21,17,"#cf8413");
 px(g,8,4,15,23,"#ffd447");px(g,6,9,19,14,"#ffeb7c");
 px(g,10,7,12,18,"#ce9019");px(g,13,9,6,15,"#ffeeb0");px(g,9,9,3,3,"#fffde1");
 px(g,6,22,3,3,"#f7ae20");
});}
function chestSprite(){return sprite(48,43,g=>{
 px(g,5,35,38,6,"#062b1699");
 px(g,7,11,35,28,"#5a2b1d");px(g,7,15,35,18,"#a93225");
 px(g,8,4,33,13,"#ed9b36");px(g,10,6,29,7,"#c74524");
 px(g,8,7,3,29,"#ffe075");px(g,37,7,4,29,"#ffd15a");
 px(g,21,4,6,30,"#ffe377");px(g,23,18,3,8,"#8b4b13");
 px(g,7,29,35,4,"#f6be48");px(g,19,17,10,14,"#ffd462");px(g,22,20,4,7,"#4d2a11");
 bloom(g,3,3);bloom(g,42,0);bloom(g,31,3,"#ffe58c");
});}
function heroSprite(){return sprite(34,50,g=>{
 px(g,5,41,26,4,"#102318a0");
 px(g,9,31,7,12,"#302c2a");px(g,20,31,7,12,"#2a2d2d");
 px(g,8,40,9,5,"#30231c");px(g,19,40,9,5,"#30231c");
 px(g,8,23,21,15,"#267dcc");px(g,10,23,17,10,"#3897f1");
 px(g,6,24,4,13,"#e7b789");px(g,27,24,4,13,"#e6b98f");
 px(g,8,7,20,20,"#e5b082");px(g,10,9,17,15,"#f0c595");
 px(g,7,6,23,8,"#57321e");px(g,10,3,18,8,"#613719");
 px(g,6,11,5,9,"#59321d");px(g,26,10,5,8,"#50321b");
 px(g,13,17,3,3,"#33251f");px(g,23,17,3,3,"#33251f");
 px(g,17,24,5,2,"#b36c53");px(g,12,27,3,3,"#ffffff");px(g,24,27,2,3,"#173b62");
});}
export function createPixelArt(level=0){
 const p=palettes[level]||palettes[0];
 const grass=Array.from({length:16},(_,i)=>grassTile(p,i));
 const path=Array.from({length:8},(_,i)=>pathTile(p,i));
 const water=Array.from({length:5},(_,i)=>waterTile(p,i));
 const tree=Array.from({length:5},(_,i)=>treeSprite(p,i));
 const rock=Array.from({length:4},(_,i)=>rockSprite(p,i));
 const bush=Array.from({length:4},(_,i)=>bushSprite(p,i));
 const flower=Array.from({length:3},(_,i)=>flowerSprite(p,i));
 return {p,grass,path,water,tree,rock,bush,flower,mushroom:mushroomSprite(),coin:coinSprite(),chest:chestSprite(),hero:heroSprite()};
}
function isDirt(map,x,y){
 if(map.tiles[y]?.[x]!==0)return false;
 // Purely graphical winding trail; the server owns walkability.
 const nearHorizontal=y>=2&&y<=20&&Math.abs(x-(5+Math.floor(y/4)*3+Math.sin(y*.9)*1.5))<=1;
 const mainLine=y===2&&(x>=2&&x<=23);
 const vertical=x===23&&y>=2&&y<=23;
 return nearHorizontal||mainLine||vertical||((y===11||y===12)&&x>=5&&x<=23);
}
function scaled(g,sprite,x,y,w,h){g.drawImage(sprite,Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
export function drawPixelWorld(g,session,art,width,height,display,now=0){
 const T=TILE_SIZE,map=session.map;
 // Clamp viewport at the playable map boundary to avoid large blank bars
 // when the server-authoritative spawn is close to a corner.
 const worldWidth=map.tiles[0].length*T,worldHeight=map.tiles.length*T;
 const cameraX=Math.max(0,Math.min(Math.max(0,worldWidth-width),display.x*T-width/2));
 const cameraY=Math.max(0,Math.min(Math.max(0,worldHeight-height),display.y*T-height/2));
 const xmin=Math.max(0,Math.floor(cameraX/T)-2),xmax=Math.min(map.tiles[0].length-1,Math.ceil((cameraX+width)/T)+2);
 const ymin=Math.max(0,Math.floor(cameraY/T)-3),ymax=Math.min(map.tiles.length-1,Math.ceil((cameraY+height)/T)+2);
 g.imageSmoothingEnabled=false;
 g.fillStyle="#0c3045";g.fillRect(0,0,width,height);
 for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
   const xx=x*T-cameraX,yy=y*T-cameraY,tile=map.tiles[y][x];
   const h=hash(x,y,session.map.tiles.length),idx=h%16;
   const texture=tile===3?art.water[idx%art.water.length]:
      isDirt(map,x,y)?art.path[idx%art.path.length]:art.grass[idx];
   scaled(g,texture,xx,yy,T+1,T+1);
   if(tile===2&& (x===0||y===0||x===25||y===25)){
      scaled(g,art.rock[h%art.rock.length],xx+T*.06,yy+T*.12,T*.95,T*.95);
   }
   if(tile===0&&!isDirt(map,x,y)){
    if(h%17===0)scaled(g,art.flower[h%3],xx+T*.2,yy+T*.44,T*.28,T*.3);
    if(h%21===0)scaled(g,art.bush[h%art.bush.length],xx+T*.13,yy+T*.44,T*.58,T*.45);
    if(h%39===0)scaled(g,art.mushroom,xx+T*.51,yy+T*.4,T*.34,T*.34);
   }
 }
 // Obstacle layer y-ordered. All collision positions are unchanged.
 for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
  const xx=x*T-cameraX,yy=y*T-cameraY,t=map.tiles[y][x],h=hash(x,y,0);
  if(t===1)scaled(g,art.tree[h%art.tree.length],xx-T*.28,yy-T*.85,T*1.55,T*1.85);
  if(t===2&&x>0&&y>0&&x<25&&y<25)
    scaled(g,art.rock[h%art.rock.length],xx+T*.05,yy+T*.06,T*.96,T*.98);
  if(t===3){
    // Water/wet tile decoration: dark shore rocks and lily leaves
    if(h%2===0){g.fillStyle="#427b3b";g.fillRect(Math.round(xx+T*.57),Math.round(yy+T*.52),Math.round(T*.27),Math.round(T*.11));}
    if(h%3===0)scaled(g,art.flower[0],xx+T*.4,yy+T*.3,T*.23,T*.25);
  }
 }
 for(const coin of map.coins){
  if(coin.nextTick>session.tick)continue;
  const xx=coin.x*T-cameraX,yy=coin.y*T-cameraY;
  if(xx< -30||yy< -30||xx>width+30||yy>height+30)continue;
  const bob=Math.sin(now*.003+coin.x*.7)*2;
  scaled(g,art.coin,xx-T*.24,yy-T*.37+bob,T*.48,T*.55);
 }
 if(!map.chest.claimed){
  const c=map.chest,x=c.x*T-cameraX,y=c.y*T-cameraY;
  if(x> -90&&x<width+90&&y> -90&&y<height+90){
   g.fillStyle="#ffd3724d";g.beginPath();g.arc(x,y,T*.53+Math.sin(now*.003)*4,0,Math.PI*2);g.fill();
   scaled(g,art.chest,x-T*.43,y-T*.51,T*.88,T*.85);
  }
 }
 const px=display.x*T-cameraX,py=display.y*T-cameraY;
 scaled(g,art.hero,px-T*.28,py-T*.8,T*.56,T*.85);
}
export function drawMiniMap(g,map,player){
 const canvas=g.canvas,w=canvas.width,h=canvas.height;
 g.imageSmoothingEnabled=false;g.clearRect(0,0,w,h);
 const cell=Math.min(w,h)/map.tiles.length,ox=(w-cell*map.tiles.length)/2,oy=(h-cell*map.tiles.length)/2;
 for(let y=0;y<map.tiles.length;y++)for(let x=0;x<map.tiles[y].length;x++){
  const tile=map.tiles[y][x];
  g.fillStyle=tile===1?"#1a5637":tile===2?"#73827a":tile===3?"#196a9d":"#6aa44e";
  g.fillRect(Math.floor(ox+x*cell),Math.floor(oy+y*cell),Math.ceil(cell),Math.ceil(cell));
 }
 g.fillStyle="#ffe36e";
 if(!map.chest.claimed)g.fillRect(ox+map.chest.x*cell-3,oy+map.chest.y*cell-3,6,6);
 g.fillStyle="#ecf8ff";g.fillRect(ox+player.x*cell-3,oy+player.y*cell-3,6,6);
 g.strokeStyle="#203f4f";g.strokeRect(ox+.5,oy+.5,cell*26,cell*26);
}
