// Isolated V16 staging Worker + two authoritative Durable Object rooms.
// NOT WIRED TO PRODUCTION. All score writes disabled unless explicitly enabled
// AND Firebase Auth + App Check + account status + rate limit are verified.
import {verifyFirebaseIdToken} from '../online/firebase-auth.mjs';
import {verifyAppCheck} from './appcheck.mjs';
import {V16Room} from './room.mjs';
import {periodFor} from './periods.mjs';
const SCOPES={free:'free1',vip:'vip1',free1:'free1',vip1:'vip1'};
const json=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
function cors(request,env){const origin=request.headers.get('origin');
 if(origin&&origin!==env.ALLOWED_ORIGIN)return null;
 return origin?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,x-firebase-appcheck,content-type','vary':'Origin'}:{};
}
function scopeFrom(url){return SCOPES[url.searchParams.get('scope')||'free']||null;}
async function bodyJSON(req){const raw=await req.text();if(raw.length>2048)throw Error('Request too large');const body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object')throw Error('Invalid body');return body;}
export async function handleV16Request(req,env,testing={}){
 const headers=cors(req,env);if(!headers)return json({error:'Origin denied'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-max-age':'600'}});
 const url=new URL(req.url),scope=scopeFrom(url);
 if(url.pathname==='/api/v16/health')return json({ok:true,phase:'staging-preview',map:'v16-forest-100',writesEnabled:env.ENABLE_V16_WRITES==='true'},200,headers);
 if(!scope)return json({error:'Invalid server'},400,headers);
 if(!['/api/v16/world','/api/v16/join','/api/v16/move','/api/v16/collect'].includes(url.pathname))return json({error:'Not found'},404,headers);
 const read=url.pathname==='/api/v16/world';
 if(req.method!==(read?'GET':'POST'))return json({error:'Method not allowed'},405,headers);
 // World polling is opt-in on staging: public traffic to a DO costs CPU/storage.
 if(read&&env.ENABLE_V16_READS!=='true')return json({error:'World reads not enabled'},403,headers);
 if(!read&&env.ENABLE_V16_WRITES!=='true')return json({error:'Online writes not enabled'},403,headers);
 if(!env.ROOMS?.idFromName||!env.ROOMS?.get)return json({error:'World storage not configured'},503,headers);
 let uid=null,input={};
 if(!read){
  if(!env.FIREBASE_PROJECT_ID||!env.FIREBASE_PROJECT_NUMBER||!env.FIREBASE_APP_ID)return json({error:'Firebase security not configured'},503,headers);
  if(!env.ACCOUNT_STATUS?.fetch||!env.V16_RATE_LIMITER?.limit)return json({error:'Security gates not configured'},503,headers);
  const match=/^Bearer ([A-Za-z0-9_.-]{100,8192})$/.exec(req.headers.get('authorization')||'');
  if(!match)return json({error:'Google sign-in required'},401,headers);
  try{
   const identity=await (testing.verifyId||verifyFirebaseIdToken)(match[1],env.FIREBASE_PROJECT_ID);
   uid=identity.uid;
   if(typeof uid!=='string'||uid.length<1||uid.length>128)throw Error('Invalid verified UID');
   await (testing.verifyApp||verifyAppCheck)(req.headers.get('x-firebase-appcheck'),env.FIREBASE_PROJECT_NUMBER,env.FIREBASE_APP_ID);
   const status=await env.ACCOUNT_STATUS.fetch('https://internal/account-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uid})});
   if(!status.ok)throw Error('Account status unavailable');
   const person=await status.json();
   if(person.uid!==uid||person.disabled!==false||person.revoked!==false)throw Error('Account cannot participate');
   const limit=await env.V16_RATE_LIMITER.limit({key:uid});if(!limit.success)return json({error:'Too many requests'},429,headers);
   if(scope==='vip1')return json({error:'VIP verification pending'},403,headers);
   input=await bodyJSON(req);
  }catch{return json({error:'Authentication, App Check or account validation failed'},401,headers);}
 }
 const name=env.ROOMS.idFromName(scope),stub=env.ROOMS.get(name);
 const action=url.pathname.split('/').pop();
 const since=url.searchParams.get('since');
 if(read&&since!==null&&(!/^(0|[1-9][0-9]{0,14})$/.test(since)||!Number.isSafeInteger(Number(since))))
  return json({error:'Invalid version'},400,headers);
 const forwarded=new Request('https://internal/'+action,{method:read?'GET':'POST',headers:{'content-type':'application/json','x-internal-uid':uid||'','x-internal-scope':scope,...(read&&since!==null?{'x-world-since':since}:{})},body:read?undefined:JSON.stringify(input)});
 try{const response=await stub.fetch(forwarded);return json(await response.json(),response.status,headers)}catch{return json({error:'World temporarily unavailable'},503,headers)}
}
export default {fetch(req,env){return handleV16Request(req,env)}};
export class V16WorldRoom {
 constructor(state,env){this.state=state;this.env=env;this.room=null;this.queue=Promise.resolve();
  state.blockConcurrencyWhile(async()=>{
   const saved=await state.storage.get('v16-state');
   this.room=saved?V16Room.restore(saved):null;
  });
 }
 async reconcileStorage(scope,players=this.room?.players){
  try {
   const stored=await this.state.storage.get('v16-state');
   this.room=stored?V16Room.restore(stored):new V16Room(scope);
   if(players)this.room.players=new Map([...players].map(([id,p])=>[id,{...p}]));
  } catch {
   // Fail closed until the DO is restarted and its durable state is reloaded.
   this.storageBlocked=true;
  }
 }
 async fetch(req){
  const task=async()=>{
   const scope=req.headers.get('x-internal-scope');
   if(!['free1','vip1'].includes(scope))return json({error:'Invalid internal scope'},403);
   if(!this.room)this.room=new V16Room(scope);
   if(this.room.scope!==scope)return json({error:'Scope mismatch'},403);
   if(this.storageBlocked)return json({error:'World storage recovery required'},503);
   // One alarm per room at the next Bangkok season boundary.
   if(this.state.storage.getAlarm&&this.state.storage.setAlarm&&await this.state.storage.getAlarm()===null)
    await this.state.storage.setAlarm(Date.parse(periodFor(scope,Date.now()).resetsAt));
   const uid=req.headers.get('x-internal-uid');const now=Date.now();const action=new URL(req.url).pathname.slice(1);
   try{
    if(action==='world'){
     const previous=this.room.version,world=this.room.publicView(now);
     if(previous!==this.room.version){
      try {await this.state.storage.put('v16-state',this.room.save())}
      catch {
       await this.reconcileStorage(scope);
       return json({error:'Persistent world storage unavailable'},503);
      }
     }
     const since=req.headers.get('x-world-since');
     if(since!==null&&Number(since)===world.version)
      return json({ok:true,unchanged:true,version:world.version,scope});
     return json({ok:true,world});
    }
    if(req.method!=='POST'||!uid)return json({error:'Unauthorized internal operation'},403);
    const body=await req.json();let result;
    // An acknowledged pickup must be durable. If a DO write fails, restore
    // the last persisted state before accepting another claim; otherwise a
    // transient storage error could leave scores/coins changed only in RAM.
    const playerBefore=new Map([...this.room.players].map(([id,p])=>[id,{...p}]));
    if(action==='join')result=this.room.join(uid,now,body.name);
    else if(action==='move')result=this.room.move(uid,[body.dx,body.dy],now);
    else if(action==='collect'){
     if(!Number.isSafeInteger(body.claimSeq)||body.claimSeq<1)
      return json({error:'claimSeq required (start with nextClaimSeq from join)'},400);
     result=this.room.collect(uid,body.requestId,now,body.claimSeq);
    }
    else return json({error:'No such action'},404);
    // Persist score, cooldowns and dedupe IDs before confirming collection.
    // Player positions are ephemeral: clients must join after a DO restart.
    if(action==='join'||action==='collect'){
     try {
      await this.state.storage.put('v16-state',this.room.save());
     } catch {
      await this.reconcileStorage(scope,playerBefore);
      return json({error:'Persistent world storage unavailable'},503);
     }
    }
    return json({ok:true,result});
   }catch(e){return json({error:String(e.message||e).slice(0,110)},400)}
  };
  const next=this.queue.then(task,task);this.queue=next.then(()=>{},()=>{});return next;
 }
 async alarm(){
  const task=async()=>{
   if(!this.room||this.storageBlocked)return;
   const now=Date.now(),scope=this.room.scope,previous=this.room.version;
   this.room.rollover(now);
   // Alarm retries are at-least-once. Reconcile first if persistence fails,
   // so the next retry cannot silently lose the winner snapshot.
   if(previous!==this.room.version){
    try{await this.state.storage.put('v16-state',this.room.save())}
    catch{
     await this.reconcileStorage(scope);
     throw Error('Persistent world storage unavailable during reset');
    }
   }
   if(this.state.storage.setAlarm)
    await this.state.storage.setAlarm(Date.parse(periodFor(scope,now).resetsAt));
  };
  const next=this.queue.then(task,task);this.queue=next.then(()=>{},()=>{});return next;
 }
}
