// Original programmatically drawn fantasy forest accents for the offline practice
// environment. These are DECORATIONS ONLY. Collision, pickups and seed stay in run-engine.mjs.
function hash(x,y,z=0){
 let n=Math.imul(x+145,374761393)^Math.imul(y+169,668265263)^Math.imul(z+47,1442695041);
 n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;
}
function sprite(w,h,draw){
 const c=document.createElement("canvas");c.width=w;c.height=h;
 const g=c.getContext("2d");if(!g)throw Error("Missing Canvas 2D");
 g.imageSmoothingEnabled=false;draw(g);return c;
}
function box(g,x,y,w,h,color){g.fillStyle=color;g.fillRect(x,y,w,h);}
function draw(g,canvas,x,y,w,h){g.drawImage(canvas,Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
const pal=[
 {wood:["#362819","#68442a","#9e6834","#d99e50","#ffe0a1"],fern:["#153c2b","#267544","#51a447","#8bcd58"],cliff:["#1c3340","#4d5557","#7a7771","#ada696"],foam:["#145d90","#268fc2","#8ed9ed","#f0fef4"]},
 {wood:["#36291d","#775131","#a17e4d","#cfab69","#e9ce93"],fern:["#403d2d","#796b3e","#a6a35a","#d2c576"],cliff:["#34333b","#575452","#807669","#b7ab94"],foam:["#2c687e","#448b9b","#83c9c8","#f3e7cd"]},
 {wood:["#2b3033","#52534c","#85816a","#b8ac89","#f6dabb"],fern:["#21463b","#3e7b57","#79a56f","#b9c17e"],cliff:["#233b4b","#4f5d63","#7c8887","#c0c5b0"],foam:["#25687a","#4699a8","#a0d7df","#edf9e5"]}
];
function piece(g,x,y,color=0,w=4,h=3,colors){box(g,x,y,w,h,colors[color]);}
function leaf(g,x,y,c){
 box(g,x+4,y,10,3,c[2]);box(g,x+1,y+4,15,4,c[1]);box(g,x+6,y+8,7,5,c[0]);
 box(g,x+3,y+1,4,2,c[3]);box(g,x+11,y+4,4,2,c[3]);
}
function foregroundFern(p,n){
 return sprite(28,29,g=>{
  box(g,13,12,2,15,p.fern[0]);
  for(let i=0;i<5;i++){
   const y=3+i*4;
   box(g,7-i%2,y,7,3,p.fern[i%3+1]);
   box(g,16,y+1,8,3,p.fern[(i+1)%3+1]);
   box(g,5,y+3,5,3,p.fern[1]);box(g,22,y+3,3,2,p.fern[0]);
  }
  box(g,12,4,4,5,p.fern[3]);
  if(n%2===0){box(g,4,25,6,2,p.fern[0]);box(g,20,26,5,2,p.fern[2]);}
 });
}
function stump(p){
 return sprite(35,32,g=>{
  box(g,5,21,26,6,"#09271cb0");
  box(g,7,12,23,15,p.wood[1]);box(g,8,11,18,13,p.wood[2]);
  box(g,8,8,21,10,p.wood[0]);box(g,10,7,17,8,p.wood[3]);
  box(g,13,9,11,5,p.wood[1]);box(g,16,10,6,2,p.wood[4]);
  box(g,8,22,4,4,p.wood[0]);box(g,26,22,4,4,p.wood[0]);
 });
}
function boards(p){
 return sprite(64,42,g=>{
  box(g,0,9,64,28,"#261c16");
  for(let j=0;j<5;j++){
   const y=10+j*5;
   box(g,3,y,58,4,p.wood[2]);
   box(g,3,y,58,1,p.wood[3]);box(g,7,y+2,50,1,p.wood[1]);
   for(let x=10;x<59;x+=19)box(g,x,y+2,2,2,p.wood[0]);
  }
  box(g,2,6,5,35,p.wood[0]);box(g,57,6,5,35,p.wood[0]);
  box(g,3,4,4,10,p.wood[3]);box(g,58,4,4,10,p.wood[3]);
 });
}
function plankBridge(p){
 return sprite(82,65,g=>{
  // A raised boardwalk painted only over tiles already walkable (0).
  box(g,3,45,74,10,"#04282093");
  box(g,3,12,75,42,p.wood[0]);
  for(let i=0;i<7;i++){
   const x=6+i*10;
   box(g,x,15,9,35,p.wood[2]);box(g,x+1,16,2,30,p.wood[3]);
   box(g,x+7,15,2,35,p.wood[1]);box(g,x+3,37,2,2,p.wood[0]);
  }
  box(g,0,9,82,5,p.wood[1]);box(g,0,49,82,5,p.wood[0]);
  for(const x of [1,25,56,76]){
   box(g,x,4,6,16,p.wood[0]);box(g,x+1,3,4,4,p.wood[4]);
   box(g,x,47,6,11,p.wood[0]);box(g,x+1,46,4,4,p.wood[3]);
  }
 });
}
function woodSign(p){
 return sprite(44,47,g=>{
  box(g,17,21,7,24,p.wood[0]);box(g,19,23,3,20,p.wood[2]);
  box(g,2,9,40,22,p.wood[0]);box(g,5,10,37,18,p.wood[2]);
  box(g,5,10,37,2,p.wood[4]);box(g,38,12,3,16,p.wood[1]);
  box(g,13,18,18,3,"#f4e5c6");box(g,24,13,4,13,"#f4e5c6");
  box(g,29,17,5,5,"#f4e5c6");box(g,7,12,2,2,p.wood[0]);
 });
}
function lamp(p){
 return sprite(28,54,g=>{
  box(g,8,44,15,6,"#071b1a88");
  box(g,12,15,5,32,p.wood[0]);box(g,12,6,14,5,p.wood[1]);
  box(g,23,7,3,9,p.wood[0]);box(g,19,15,9,17,p.wood[0]);
  box(g,21,17,5,11,"#ffe6a0");box(g,22,19,3,8,"#fff9c2");
  box(g,18,16,10,2,p.wood[3]);box(g,19,30,8,2,p.wood[2]);
  box(g,20,19,8,10,"#ffd74d24");
 });
}
function cliff(p){
 return sprite(48,46,g=>{
  box(g,1,9,46,37,p.cliff[0]);
  box(g,3,13,11,31,p.cliff[1]);box(g,14,11,13,28,p.cliff[2]);
  box(g,28,15,11,30,p.cliff[1]);box(g,39,10,8,33,p.cliff[2]);
  box(g,2,6,46,6,p.cliff[3]);box(g,5,5,40,4,p.fern[2]);
  box(g,12,18,2,16,p.cliff[0]);box(g,25,23,2,15,p.cliff[0]);
  box(g,35,14,2,20,p.cliff[0]);box(g,5,40,36,4,p.cliff[0]);
 });
}
function waterfall(p){
 return sprite(38,60,g=>{
  box(g,0,0,38,60,p.foam[0]);
  for(let i=0;i<12;i++){
   const n=hash(i,10,22),x=n%38,width=2+(n>>5)%3;
   box(g,x,0,width,45,p.foam[(n>>7)%3+1]);
   box(g,x,8+(n>>9)%26,width+1,5,p.foam[3]);
  }
  box(g,0,47,38,4,p.foam[2]);
  for(let i=0;i<6;i++){const x=(i*9+3)%38;box(g,x,52,7,3,p.foam[3]);box(g,x+2,57,5,2,p.foam[2]);}
 });
}
function lilypad(p){
 return sprite(26,20,g=>{
  box(g,5,14,20,3,"#093b4c91");
  box(g,3,7,21,8,p.fern[0]);box(g,5,5,17,9,p.fern[2]);
  box(g,12,9,13,3,p.fern[3]);box(g,17,5,4,7,p.foam[0]);
  box(g,8,5,4,4,"#f7f7de");box(g,6,8,8,2,"#fcf9e7");box(g,9,8,2,2,"#ffe570");
 });
}
function crate(p){
 return sprite(34,33,g=>{
  box(g,4,28,29,4,"#09221a9f");
  box(g,3,5,29,24,p.wood[0]);box(g,6,7,24,19,p.wood[2]);
  box(g,7,9,19,3,p.wood[3]);box(g,7,22,19,2,p.wood[1]);
  box(g,7,9,3,16,p.wood[0]);box(g,25,9,3,16,p.wood[0]);
  box(g,15,9,4,16,p.wood[1]);box(g,7,15,19,3,p.wood[1]);
 });
}
function borderShade(g,x,y,size,p){
 box(g,x,y,size,Math.max(3,size*.1),"#091f1970");
 box(g,x+size*.13,y+size*.04,size*.58,2,p.fern[3]);
}
export function createScenery(level=0){
 const p=pal[level]||pal[0];
 return {
  p,ferns:Array.from({length:3},(_,n)=>foregroundFern(p,n)),
  stump:stump(p),boards:boards(p),bridge:plankBridge(p),sign:woodSign(p),
  lamp:lamp(p),cliff:cliff(p),waterfall:waterfall(p),lilypad:lilypad(p),crate:crate(p)
 };
}
export function isScenicBoardwalk(map,x,y){
 // The two-tile boardwalk NEVER crosses a water/obstacle tile. It is cosmetic
 // on established walkable safe corridor y=2 and preserves collision.
 return y===2&&x===11&&[11,12].every(i=>map.tiles[2]?.[i]===0);
}
export function drawScenicGround(g,map,scenery,tile,x,y,xx,yy,size,now){
 const code=hash(x,y,41),p=scenery.p;
 if(tile===3){
  // Animated waterfall is water-only and cannot be walked through.
  if(code%5===0){
   const scroll=(Math.floor(now/120)%7);
   draw(g,scenery.waterfall,xx+size*.17,yy+scroll-8,size*.68,size*.98);
  }else if(code%3===0){
   draw(g,scenery.lilypad,xx+size*.16,yy+size*.2,size*.61,size*.46);
  }
  if(map.tiles[y-1]?.[x]===0){borderShade(g,xx,yy,size,p);}
 }else if(tile===0){
  const rarity=code%43;
  if(rarity===0)draw(g,scenery.ferns[code%3],xx+size*.27,yy+size*.38,size*.51,size*.55);
  if(rarity===9)draw(g,scenery.stump,xx+size*.23,yy+size*.34,size*.53,size*.51);
  if(rarity===17)draw(g,scenery.lilypad,xx+size*.62,yy+size*.57,size*.26,size*.22);
  if(y===2&&(x===11||x===12)&&isScenicBoardwalk(map,11,2)){
   // Paired wooden dry boardwalk segment: never drawn across blocked tiles.
   draw(g,scenery.boards,xx,yy+size*.29,size+1,size*.51);
  }
 }else if(tile===2){
  if(code%5===0)draw(g,scenery.ferns[code%3],xx+size*.15,yy+size*.52,size*.45,size*.38);
 }
}
export function drawScenicObjects(g,map,scenery,tile,x,y,xx,yy,size){
 const code=hash(x,y,70);
 // Rare upright props are restricted to truly walkable map cells.
 // Visuals are deliberately small to avoid pretending to add server collisions.
 if(tile===0){
  if(code%89===0)
   draw(g,scenery.crate,xx+size*.55,yy+size*.37,size*.35,size*.43);
  else if(code%83===0)
   draw(g,scenery.lamp,xx+size*.62,yy+size*.17,size*.31,size*.65);
  else if(code%101===0)
   draw(g,scenery.sign,xx+size*.67,yy+size*.33,size*.27,size*.47);
 }
}
export function drawScenicBoundary(g,scenery,x,y,xx,yy,size){
 // Decorative cliffs and cascades outside the authoritative map.
 // Cannot be collected, reached or used to bypass collision.
 const code=hash(x,y,65);
 if(x<0&&x>=-3&&y>=2&&y<=8){
  if(x===-2||code%3===0){
   draw(g,scenery.waterfall,xx,yy,size+1,size+1);
  }else draw(g,scenery.cliff,xx,yy,size+1,size+1);
 }else if(code%11===0){
  draw(g,scenery.cliff,xx,yy-size*.22,size+1,size*1.24);
 }
}
