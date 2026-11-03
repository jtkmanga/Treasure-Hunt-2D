// Mobile input coalescer for the future signed WebSocket client.
// Not attached to live V16.26 controls. No timers or browser-specific globals.
// Call onInput(axes, monotonicNow) when analog changes, tick(now) in the local
// animation loop. Idle players produce ZERO heartbeat messages.
export const DEFAULT_MOVING_HEARTBEAT_MS=3000;
export const EVENT_CLIENT_MIN_GAP_MS=75;
function axes(v){
 if(!Array.isArray(v)||v.length!==2||
  !v.every(x=>Number.isFinite(x)&&x>=-100&&x<=100))
  throw Error('Invalid analog input');
 return v.map(x=>Math.max(-100,Math.min(100,Math.round(x))));
}
const idle=v=>v[0]===0&&v[1]===0;
const equals=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const validTime=now=>Number.isFinite(now)&&now>=0;
export class EventDrivenMobileInput{
 constructor(send,{heartbeatMs=DEFAULT_MOVING_HEARTBEAT_MS}={}){
  if(typeof send!=='function'||!Number.isSafeInteger(heartbeatMs)||
   heartbeatMs<500||heartbeatMs>4000)throw Error('Invalid transport setup');
  this.send=send;this.heartbeatMs=heartbeatMs;
  this.current=[0,0];this.desired=[0,0];
  this.seq=0;this.lastSendAt=null;
  this.sends=0;
 }
 _emit(type,now,next){
  const msg={type,seq:++this.seq};
  if(type==='start'||type==='change')msg.axes=[...next];
  this.send(JSON.stringify(msg));
  this.current=[...next];this.lastSendAt=now;this.sends++;
  return msg;
 }
 onInput(direction,now){
  if(!validTime(now))throw Error('Invalid input clock');
  this.desired=axes(direction);
  return this.tick(now);
 }
 tick(now){
  if(!validTime(now))throw Error('Invalid input clock');
  if(this.lastSendAt!==null&&now<this.lastSendAt)throw Error('Nonmonotonic input clock');
  // The server refuses event spam; collapse rapid direction changes into the
  // latest analog vector, to send on the first eligible later frame.
  if(this.lastSendAt!==null&&now-this.lastSendAt<EVENT_CLIENT_MIN_GAP_MS)
   return null;
  if(!equals(this.desired,this.current)){
   if(idle(this.desired))return this._emit('stop',now,[0,0]);
   return this._emit(idle(this.current)?'start':'change',now,this.desired);
  }
  if(!idle(this.current)&&this.lastSendAt!==null&&
   now-this.lastSendAt>=this.heartbeatMs)
   return this._emit('heartbeat',now,this.current);
  return null;
 }
 stop(now){
  if(!validTime(now))throw Error('Invalid input clock');
  this.desired=[0,0];return this.tick(now);
 }
 resetAfterReconnect(){
  // Requires a fresh validated server epoch/nonce, never replay old sequence.
  this.current=[0,0];this.desired=[0,0];this.seq=0;this.lastSendAt=null;
 }
}
