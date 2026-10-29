import {TICK_MS,MAX_TICKS,createRunSession,advanceRunTick,replayRun} from "./run-engine.mjs";
import {createPixelArt,drawPixelWorld,drawMiniMap} from "./pixel-art.mjs";
const el=id=>document.getElementById(id);
const world=el("world"),ctx=world.getContext("2d",{alpha:false}),mini=el("mini").getContext("2d");
if(!ctx||!mini)throw Error("Canvas 2D unsupported");
const LEVELS=["ป่าลึกลับ","ถ้ำทองคำ","วิหารโบราณ"],SEED=123456789;
let level=0,session=createRunSession(0,SEED),art=createPixelArt(0),display={...session.player};
let running=false,paused=true,started=false,ended=false,lastPaint=performance.now();
let frameLog=[],interval=null,remainingMs=MAX_TICKS*TICK_MS,deadline=0,collectPending=false;
let joyPointer=null,joyX=0,joyY=0,downKeys=new Set(),toastTimeout=0;
const stick=el("stick"),joystick=el("joystick"),menu=el("menu"),rotate=el("rotate"),levels=el("levelSelect");
function isPortrait(){return innerHeight>innerWidth;}
function layout(){
 rotate.hidden=!isPortrait();
 if(!isPortrait())resizeCanvas();
}
function resizeCanvas(){
 const w=world.clientWidth,h=world.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
 const pw=Math.max(1,Math.floor(w*dpr)),ph=Math.max(1,Math.floor(h*dpr));
 if(world.width!==pw||world.height!==ph){world.width=pw;world.height=ph;}
 ctx.setTransform(dpr,0,0,dpr,0,0);return {w,h};
}
async function requestLandscape(){
 try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen)
  await document.documentElement.requestFullscreen({navigationUI:"hide"});}catch{}
 try{if(screen.orientation?.lock)await screen.orientation.lock("landscape");}catch{}
 layout();
}
function updateHud(){
 el("score").textContent=String(session.score);el("coins").textContent=String(session.coinsCollected);
 el("level").textContent=LEVELS[level];el("region").textContent="พื้นที่ "+(level+1)+" · ฝึกเท่านั้น";
 const ms=running&&!paused?Math.max(0,Math.min(remainingMs,deadline-performance.now())):remainingMs;
 const s=Math.ceil(Math.max(0,ms)/1000);
 el("time").textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
}
function toast(s,seconds=2){
 el("toast").textContent=s;el("toast").classList.add("show");
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el("toast").classList.remove("show"),seconds*1000);
}
function clearControls(){
 joyPointer=null;joyX=joyY=0;downKeys.clear();collectPending=false;
 stick.style.transform="translate(-50%,-50%)";el("collect").classList.remove("pressed");
}
function startRun(){
 clearInterval(interval);level=Number(levels.value);
 session=createRunSession(level,SEED);art=createPixelArt(level);display={...session.player};
 frameLog=[];remainingMs=MAX_TICKS*TICK_MS;started=true;ended=false;running=true;paused=false;
 deadline=performance.now()+remainingMs;levels.disabled=true;menu.hidden=true;
 el("start").textContent="↻ เริ่มใหม่";el("result").textContent="";
 clearControls();updateHud();interval=setInterval(simulate,TICK_MS);
 toast("เริ่มฝึก 3 นาที · ไม่มีคะแนนออนไลน์");
}
function pauseRun(){
 if(!running||paused)return;
 remainingMs=Math.max(0,Math.min(remainingMs,deadline-performance.now()));
 paused=true;clearInterval(interval);interval=null;clearControls();
 menu.hidden=false;el("resume").hidden=false;
 el("result").textContent="พักการฝึก · เวลาหยุดขณะพัก";updateHud();
}
function resumeRun(){
 if(!running||!paused||ended||isPortrait())return;
 paused=false;menu.hidden=true;deadline=performance.now()+remainingMs;
 clearInterval(interval);interval=setInterval(simulate,TICK_MS);updateHud();
}
function endRun(reason){
 if(ended||!started)return;
 running=false;paused=true;ended=true;clearInterval(interval);interval=null;
 remainingMs=0;clearControls();let matched=false;
 try{
  const result=replayRun({level,seed:SEED,frames:frameLog});
  matched=result.score===session.score&&result.coinsCollected===session.coinsCollected
   &&result.chestCollected===session.chestCollected
   &&result.finalX===Math.round(session.player.x*1000)/1000
   &&result.finalY===Math.round(session.player.y*1000)/1000;
 }catch{}
 menu.hidden=false;levels.disabled=false;el("resume").hidden=true;
 el("result").textContent=reason+" · คะแนนฝึก "+session.score+
  " · ตรวจย้อนหลังในเบราว์เซอร์ "+(matched?"ตรงกัน":"ไม่ตรงกัน")+
  " · ไม่ส่งคะแนนจริง";
 el("start").textContent="▶ เล่นอีกรอบ";toast("จบรอบฝึก "+session.score+" คะแนน",3);
 updateHud();
}
function direction(){
 const left=joyX<-.3||downKeys.has("arrowleft")||downKeys.has("a");
 const right=joyX>.3||downKeys.has("arrowright")||downKeys.has("d");
 const up=joyY<-.3||downKeys.has("arrowup")||downKeys.has("w");
 const down=joyY>.3||downKeys.has("arrowdown")||downKeys.has("s");
 return [Number(right)-Number(left),Number(down)-Number(up)];
}
function simulate(){
 if(!running||paused)return;
 if(performance.now()>=deadline){endRun("ครบเวลา 3 นาที");return;}
 const [dx,dy]=direction(),frame=[dx,dy,collectPending?1:0];collectPending=false;
 const old=session.score;
 try{advanceRunTick(session,frame);}catch{endRun("รอบฝึกหยุดเพราะข้อมูลเดินผิดปกติ");return;}
 frameLog.push(frame);
 if(session.score>old)toast(session.score-old>=100?"🗝️ เปิดหีบ +100":"🪙 เก็บเหรียญ +10",1);
 updateHud();if(session.tick>=MAX_TICKS)endRun("ครบ 900 จังหวะ");
}
function setJoy(x,y){
 const r=joystick.getBoundingClientRect(),max=r.width*.29;
 const distance=Math.hypot(x,y);
 if(distance>max){x=x/distance*max;y=y/distance*max;}
 joyX=max?x/max:0;joyY=max?y/max:0;
 stick.style.transform="translate(calc(-50% + "+Math.round(x)+"px),calc(-50% + "+Math.round(y)+"px))";
}
function moveJoy(e){
 const r=joystick.getBoundingClientRect();setJoy(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2);
}
joystick.addEventListener("pointerdown",e=>{
 if(!running||paused)return;e.preventDefault();
 joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoy(e);
});
joystick.addEventListener("pointermove",e=>{if(joyPointer===e.pointerId)moveJoy(e);});
for(const type of ["pointerup","pointercancel","lostpointercapture"])
 joystick.addEventListener(type,e=>{if(joyPointer===e.pointerId){joyPointer=null;setJoy(0,0);}});
