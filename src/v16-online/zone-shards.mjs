// Prototype: physically separate SQLite-backed Durable Objects for presence.
// No reward/score writes. Not enabled on the existing running game.
import {ZONE_WORLD_SIZE,ZONE_CELL_SIZE,ZONE_VISIBILITY_CAP,
 ZONE_VISIBILITY_RADIUS,ZONE_IDLE_TTL_MS} from './zone-presence.mjs';
import {ZoneTransport,ZONE_MAX_FANOUT} from './zone-transport.mjs';

const PREFIX='v16-preview-zone-v1-x';
const INTERNAL_HEADER='x-v16-zone-internal';
const MAX_SKEW_MS=10_000;
const grid=ZONE_WORLD_SIZE/ZONE_CELL_SIZE;
const round=v=>Math.round(v*100)/100;
const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
function validPoint(x,y){
 return Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&
  x<ZONE_WORLD_SIZE&&y<ZONE_WORLD_SIZE;
}
export function zoneName(x,y){
 if(!validPoint(x,y))throw new Error('Invalid canonical zone position');
 return `${PREFIX}${Math.floor(x/ZONE_CELL_SIZE)}y${Math.floor(y/ZONE_CELL_SIZE)}`;
}
export function zoneNamesAround(x,y,radius=ZONE_VISIBILITY_RADIUS){
 if(!validPoint(x,y)||!Number.isFinite(radius)||radius<0||
  radius>ZONE_VISIBILITY_RADIUS)throw new Error('Invalid zone request');
 const fromX=Math.max(0,Math.floor((x-radius)/ZONE_CELL_SIZE));
 const toX=Math.min(grid-1,Math.floor((x+radius)/ZONE_CELL_SIZE));
 const fromY=Math.max(0,Math.floor((y-radius)/ZONE_CELL_SIZE));
 const toY=Math.min(grid-1,Math.floor((y+radius)/ZONE_CELL_SIZE));
 const names=[];
 for(let yi=fromY;yi<=toY;yi++)
  for(let xi=fromX;xi<=toX;xi++)
   names.push(`${PREFIX}${xi}y${yi}`);
 return names;
}
const zonePattern=/^v16-preview-zone-v1-x([0-9])y([0-9])$/;
const validUid=v=>typeof v==='string'&&v.length>0&&v.length<=128&&
 !/[\x00-\x1f\x7f]/.test(v);
const validEpoch=v=>typeof v==='string'&&v.length>=8&&v.length<=100&&
 /^[a-zA-Z0-9_-]+$/.test(v);
