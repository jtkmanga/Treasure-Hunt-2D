// Separate Cloudflare canary Worker; NEVER the live Treasure Hunt 2D Worker.
// No Firebase accounts, real player storage, real scores, coins or payments.
// A protected explicit POST triggers at most 75 synthetic zone DO calls.
import {ZoneTransport,ZONE_MAX_FANOUT} from '../v16-online/zone-transport.mjs';
import {V16PresenceZone as ShardClass,zoneName,zoneNamesAround}
 from '../v16-online/zone-shards.mjs';
export {ShardClass as V16PresenceZone};

const GATE_NAME='v16-isolated-zone-canary-gate-v1';
const GATE_SECRET_HEADER='x-zone-canary-internal';
const KEY='canary-daily-budget-v1';
const RUN_LIMIT=3;
const CALL_LIMIT=300;
const MAX_PER_RUN=75;
const TIMEOUT_MS=750;
const bounded=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const json=(value,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json','cache-control':'no-store',
  'x-content-type-options':'nosniff'}
});
function secretMatches(received,expected){
 if(typeof received!=='string'||typeof expected!=='string'||
  expected.length<32||expected.length>128||received.length>128)return false;
 let mismatch=received.length^expected.length;
 for(let i=0;i<expected.length;i++)
  mismatch|=(received.charCodeAt(i)||0)^expected.charCodeAt(i);
 return mismatch===0;
}
function validRequest(value){
 if(value===null||typeof value!=='object'||Array.isArray(value))
  return null;
 const keys=Object.keys(value);
 if(keys.some(k=>k!=='actors'&&k!=='reads'))return null;
 const actors=value.actors,reads=value.reads;
 if(!bounded(actors,1,10)||!bounded(reads,1,5))return null;
 const budget=actors*3+reads*ZONE_MAX_FANOUT;
 if(budget>MAX_PER_RUN)return null;
 return {actors,reads,budget};
}
function stagePayload(uid,alias,at,seq,x,y){
 return {uid,alias,at,seq,epoch:'canary-session-20261103',x,y};
}
export async function handleCanaryRequest(req,env){
 const path=new URL(req.url).pathname;
 if(path==='/health'&&req.method==='GET')
  return json({ok:true,service:'isolated-zone-canary-v1',
   enabled:env.CANARY_ENABLED==='true',publicGame:false});
 if(path!=='/run')return json({error:'Not found'},404);
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 // All costly Durable Object requests are prohibited unless explicitly enabled.
 if(env.CANARY_ENABLED!=='true')return json({error:'Canary disabled'},403);
 const token=/^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(
  req.headers.get('authorization')||'');
 if(!secretMatches(token?.[1],env.CANARY_RUN_TOKEN))
  return json({error:'Unauthorized'},401);
 if(!env.CANARY_GATE?.idFromName||!env.CANARY_GATE?.get)
  return json({error:'Canary storage unavailable'},503);
 const length=Number(req.headers.get('content-length')||'0');
 if(length>256)return json({error:'Oversized request'},413);
 let payload;
 try{payload=await req.json()}catch{return json({error:'Invalid request'},400)}
 const plan=validRequest(payload);
 if(!plan)return json({error:'Invalid canary budget'},400);
 const stub=env.CANARY_GATE.get(env.CANARY_GATE.idFromName(GATE_NAME));
 try{
  const response=await stub.fetch(new Request('https://canary-internal/run',{
   method:'POST',headers:{[GATE_SECRET_HEADER]:'1',
    'content-type':'application/json'},
   body:JSON.stringify(plan)
  }));
  return json(await response.json(),response.status);
 }catch{
  return json({error:'Canary unavailable; no automatic retries'},503);
 }
}
export default {fetch:handleCanaryRequest};
export class V16CanaryCoordinator{
 constructor(state,env){
  this.state=state;this.env=env;
  this.serial=Promise.resolve();
 }
 async fetch(req){
  if(req.method!=='POST'||new URL(req.url).pathname!=='/run'||
   req.headers.get(GATE_SECRET_HEADER)!=='1'||
   this.state.id?.name!==GATE_NAME)
   return json({error:'Internal canary only'},403);
  const task=async()=>{
   let plan;
   try{plan=validRequest(await req.json())}catch{return json({error:'Bad canary plan'},400)}
   if(!plan)return json({error:'Bad canary plan'},400);
   if(!this.env.ZONE_ROOMS?.get||!this.env.ZONE_ROOMS?.idFromName)
    return json({error:'Canary zone binding unavailable'},503);
   const today=new Date().toISOString().slice(0,10);
   let saved=await this.state.storage.get(KEY);
   if(!saved||saved.date!==today)saved={date:today,runs:0,reservedCalls:0};
   if(saved.runs>=RUN_LIMIT||saved.reservedCalls+plan.budget>CALL_LIMIT)
    return json({error:'Daily canary request budget exhausted'},429);
   // Charge worst-case initiated DO requests BEFORE sending any subrequests.
   saved={date:today,runs:saved.runs+1,
    reservedCalls:saved.reservedCalls+plan.budget};
   await this.state.storage.put(KEY,saved);
   const transport=new ZoneTransport(this.env.ZONE_ROOMS,{timeoutMs:TIMEOUT_MS});
   const started=performance.now();
   let phase='initial';
   const actorIds=[];
   try{
    for(let i=0;i<plan.actors;i++){
     const uid='synthetic-canary-'+i,alias='avatar_'+crypto.randomUUID();
     const old={x:9.4+i*0.01,y:9.6},next={x:10.2+i*0.01,y:9.6};
     const at=Date.now();
     const initial=stagePayload(uid,alias,at,1,old.x,old.y);
     const updated=stagePayload(uid,alias,at+1,2,next.x,next.y);
     const oldZone=zoneName(old.x,old.y),newZone=zoneName(next.x,next.y);
     phase='upsert-old';
     await transport.send(oldZone,'/zone/upsert',initial);
     phase='upsert-new';
     await transport.send(newZone,'/zone/upsert',updated);
     phase='remove-old';
     await transport.send(oldZone,'/zone/remove',updated);
     actorIds.push(uid);
    }
    phase='nearby';
    let maxReturned=0;
    for(let n=0;n<plan.reads;n++){
     const viewer={x:10.25,y:9.6};
     const zones=zoneNamesAround(viewer.x,viewer.y);
     if(zones.length>ZONE_MAX_FANOUT)throw Error('Invalid fanout');
     const values=await Promise.all(zones.map(name=>
      transport.send(name,'/zone/nearby',viewer)));
     for(const result of values){
      if(!Array.isArray(result.records)||result.records.length>24)
       throw Error('Unbounded shard records');
      maxReturned=Math.max(maxReturned,result.records.length);
     }
    }
    return json({ok:true,mode:'isolated-synthetic-cloudflare-canary',
     actorsTested:actorIds.length,nearbyReads:plan.reads,
     zoneRequestBudgetReserved:plan.budget,
     maxReturnedFromSingleZone:maxReturned,
     elapsedMs:Math.round((performance.now()-started)*1000)/1000,
     transport:transport.report(),
     runsRemainingToday:RUN_LIMIT-saved.runs,
     realAuthenticatedPlayersTested:0,
     gameScoresChanged:false,
     resultScope:'isolated test DOs only'});
   }catch{
    const summary=transport.report();
    return json({ok:false,error:'Canary shard test incomplete',
     stage:phase,transport:summary,
     reservedRequests:plan.budget,
     runsRemainingToday:RUN_LIMIT-saved.runs,
     gameScoresChanged:false},503);
   }
  };
  const result=this.serial.then(task,task);
  this.serial=result.then(()=>{},()=>{});
  return result;
 }
}