el("collect").addEventListener("pointerdown",e=>{
 if(!running||paused)return;e.preventDefault();
 collectPending=true;el("collect").classList.add("pressed");
});
for(const type of ["pointerup","pointercancel","pointerleave"])
 el("collect").addEventListener(type,()=>el("collect").classList.remove("pressed"));
el("collect").addEventListener("click",e=>{if(e.detail===0&&running&&!paused)collectPending=true;});
window.addEventListener("keydown",e=>{
 const k=e.key.toLowerCase();
 if(["arrowleft","arrowright","arrowup","arrowdown","w","a","s","d"," "].includes(k))e.preventDefault();
 if(k===" "&&!e.repeat&&running&&!paused)collectPending=true;
 if(k==="escape"&&running&&!paused)pauseRun();
 downKeys.add(k);
});
window.addEventListener("keyup",e=>downKeys.delete(e.key.toLowerCase()));
window.addEventListener("blur",()=>{if(running&&!paused)pauseRun();});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&running&&!paused)pauseRun();});
window.addEventListener("pagehide",()=>{if(running&&!paused)pauseRun();});
el("pause").addEventListener("click",()=>{
 if(running&&!paused)pauseRun();else{menu.hidden=false;el("resume").hidden=!running||ended;}
});
el("start").addEventListener("click",()=>{startRun();void requestLandscape();});
el("resume").addEventListener("click",()=>{resumeRun();void requestLandscape();});
el("fullscreen").addEventListener("click",()=>void requestLandscape());
el("rotate-full").addEventListener("click",()=>void requestLandscape());
levels.addEventListener("change",()=>{
 if(started&&running)return;level=Number(levels.value);
 session=createRunSession(level,SEED);art=createPixelArt(level);
 display={...session.player};remainingMs=MAX_TICKS*TICK_MS;updateHud();
});
let lastMini=0;
function paint(now){
 const dt=Math.max(0,Math.min(.06,(now-lastPaint)/1000));lastPaint=now;
 const lerp=Math.min(1,dt*15);
 display.x+=(session.player.x-display.x)*lerp;
 display.y+=(session.player.y-display.y)*lerp;
 if(!isPortrait()){
  const {w,h}=resizeCanvas();const dpr=Math.min(2,devicePixelRatio||1);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawPixelWorld(ctx,session,art,w,h,display,now);
  if(now-lastMini>100){drawMiniMap(mini,session.map,display);lastMini=now;}
 }
 if(running&&!paused)updateHud();
 requestAnimationFrame(paint);
}
addEventListener("resize",layout);
addEventListener("orientationchange",layout);
document.addEventListener("fullscreenchange",layout);
layout();updateHud();requestAnimationFrame(paint);
