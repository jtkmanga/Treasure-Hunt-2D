// V8 fullscreen forest practice. No persistent leaderboard or checkout here.
// Real-time shared pickups and payments MUST be implemented server-side.
import {TICK_MS,FOREST_SEED,createForestSession,advanceForestTick} from "./forest-engine.mjs";
import {createPixelArt} from "./pixel-art.mjs";
import {drawCohesiveWorld as drawPixelWorld,drawCohesiveMiniMap as drawMiniMap} from "./cohesive-world.mjs";
const el=id=>document.getElementById(id);
const world=el("world"),ctx=world.getContext("2d",{alpha:false}),mini=el("mini").getContext("2d");
if(!ctx||!mini)throw Error("Canvas 2D unsupported");
const art=createPixelArt(0),sessions={free:createForestSession(FOREST_SEED),vip:createForestSession(FOREST_SEED)};
let server="free",session=sessions.free,display={...session.player};
let running=false,paused=true,started=false,lastPaint=performance.now(),interval=null,collectPending=false;
let joyPointer=null,joyX=0,joyY=0,downKeys=new Set(),toastTimeout=0,modalResume=false,lastMini=0;
const stick=el("stick"),joystick=el("joystick"),menu=el("menu"),rotate=el("rotate"),serverSelect=el("serverSelect");
function isPortrait(){return innerHeight>innerWidth;}
function layout(){rotate.hidden=!isPortrait();if(!isPortrait())resizeCanvas();}
function resizeCanvas(){
 const w=world.clientWidth,h=world.clientHeight,dpr=Math.min(1.25,devicePixelRatio||1);
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
function paintAreaThumbnail(){
 const c=el("area-art");if(!c)return;
 const g=c.getContext("2d");if(!g)return;
 g.imageSmoothingEnabled=false;g.fillStyle="#286c4b";g.fillRect(0,0,c.width,c.height);
 g.fillStyle="#4d8550";g.fillRect(1,1,68,68);
 g.fillStyle="#8abf63";g.fillRect(12,49,49,14);
 g.drawImage(art.tree[1],-7,-6,56,70);
 g.drawImage(art.tree[3],25,-3,58,72);
 g.fillStyle="#ffda6b";g.fillRect(28,54,5,7);
}
function formatCountdown(ms){
 const t=Math.max(0,Math.ceil(ms/1000));
 const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;
 return [h,m,s].map(v=>String(v).padStart(2,"0")).join(":");
}
function updateHud(){
 el("score").textContent=session.score.toLocaleString("th-TH");
 el("coins").textContent=session.coinsCollected.toLocaleString("th-TH");
 el("level").textContent="📍 ป่าลึกลับ";
 el("region").textContent=(server==="free"?"Free Server":"VIP Server")+" · ป่า 100×100";
 const chest=session.map.chest,remaining=chest.respawnAt-Date.now();
 el("time").textContent=chest.claimed&&remaining>0?formatCountdown(remaining):"พร้อมเก็บ";
 el("board-server").textContent=server==="free"?"Free Server · อันดับรายสัปดาห์":"VIP Server · อันดับรายวัน";
 el("board-score").textContent=session.score.toLocaleString("th-TH");
}
function toast(message,seconds=2){
 el("toast").textContent=message;el("toast").classList.add("show");
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el("toast").classList.remove("show"),seconds*1000);
}
function clearControls(){
 joyPointer=null;joyX=joyY=0;downKeys.clear();collectPending=false;
 stick.style.transform="translate(-50%,-50%)";el("collect").classList.remove("pressed");
}
function startRun(){
 if(running)return;
 started=true;running=true;paused=false;menu.hidden=true;
 serverSelect.disabled=true;el("start").textContent="↻ เริ่มใหม่";
 clearControls();clearInterval(interval);interval=setInterval(simulate,TICK_MS);
 toast("กำลังสำรวจป่า 100×100 · ไม่จำกัดเวลา · โหมดฝึก");
 updateHud();
}
function pauseRun(){
 if(!running||paused)return;
 paused=true;clearInterval(interval);interval=null;clearControls();
 menu.hidden=false;el("resume").hidden=false;
 el("result").textContent="พักการสำรวจ · คะแนนนี้ยังอยู่แค่ในเครื่อง";updateHud();
}
function resumeRun(){
 if(!running||!paused||isPortrait())return;
 paused=false;menu.hidden=true;
 clearInterval(interval);interval=setInterval(simulate,TICK_MS);updateHud();
}
function resetRun(){
 clearInterval(interval);interval=null;clearControls();
 sessions[server]=createForestSession(FOREST_SEED);session=sessions[server];
 display={...session.player};running=false;paused=true;started=false;
 el("result").textContent="";startRun();
}
function switchServer(next){
 if(next!=="free"&&next!=="vip")return;
 if(running)return;
 server=next;session=sessions[server];display={...session.player};updateHud();
}
function direction(){
 const left=joyX<-.3||downKeys.has("arrowleft")||downKeys.has("a");
 const right=joyX>.3||downKeys.has("arrowright")||downKeys.has("d");
 const up=joyY<-.3||downKeys.has("arrowup")||downKeys.has("w");
 const down=joyY>.3||downKeys.has("arrowdown")||downKeys.has("s");
 return [Number(right)-Number(left),Number(down)-Number(up)];
}
function simulate(){
 if(!running||paused||!el("shop-panel").hidden||!el("leaderboard-panel").hidden||!el("reward-panel").hidden)return;
 const [dx,dy]=direction(),frame=[dx,dy,collectPending?1:0];collectPending=false;
 let event;
 try{event=advanceForestTick(session,frame,Date.now());}
 catch(err){pauseRun();toast("ระบบฝึกหยุด: "+String(err.message||err));return;}
 if(event?.type==="coin")toast("🪙 เก็บเหรียญ +"+event.coins,1);
 if(event?.type==="chest"){
  el("reward-value").textContent=event.coins.toLocaleString("th-TH");
  el("reward-panel").hidden=false;clearControls();
 }
 updateHud();
}
function setJoy(x,y){
 const r=joystick.getBoundingClientRect(),max=r.width*.29,dist=Math.hypot(x,y);
 if(dist>max){x=x/dist*max;y=y/dist*max;}
 joyX=max?x/max:0;joyY=max?y/max:0;
 stick.style.transform="translate(calc(-50% + "+Math.round(x)+"px),calc(-50% + "+Math.round(y)+"px))";
}
function moveJoy(e){
 const r=joystick.getBoundingClientRect();
 setJoy(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2);
}
joystick.addEventListener("pointerdown",e=>{
 if(!running||paused||!el("shop-panel").hidden||!el("leaderboard-panel").hidden)return;
 e.preventDefault();joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoy(e);
});
joystick.addEventListener("pointermove",e=>{if(joyPointer===e.pointerId)moveJoy(e);});
for(const type of ["pointerup","pointercancel","lostpointercapture"])
 joystick.addEventListener(type,e=>{if(joyPointer===e.pointerId){joyPointer=null;setJoy(0,0);}});