const validAlias=v=>typeof v==='string'&&/^avatar_[a-f0-9-]{36}$/.test(v);
const validSeq=v=>Number.isSafeInteger(v)&&v>=0;
const validAt=v=>Number.isSafeInteger(v)&&v>=0;
function newerOrSame(a,b){
 if(!b)return true;
 if(a.at!==b.at)return a.at>b.at;
 return a.epoch===b.epoch&&a.seq>=b.seq;
}
const isCurrent=(v,now)=>v&&now>=v.at&&now-v.at<ZONE_IDLE_TTL_MS;
export class V16PresenceZone {
 constructor(state,env){
  this.state=state;this.env=env;
  this.entries=new Map();this.fences=new Map();this.queue=Promise.resolve();
  // Ephemeral by design. No SQL score data or player IDs are persisted.
 }
 _prune(now,budget=64){
  let n=0;
  for(const [uid,entry] of this.entries){
   if(n++>=budget)break;
   if(!isCurrent(entry,now))this.entries.delete(uid);
  }
  n=0;
  for(const [uid,fence] of this.fences){
   if(n++>=budget)break;
   if(now-fence.at>ZONE_IDLE_TTL_MS*2)this.fences.delete(uid);
  }
 }
 async fetch(req){
  if(req.method!=='POST'||req.headers.get(INTERNAL_HEADER)!=='1')
   return json({error:'Internal zone access only'},403);
  const name=this.state.id?.name;
  if(!zonePattern.test(name||''))return json({error:'Unknown zone identity'},403);
  const task=async()=>{
   let input;
   try{input=await req.json()}catch{return json({error:'Invalid zone packet'},400)}
   const path=new URL(req.url).pathname;
   const now=Date.now();
   this._prune(now);
   if(path==='/zone/nearby'){
    if(!validPoint(input?.x,input?.y))return json({error:'Invalid viewer'},400);
    if(!zoneNamesAround(input.x,input.y).includes(name))
     return json({error:'Requested cell too far'},403);
    const ranked=[],r2=ZONE_VISIBILITY_RADIUS**2;
    const compare=(a,b)=>a.distance2-b.distance2||a.id.localeCompare(b.id);
    // Keep at most 24 per shard even when 10K actors occupy one cell.
    function insertBounded(candidate){
     if(ranked.length===ZONE_VISIBILITY_CAP&&
      compare(candidate,ranked.at(-1))>=0)return;
     let lo=0,hi=ranked.length;
     while(lo<hi){
      const mid=(lo+hi)>>1;
      if(compare(candidate,ranked[mid])<0)hi=mid;
      else lo=mid+1;
     }
     ranked.splice(lo,0,candidate);
     if(ranked.length>ZONE_VISIBILITY_CAP)ranked.pop();
    }
    for(const [uid,e] of this.entries){
     if(!isCurrent(e,now))continue;
     const dx=e.x-input.x,dy=e.y-input.y,dist2=dx*dx+dy*dy;
     if(dist2>r2)continue;
     insertBounded({uid,id:e.alias,x:e.x,y:e.y,
      epoch:e.epoch,seq:e.seq,at:e.at,distance2:dist2});
    }
    // Each zone sends at most 24 candidates, never all its 10K members.
    return json({ok:true,records:ranked});
   }
   if(!['/zone/upsert','/zone/remove'].includes(path))
    return json({error:'Unknown zone action'},404);
   const uid=input?.uid,at=input?.at,seq=input?.seq,
    epoch=input?.epoch,alias=input?.alias;
   if(!validUid(uid)||!validAt(at)||!validSeq(seq)||!validEpoch(epoch)||
    !validAlias(alias)||at>now+MAX_SKEW_MS||now-at>ZONE_IDLE_TTL_MS)
    return json({error:'Invalid authoritative zone update'},400);
   const previous=this.fences.get(uid);
   const incoming={at,seq,epoch};
   if(!newerOrSame(incoming,previous))
    return json({ok:true,ignoredStale:true});
   if(path==='/zone/upsert'){
    if(!validPoint(input.x,input.y)||zoneName(input.x,input.y)!==name)
     return json({error:'Wrong destination cell'},403);
    this.entries.set(uid,{uid,x:input.x,y:input.y,at,seq,epoch,alias});
    this.fences.set(uid,incoming);
    return json({ok:true,recorded:true});
   }
   this.entries.delete(uid);
   // A tombstone fences off a reordered old upsert after crossing zones.
   this.fences.set(uid,incoming);
   return json({ok:true,removed:true});
  };
  const next=this.queue.then(task,task);
  this.queue=next.then(()=>{},()=>{});
  return next;
 }
}
function verifiedProfile(room,uid){
 const p=room.requirePlayer(uid);
 if(!validPoint(p.x,p.y)||!validAt(p.lastAt)||
  !validSeq(p.previewSeq)||!validEpoch(p.previewNonce))
  throw new Error('Join and signed preview movement required for zone routing');
 return {uid,x:p.x,y:p.y,at:p.lastAt,seq:p.previewSeq,epoch:p.previewNonce};
}
// Canonical V16Room remains the sole owner of movement/coin/scores.
// This router only projects authoritative presence into separate zone DOs.
export class V16ZoneRouter {
 constructor(namespace,{timeoutMs}={}){
  this.transport=new ZoneTransport(namespace,{timeoutMs});
  this.published=new Map();this.aliases=new Map();
 }
 report(){return this.transport.report()}
 async _send(name,path,payload){
  return this.transport.send(name,path,payload);
 }
 async sync(room,uid){
  const profile=verifiedProfile(room,uid);
  const nextZone=zoneName(profile.x,profile.y),prev=this.published.get(uid);
  const alias=this.aliases.get(uid)||'avatar_'+crypto.randomUUID();
  const payload={...profile,alias};
  // New shard first: viewers will not see a gap during a normal transition.
  // If old removal fails, later sync retries and reads still filter stale zones
  // against the canonical current position and latest movement sequence.
  await this._send(nextZone,'/zone/upsert',payload);
  if(prev&&prev!==nextZone)
   await this._send(prev,'/zone/remove',payload);
  this.aliases.set(uid,alias);
  this.published.set(uid,nextZone);
  return {ok:true,zone:nextZone,transferred:!!prev&&prev!==nextZone};
 }
 async nearby(room,uid,now){
  const viewer=verifiedProfile(room,uid);
  if(!Number.isSafeInteger(now)||now<viewer.at)throw new Error('Invalid zone clock');
  const published=this.published.get(uid);
  if(published!==zoneName(viewer.x,viewer.y))
   return {players:[],viewerActive:false,radius:ZONE_VISIBILITY_RADIUS};
  if(now-viewer.at>=ZONE_IDLE_TTL_MS)
   return {players:[],viewerActive:false,radius:ZONE_VISIBILITY_RADIUS};
  const names=zoneNamesAround(viewer.x,viewer.y);
  if(names.length>ZONE_MAX_FANOUT)throw new Error('Zone fan-out budget exceeded');
  // A slow/unavailable shard fails this one proximity read; never fabricate
  // or serve stale player coordinates as authoritative.
  const pages=await Promise.all(names.map(name=>this._send(name,'/zone/nearby',{
   x:viewer.x,y:viewer.y})));
  const valid=[],seen=new Set(),r2=ZONE_VISIBILITY_RADIUS**2;
  for(const page of pages){
   if(!Array.isArray(page.records)||page.records.length>ZONE_VISIBILITY_CAP)
    throw new Error('Invalid zone shard response');
   for(const entry of page.records){
    if(!validUid(entry.uid)||entry.uid===uid||seen.has(entry.uid))continue;
    const p=room.players.get(entry.uid);
    const alias=this.aliases.get(entry.uid);
    if(!p||!alias||alias!==entry.id||this.published.get(entry.uid)!==zoneName(p.x,p.y)||
     p.lastAt!==entry.at||p.previewNonce!==entry.epoch||
     p.previewSeq!==entry.seq||now-p.lastAt>=ZONE_IDLE_TTL_MS)
     continue;
    const dist2=(p.x-viewer.x)**2+(p.y-viewer.y)**2;
    if(dist2>r2)continue;
    seen.add(entry.uid);
    // Names are resolved only from canonical room, never accepted from shards.
    const name=room.names.get(entry.uid)||'Hunter';
    valid.push({id:alias,name,x:round(p.x),y:round(p.y),distance2:dist2});
   }
  }
  valid.sort((a,b)=>a.distance2-b.distance2||a.id.localeCompare(b.id));
  return {players:valid.slice(0,ZONE_VISIBILITY_CAP)
   .map(({id,name,x,y})=>({id,name,x,y})),
   radius:ZONE_VISIBILITY_RADIUS,viewerActive:true};
 }
}
