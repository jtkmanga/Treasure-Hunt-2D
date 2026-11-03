// Isolated synthetic WebSocket Hibernation probe, NOT connected to a game world.
// Real players MUST NOT send inputs directly to this instance. A future gateway
// needs Google Firebase ID + App Check + account admission before granting a
// one-time ticket; this operator-only probe uses a separate high-entropy secret.
import {validateEventInput,EVENT_INPUT_MAX_INTERVAL_MS,
 EVENT_INPUT_MIN_GAP_MS} from './event-input.mjs';

const MAX_SOCKETS_PER_DO=50;
const MAX_MESSAGE_BYTES=160;
const IDLE_LIMIT_MS=90_000;
const USER_PREFIX='synthetic-actor-';
const json=(body,status)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
function equalSecret(a,b){
 if(typeof a!=='string'||typeof b!=='string'||b.length<32||
  b.length>128||a.length>128)return false;
 let mismatch=a.length^b.length;
 for(let i=0;i<b.length;i++)mismatch|=(a.charCodeAt(i)||0)^b.charCodeAt(i);
 return mismatch===0;
}
const matchesActor=uid=>typeof uid==='string'&&
 /^synthetic-actor-[0-9]{1,5}$/.test(uid)&&uid.length<40;
function serializeState(socket){
 try{return socket.deserializeAttachment?.()||null}catch{return null}
}
export class V16HibernatingPresenceProbe {
 constructor(state,env){
  this.state=state;this.env=env;
  // Auto-respond to literal ping frames without waking a hibernating DO.
  if(this.state.setWebSocketAutoResponse &&
   typeof WebSocketRequestResponsePair!=='undefined')
   this.state.setWebSocketAutoResponse(
    new WebSocketRequestResponsePair('ping','pong'));
 }
 async fetch(req){
  if(new URL(req.url).pathname!=='/probe-connect')return json({error:'Not found'},404);
  if(this.env.EVENT_PROBE_ENABLED!=='true')return json({error:'Event probe disabled'},403);
  if(req.headers.get('upgrade')?.toLowerCase()!=='websocket')return json({error:'Expected websocket'},426);
  if(!equalSecret(req.headers.get('x-internal-event-secret'),
   this.env.EVENT_PROBE_INTERNAL_SECRET))
   return json({error:'Unauthorized'},401);
  const uid=req.headers.get('x-synthetic-actor');
  if(!matchesActor(uid))return json({error:'Only synthetic actors accepted'},403);
  if(!this.state.acceptWebSocket||!this.state.getWebSockets||
   typeof WebSocketPair==='undefined')
   return json({error:'Hibernation not available'},503);
  if(this.state.getWebSockets().length>=MAX_SOCKETS_PER_DO)
   return json({error:'Connection cap reached'},429);
  const pair=new WebSocketPair(),[client,server]=Object.values(pair);
  server.serializeAttachment({
   uid,session:crypto.randomUUID(),seq:0,at:Date.now(),
   axes:[0,0],messages:0
  });
  this.state.acceptWebSocket(server);
  return new Response(null,{status:101,webSocket:client});
 }
 async webSocketMessage(ws,message){
  const session=serializeState(ws);
  if(!session||!matchesActor(session.uid))return;
  const now=Date.now();
  if(typeof message!=='string'||message.length>MAX_MESSAGE_BYTES){
   ws.close(1008,'Invalid event size');return;
  }
  if(now-session.at>IDLE_LIMIT_MS){
   ws.close(1008,'Rejoin required');return;
  }
  let packet;
  try{packet=validateEventInput(message)}
  catch{ws.send(JSON.stringify({ok:false,error:'Invalid event'}));return}
  if(packet.seq===session.seq){
   ws.send(JSON.stringify({ok:true,seq:packet.seq,duplicate:true,
    authoritative:false}));return;
  }
  if(packet.seq!==session.seq+1){
   ws.send(JSON.stringify({ok:false,error:'Event sequence mismatch'}));return;
  }
  const emergencyStop=packet.type==='stop'&&
   (session.axes[0]!==0||session.axes[1]!==0);
  if(session.seq>0&&now-session.at<EVENT_INPUT_MIN_GAP_MS&&!emergencyStop){
   ws.send(JSON.stringify({ok:false,error:'Event rate limited'}));return;
  }
  const expired=now-session.at>EVENT_INPUT_MAX_INTERVAL_MS;
  session.axes=packet.type==='stop'||expired&&packet.type==='heartbeat'
   ?[0,0]:packet.type==='heartbeat'?session.axes:[...packet.axes];
  session.seq=packet.seq;session.at=now;session.messages++;
  ws.serializeAttachment(session);
  // This is a safe transport/protocol acknowledgement, NOT movement credit.
  // Do not broadcast all clients, claim coins, persist score or alias this as
  // an authoritative game position. Canonical V16Room movement is separate.
  ws.send(JSON.stringify({ok:true,seq:packet.seq,authoritative:false,
   moving:!!(session.axes[0]||session.axes[1]),needsResync:expired}));
 }
 async webSocketClose(ws,code,reason,wasClean){
  try{ws.close(code||1000,reason||'closed')}catch{}
 }
 async webSocketError(ws,error){
  try{ws.close(1011,'Disconnected')}catch{}
 }
}
export function estimateRealtimeTransport({
 concurrent=10_000,movingFraction=0.1,
 movingEventIntervalSeconds=4,idleEventIntervalSeconds=60,
 days=30,workerBaseUSD=5,includedDurableRequests=1_000_000,
 durablePerMillionUSD=.15
}={}){
 if(!Number.isSafeInteger(concurrent)||concurrent<0||concurrent>100_000||
  !Number.isFinite(movingFraction)||movingFraction<0||movingFraction>1||
  !Number.isFinite(movingEventIntervalSeconds)||movingEventIntervalSeconds<1||
  !(idleEventIntervalSeconds===null||
    Number.isFinite(idleEventIntervalSeconds)&&idleEventIntervalSeconds>=10)||
  !Number.isSafeInteger(days)||days<1||days>31)
  throw Error('Invalid transport cost scenario');
 const seconds=days*86400;
 const movingMessages=concurrent*movingFraction*seconds/movingEventIntervalSeconds;
 const idleMessages=idleEventIntervalSeconds===null?0:
  concurrent*(1-movingFraction)*seconds/idleEventIntervalSeconds;
 const totalFrames=Math.ceil(movingMessages+idleMessages);
 // Cloudflare counts 20 incoming WebSocket messages as one DO request.
 const approximateDORequests=Math.ceil(totalFrames/20);
 const excess=Math.max(0,approximateDORequests-includedDurableRequests);
 const requestOverageUSD=Math.round(excess/1_000_000*durablePerMillionUSD*100)/100;
 return {
  schema:'v16-realtime-traffic-model-v1',
  concurrent,days,movingFraction,
  movingEventIntervalSeconds,idleEventIntervalSeconds,
  inboundClientMessages:totalFrames,
  estimatedDORequestsFromIncomingMessages:approximateDORequests,
  requestOnlyOverageUSD:requestOverageUSD,
  basePlusIncomingMessageRequestsUSD:Math.round((workerBaseUSD+requestOverageUSD)*100)/100,
  completeMonthlyBillKnown:false,
  underTenDollarTotalProven:false,
  realAuthenticatedConcurrencyTested:0,
  omitted:['Durable Object active duration','CPU','storage','Worker upgrade requests',
   'internal DO subrequests','outbound WebSocket messages','regional billing','payments']
 };
}