el("collect").addEventListener("pointerdown",e=>{
 if(!running||paused||!el("shop-panel").hidden||!el("reward-panel").hidden)return;
 e.preventDefault();collectPending=true;el("collect").classList.add("pressed");
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
 if(running&&!paused)pauseRun();
 else{menu.hidden=false;el("resume").hidden=!running||!paused;}
});
el("start").addEventListener("click",async()=>{
 await requestLandscape();if(running)resetRun();else startRun();
 if(isPortrait())pauseRun();
});
el("resume").addEventListener("click",()=>{resumeRun();void requestLandscape();});
el("fullscreen").addEventListener("click",()=>void requestLandscape());
el("rotate-full").addEventListener("click",()=>void requestLandscape());
serverSelect.addEventListener("change",()=>switchServer(serverSelect.value));
function modalShow(id){el(id).hidden=false;clearControls();}
el("shop-open").addEventListener("click",()=>modalShow("shop-panel"));
el("shop-close").addEventListener("click",()=>{el("shop-panel").hidden=true;});
el("leaderboard-open").addEventListener("click",()=>{updateHud();modalShow("leaderboard-panel");});
el("leaderboard-close").addEventListener("click",()=>{el("leaderboard-panel").hidden=true;});
el("reward-close").addEventListener("click",()=>{el("reward-panel").hidden=true;});
let lastMini=0;
function paint(now){
 // V7 sprite art and smooth camera are preserved; only the physics/map changed.
 if(now-lastPaint<30){requestAnimationFrame(paint);return;}
 const dt=Math.max(0,Math.min(.08,(now-lastPaint)/1000));lastPaint=now;
 const lerp=Math.min(1,dt*15);
 display.x+=(session.player.x-display.x)*lerp;
 display.y+=(session.player.y-display.y)*lerp;
 if(!isPortrait()){
  const {w,h}=resizeCanvas(),dpr=Math.min(1.25,devicePixelRatio||1);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawPixelWorld(ctx,session,art,w,h,display,now);
  if(now-lastMini>250){drawMiniMap(mini,session.map,display);lastMini=now;}
 }
 if(running&&!paused)updateHud();
 requestAnimationFrame(paint);
}
addEventListener("resize",layout);
addEventListener("orientationchange",layout);
document.addEventListener("fullscreenchange",layout);
paintAreaThumbnail();layout();updateHud();requestAnimationFrame(paint);
