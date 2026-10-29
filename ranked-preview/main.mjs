import {MAP_SIZE,TICK_MS,MAX_TICKS,createRunSession,advanceRunTick,replayRun}
  from "./run-engine.mjs";

const byId=id=>document.getElementById(id);
const canvas=byId("world"),ctx=canvas.getContext("2d",{alpha:false});
if(!ctx)throw Error("Canvas unavailable");
const LEVELS=[
 {name:"ป่าล่าสมบัติ",land:"#508d56",shade:"#6ba269"},
 {name:"ถ้ำทองคำ",land:"#75664a",shade:"#958056"},
 {name:"วิหารโบราณ",land:"#647e6c",shade:"#8ca17c"}
];
const SEED=123456789, TILE=34;
let level=0,session=createRunSession(level,SEED),display={...session.player},frameLog=[];
let running=false,runEnd=0,clockId=null,lastDraw=performance.now();
let requestedCollect=false;
const pressedKeys=new Set(),pressedPads=new Set();
function startRun(){
 clearInterval(clockId);
 level=Number(byId("levelSelect").value);
 session=createRunSession(level,SEED);
 display={...session.player};frameLog=[];requestedCollect=false;
 pressedKeys.clear();pressedPads.clear();document.querySelectorAll("[data-dir]").forEach(b=>b.classList.remove("pressed"));
 running=true;runEnd=performance.now()+MAX_TICKS*TICK_MS;
 byId("levelSelect").disabled=true;byId("start").textContent="เริ่มใหม่";
 byId("level").textContent=LEVELS[level].name+" • ฝึก";
 byId("status").textContent="กำลังเล่นรอบฝึก • คะแนนนี้ยังไม่บันทึกลงอันดับจริง";
 updateHud();
 clockId=setInterval(step,TICK_MS);
}
function direction(){
 const left=pressedPads.has("left")||pressedKeys.has("ArrowLeft")||pressedKeys.has("a");
 const right=pressedPads.has("right")||pressedKeys.has("ArrowRight")||pressedKeys.has("d");
 const up=pressedPads.has("up")||pressedKeys.has("ArrowUp")||pressedKeys.has("w");
 const down=pressedPads.has("down")||pressedKeys.has("ArrowDown")||pressedKeys.has("s");
 return [Number(right)-Number(left),Number(down)-Number(up)];
}
function step(){
 if(!running)return;
 if(performance.now()>=runEnd){finish("ครบเวลา 3 นาที");return;}
 const [x,y]=direction(),frame=[x,y,requestedCollect?1:0];
 requestedCollect=false;
 advanceRunTick(session,frame);
 frameLog.push(frame);
 if(session.tick>=MAX_TICKS)finish("ครบ 900 จังหวะ");
 updateHud();
}
function finish(reason){
 if(!running)return;
 running=false;clearInterval(clockId);clockId=null;
 byId("levelSelect").disabled=false;
 pressedPads.clear();pressedKeys.clear();requestedCollect=false;
 // Browser-side replay is a parity self-check, NOT server authentication.
 let matched=false;
 try{
  const expected=replayRun({level,seed:SEED,frames:frameLog});
  matched=expected.score===session.score
    &&expected.coinsCollected===session.coinsCollected
    &&expected.chestCollected===session.chestCollected
    &&Math.abs(expected.finalX-Math.round(session.player.x*1000)/1000)<0.000001
    &&Math.abs(expected.finalY-Math.round(session.player.y*1000)/1000)<0.000001;
 }catch{matched=false;}
 byId("status").textContent=reason+" • คะแนนฝึก "+session.score+
  " • ตรวจย้อนหลังในเบราว์เซอร์: "+(matched?"ตรงกัน":"ไม่ตรงกัน")+
  " • ยังไม่ได้รับรองจากเซิร์ฟเวอร์ / ไม่ส่งคะแนนจริง";
 updateHud();
}
function updateHud(){
 byId("score").textContent=String(session.score);
 byId("coins").textContent=String(session.coinsCollected);
 byId("ticks").textContent=session.tick+"/"+MAX_TICKS;
 const remaining=running?Math.max(0,Math.min((MAX_TICKS-session.tick)*TICK_MS,
   runEnd-performance.now())):(session.tick?0:MAX_TICKS*TICK_MS);
 const seconds=Math.ceil(remaining/1000);
 byId("time").textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+
   String(seconds%60).padStart(2,"0");
}
function paint(now){
 const dt=Math.min(.07,Math.max(0,(now-lastDraw)/1000));lastDraw=now;
 display.x+=(session.player.x-display.x)*Math.min(1,dt*15);
 display.y+=(session.player.y-display.y)*Math.min(1,dt*15);
 const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
 if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 }
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle="#0a1f24";ctx.fillRect(0,0,width,height);
 const camX=display.x*TILE-width/2,camY=display.y*TILE-height/2;
 const xmin=Math.max(0,Math.floor(camX/TILE)),xmax=Math.min(MAP_SIZE-1,Math.ceil((camX+width)/TILE));
 const ymin=Math.max(0,Math.floor(camY/TILE)),ymax=Math.min(MAP_SIZE-1,Math.ceil((camY+height)/TILE));
 const style=LEVELS[level];
 for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
  const sx=x*TILE-camX,sy=y*TILE-camY,tile=session.map.tiles[y][x];
  ctx.fillStyle=(x+y)%2?style.land:style.shade;ctx.fillRect(sx,sy,TILE+1,TILE+1);
  if(tile===1){
   ctx.fillStyle="#5d4933";ctx.fillRect(sx+14,sy+14,7,18);
   ctx.fillStyle="#1a5d43";ctx.beginPath();ctx.arc(sx+17,sy+11,12,0,Math.PI*2);ctx.fill();
  }else if(tile===2){
   ctx.fillStyle="#657478";ctx.fillRect(sx+3,sy+7,TILE-6,TILE-7);
  }else if(tile===3){
   ctx.fillStyle="#2b626a";ctx.fillRect(sx+4,sy+4,TILE-8,TILE-8);
  }
 }
 for(const c of session.map.coins){
  if(c.nextTick>session.tick)continue;
  const x=c.x*TILE-camX,y=c.y*TILE-camY;
  if(x< -15||x>width+15||y< -15||y>height+15)continue;
  ctx.fillStyle="#ffdd71";ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#ab6a23";ctx.lineWidth=2;ctx.stroke();
 }
 if(!session.map.chest.claimed){
  const x=session.map.chest.x*TILE-camX,y=session.map.chest.y*TILE-camY;
  ctx.fillStyle="#b86b23";ctx.fillRect(x-11,y-9,22,17);
  ctx.strokeStyle="#ffe181";ctx.lineWidth=4;ctx.strokeRect(x-11,y-9,22,17);
 }
 const x=display.x*TILE-camX,y=display.y*TILE-camY;
 ctx.fillStyle="#0a2721a0";ctx.beginPath();ctx.ellipse(x,y+11,11,4,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#388fe1";ctx.fillRect(x-8,y-2,16,17);
 ctx.fillStyle="#e9ba89";ctx.fillRect(x-8,y-16,16,16);
 ctx.fillStyle="#4c3429";ctx.fillRect(x-9,y-19,18,5);
 ctx.fillStyle="#132a29";ctx.fillRect(x-4,y-9,2,2);ctx.fillRect(x+3,y-9,2,2);
 if(!running&&!session.tick){
  ctx.fillStyle="#092327bb";ctx.fillRect(0,0,width,height);
  ctx.textAlign="center";ctx.fillStyle="#ffdf8e";ctx.font="bold 18px system-ui";
  ctx.fillText("เริ่มฝึกเพื่อออกล่าสมบัติ",width/2,height/2);
 }
 requestAnimationFrame(paint);
}
for(const el of document.querySelectorAll("[data-dir]")){
 const dir=el.dataset.dir;
 const down=e=>{
  e.preventDefault();
  if(!running)return;
  pressedPads.add(dir);el.classList.add("pressed");
  if(e.pointerId!==undefined)el.setPointerCapture(e.pointerId);
 };
 const up=()=>{
  pressedPads.delete(dir);el.classList.remove("pressed");
 };
 el.addEventListener("pointerdown",down);
 for(const type of ["pointerup","pointercancel","lostpointercapture"])el.addEventListener(type,up);
}
byId("collect").addEventListener("pointerdown",e=>{
 if(running){requestedCollect=true;e.preventDefault();}
});
byId("collect").addEventListener("click",e=>{if(e.detail===0&&running)requestedCollect=true;});
document.addEventListener("keydown",e=>{
 const k=e.key.length===1?e.key.toLowerCase():e.key;
 if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"," "].includes(k))e.preventDefault();
 if(k===" "&&!e.repeat&&running)requestedCollect=true;
 pressedKeys.add(k);
});
document.addEventListener("keyup",e=>pressedKeys.delete(e.key.length===1?e.key.toLowerCase():e.key));
window.addEventListener("blur",()=>{pressedKeys.clear();pressedPads.clear();});
document.addEventListener("visibilitychange",()=>{if(document.hidden){pressedKeys.clear();pressedPads.clear();}});
byId("start").addEventListener("click",startRun);
byId("levelSelect").addEventListener("change",()=>{
 if(running)return;
 level=Number(byId("levelSelect").value);
 session=createRunSession(level,SEED);display={...session.player};
 byId("level").textContent=LEVELS[level].name+" • ฝึก";
 updateHud();
});
requestAnimationFrame(paint);
updateHud();
