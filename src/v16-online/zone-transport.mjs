// Bounded internal Durable Object transport. No public endpoints, auth tokens,
// wallet/score operations, external URL targets or automatic destructive retry.
// Synthetic tests may inject a custom DO binding, but not a network address.
export const DEFAULT_ZONE_TIMEOUT_MS=750;
export const ZONE_MAX_FANOUT=9;
const INTERNAL_HEADER='x-v16-zone-internal';
const MAX_SAMPLES=2048;
const MAX_PAYLOAD_BYTES=4096;
const round=v=>Math.round(v*1000)/1000;
function elapsedClock(){
 return typeof performance?.now==='function'?performance.now():Date.now();
}
export class ZoneTransportError extends Error{
 constructor(code){super('Zone shard '+code);this.name='ZoneTransportError';this.code=code}
}
function format(values){
 const sorted=values.slice().sort((a,b)=>a-b);
 const pick=p=>sorted.length?round(sorted[Math.max(0,Math.ceil(p*sorted.length)-1)]):0;
 return {samples:sorted.length,p50Ms:pick(.5),p95Ms:pick(.95),p99Ms:pick(.99)};
}
export class ZoneTransport{
 constructor(namespace,{timeoutMs=DEFAULT_ZONE_TIMEOUT_MS}={}){
  if(!namespace?.get||!namespace?.idFromName)
   throw new Error('Missing zone Durable Object binding');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<50||timeoutMs>5000)
   throw new Error('Invalid zone timeout budget');
  this.namespace=namespace;this.timeoutMs=timeoutMs;
  this.total=0;this.success=0;this.deadlines=0;this.rejected=0;
  this.transportErrors=0;this.inFlight=0;this.peakInFlight=0;
  this.durationSamples=[];this.actions={};
 }
 async send(name,path,payload){
  if(!/^v16-preview-zone-v1-x[0-9]y[0-9]$/.test(name)||
   !['/zone/upsert','/zone/remove','/zone/nearby'].includes(path))
   throw new ZoneTransportError('invalid destination');
  const body=JSON.stringify(payload);
  if(body.length>MAX_PAYLOAD_BYTES)
   throw new ZoneTransportError('oversized packet');
  const type=path.split('/').at(-1);
  this.total++;this.actions[type]=(this.actions[type]||0)+1;
  this.inFlight++;this.peakInFlight=Math.max(this.peakInFlight,this.inFlight);
  const controller=new AbortController();
  const started=elapsedClock();
  let timeoutHandle,deadlineReached=false;
  try{
   const request=new Request('https://zone-internal'+path,{
    method:'POST',headers:{[INTERNAL_HEADER]:'1','content-type':'application/json'},
    body,signal:controller.signal
   });
   const stub=this.namespace.get(this.namespace.idFromName(name));
   const work=Promise.resolve().then(async()=>{
    const response=await stub.fetch(request);
    if(!response?.ok){
     throw new ZoneTransportError('rejected');
    }
    const value=await response.json();
    if(value?.ok!==true)throw new ZoneTransportError('rejected');
    return value;
   });
   const deadline=new Promise((_,reject)=>{
    timeoutHandle=setTimeout(()=>{
     deadlineReached=true;controller.abort();
     reject(new ZoneTransportError('deadline'));
    },this.timeoutMs);
   });
   const result=await Promise.race([work,deadline]);
   this.success++;
   return result;
  }catch(error){
   if(deadlineReached||error?.code==='deadline')this.deadlines++;
   else if(error?.code==='rejected')this.rejected++;
   else this.transportErrors++;
   // Client receives only a category; not raw DO IDs, secrets or credentials.
   if(error instanceof ZoneTransportError)throw error;
   throw new ZoneTransportError('transport failure');
  }finally{
   clearTimeout(timeoutHandle);
   this.inFlight--;
   if(this.durationSamples.length>=MAX_SAMPLES)this.durationSamples.shift();
   this.durationSamples.push(elapsedClock()-started);
  }
 }
 report(){
  return {
   schema:'v16-zone-transport-v1',
   requestCount:this.total,successful:this.success,
   deadlineCount:this.deadlines,rejectedCount:this.rejected,
   transportErrorCount:this.transportErrors,
   inFlight:this.inFlight,peakInFlight:this.peakInFlight,
   actionCounts:{...this.actions},
   latency:format(this.durationSamples),
   timeoutBudgetMs:this.timeoutMs
  };
 }
}
