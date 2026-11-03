// Stand-alone opt-in operator-only synthetic WebSocket Hibernation probe.
// NOT connected to Treasure Hunt 2D gameplay, Firebase, coins, VIP, or scores.
// Live browser accounts cannot use this: browsers cannot supply custom headers
// and this probe intentionally has no Firebase ticket-minting endpoint.
import {V16HibernatingPresenceProbe} from '../v16-online/hibernating-event-probe.mjs';
export {V16HibernatingPresenceProbe};

const json=(body,status)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
function secretMatches(received,expected){
 if(typeof received!=='string'||typeof expected!=='string'||
  expected.length<32||expected.length>128||received.length>128)return false;
 let diff=received.length^expected.length;
 for(let i=0;i<expected.length;i++)
  diff|=(received.charCodeAt(i)||0)^expected.charCodeAt(i);
 return diff===0;
}
export async function handleEventProbe(req,env){
 const url=new URL(req.url);
 if(url.pathname==='/health'&&req.method==='GET')
  return json({ok:true,service:'v16-isolated-event-ws-probe',
   enabled:env.EVENT_PROBE_ENABLED==='true'&&
    env.EVENT_PROBE_BILLING_REVIEWED==='true',liveGame:false},200);
 if(url.pathname!=='/connect')return json({error:'Not found'},404);
 if(env.EVENT_PROBE_ENABLED!=='true'||
  env.EVENT_PROBE_BILLING_REVIEWED!=='true')
  return json({error:'Event probe disabled'},403);
 if(req.method!=='GET'||req.headers.get('upgrade')?.toLowerCase()!=='websocket')
  return json({error:'Expected WebSocket'},426);
 const auth=/^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.get('authorization')||'');
 if(!secretMatches(auth?.[1],env.EVENT_PROBE_OPERATOR_TOKEN))
  return json({error:'Unauthorized'},401);
 const actor=req.headers.get('x-synthetic-actor');
 if(typeof actor!=='string'||!/^synthetic-actor-[0-9]{1,5}$/.test(actor))
  return json({error:'Synthetic actor required'},403);
 if(!env.EVENT_PROBE_ROOMS?.get||!env.EVENT_PROBE_ROOMS?.idFromName)
  return json({error:'Isolated probe unavailable'},503);
 if(typeof env.EVENT_PROBE_INTERNAL_SECRET!=='string'||
  env.EVENT_PROBE_INTERNAL_SECRET.length<32)
  return json({error:'Internal probe key missing'},503);
 // Only the Worker may reach the bound DO. Never forward the operator token,
 // origin-provided position, Firebase UID or arbitrary zone name.
 const headers=new Headers({
  upgrade:'websocket','x-internal-event-secret':env.EVENT_PROBE_INTERNAL_SECRET,
  'x-synthetic-actor':actor
 });
 const internal=new Request('https://internal/probe-connect',{headers});
 const room=env.EVENT_PROBE_ROOMS.get(
  env.EVENT_PROBE_ROOMS.idFromName('event-probe-isolated-synthetic-v1'));
 try{return await room.fetch(internal)}
 catch{return json({error:'Event probe unavailable'},503)}
}
export default {fetch:handleEventProbe};
