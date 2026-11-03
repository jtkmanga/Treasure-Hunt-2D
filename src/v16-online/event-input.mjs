// V16 Event-driven movement prototype. OFFLINE / NOT wired to live gameplay.
// The authoritative V16Room alone resolves collisions and coordinates.
// No client x/y, timestamps, UID overrides, coin grants or payment actions.
export const EVENT_INPUT_MAX_INTERVAL_MS=4000;
export const EVENT_INPUT_MIN_GAP_MS=70;
export const EVENT_INPUT_STEP_MS=200;
const MAX_PACKET_BYTES=160;
const MAX_SESSION_LENGTH=96;
const validClock=at=>Number.isSafeInteger(at)&&at>=0;
const safeAxes=value=>Array.isArray(value)&&value.length===2&&
 value.every(x=>Number.isInteger(x)&&x>=-100&&x<=100);
export function validateEventInput(raw){
 if(typeof raw!=='string'||raw.length>MAX_PACKET_BYTES)
  throw Error('Invalid event packet length');
 let data;
 try{data=JSON.parse(raw)}catch{throw Error('Malformed event packet')}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid event');
 const allowed=['type','seq','axes'];
 if(Object.keys(data).some(key=>!allowed.includes(key)))
  throw Error('Untrusted event fields');
 if(!['start','change','stop','heartbeat'].includes(data.type))
  throw Error('Invalid event type');
 if(!Number.isSafeInteger(data.seq)||data.seq<1)
  throw Error('Invalid event sequence');
 if(data.type==='start'||data.type==='change'){
  if(!safeAxes(data.axes))throw Error('Invalid direction axes');
 }else if(Object.hasOwn(data,'axes'))throw Error('No axes allowed in stop/heartbeat');
 return data;
}
export class AuthoritativeEventInput{
 constructor(room){
  if(!room?.move||!room?.requirePlayer)
   throw Error('Canonical room required');
  this.room=room;this.sessions=new Map();
 }
 begin(uid,serverNonce,now){
  if(typeof serverNonce!=='string'||serverNonce.length<12||
   serverNonce.length>MAX_SESSION_LENGTH||! /^[A-Za-z0-9_-]+$/.test(serverNonce)||
   !validClock(now))throw Error('Invalid server session');
  const actor=this.room.requirePlayer(uid);
  if(actor.lastAt>now)throw Error('Nonmonotonic server session');
  // Rebinding a validated session invalidates all old event sequences.
  if(actor.lastAt<now){
   this.room.move(uid,[0,0],now);
  }
  const state={nonce:serverNonce,at:now,axes:[0,0],seq:0,
   ack:{ok:true,seq:0,x:actor.x,y:actor.y,moving:false,needsResync:false}};
  this.sessions.set(uid,state);
  return {...state.ack};
 }
 _session(uid,nonce){
  const session=this.sessions.get(uid);
  if(!session||nonce!==session.nonce)throw Error('Stale event session');
  return session;
 }
 _advance(uid,session,now){
  if(now<session.at)throw Error('Nonmonotonic event server clock');
  const actor=this.room.requirePlayer(uid);
  if(actor.lastAt!==session.at)throw Error('Another movement protocol owns this session');
  const elapsed=now-session.at;
  const charged=Math.min(elapsed,EVENT_INPUT_MAX_INTERVAL_MS);
  let until=session.at+charged;
  // Existing canonical 200ms movement method checks obstacles and caps speed;
  // do not teleport to an untrusted client-predicted position.
  for(let at=session.at;at<until;){
   at=Math.min(at+EVENT_INPUT_STEP_MS,until);
   this.room.move(uid,session.axes,at);
  }
  if(elapsed>charged){
   // Lost long-running heartbeat: cap credit and force an explicit restart.
   // This is a consciously visible re-sync, not acceptance of a 60s teleport.
   this.room.move(uid,[0,0],now);
  }
  session.at=now;
  return elapsed>charged;
 }
 consume(uid,serverNonce,event,now){
  if(!validClock(now))throw Error('Invalid server clock');
  const parsed=typeof event==='string'?validateEventInput(event):
   validateEventInput(JSON.stringify(event));
  const state=this._session(uid,serverNonce);
  if(parsed.seq===state.seq)return {...state.ack,duplicate:true};
  if(parsed.seq!==state.seq+1)throw Error('Out-of-order event');
  const emergencyStop=parsed.type==='stop'&&
   (state.axes[0]!==0||state.axes[1]!==0);
  if(state.seq>0&&now-state.at<EVENT_INPUT_MIN_GAP_MS&&!emergencyStop)
   throw Error('Event rate limited');
  if(now<state.at)throw Error('Nonmonotonic server clock');
  // First validate packet & ordering; no state changes on rejected input.
  const capped=this._advance(uid,state,now);
  if(parsed.type==='stop'||capped&&parsed.type==='heartbeat')
   state.axes=[0,0];
  else if(parsed.type==='start'||parsed.type==='change')
   state.axes=[...parsed.axes];
  state.seq=parsed.seq;
  const actor=this.room.requirePlayer(uid);
  state.ack={ok:true,seq:state.seq,x:actor.x,y:actor.y,
   moving:!!(state.axes[0]||state.axes[1]),
   needsResync:capped};
  return {...state.ack};
 }
 // Future coin handler would call flush() before canonical collect(), never
 // accept claimed coordinates. This prototype doesn't hook into scores.
 flush(uid,serverNonce,now){
  if(!validClock(now))throw Error('Invalid server clock');
  const state=this._session(uid,serverNonce);
  const capped=this._advance(uid,state,now);
  if(capped)state.axes=[0,0];
  const actor=this.room.requirePlayer(uid);
  return {x:actor.x,y:actor.y,needsResync:capped};
 }
 close(uid,nonce){
  if(this.sessions.get(uid)?.nonce!==nonce)return false;
  this.sessions.delete(uid);return true;
 }
}
