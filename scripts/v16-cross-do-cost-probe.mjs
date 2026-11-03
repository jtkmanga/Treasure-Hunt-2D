// Offline synthetic cross-DO transport work and cost-envelope sampler.
// Zero external requests, logins, WebSockets, Cloudflare network or payments.
// NOT a validation of real 10K concurrent users or Cloudflare billing.
import {performance} from 'node:perf_hooks';
import {webcrypto} from 'node:crypto';
import {V16Room} from '../src/v16-online/room.mjs';
import {V16PresenceZone,V16ZoneRouter} from '../src/v16-online/zone-shards.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const time=()=>performance.now();
const round=v=>Math.round(v*1000)/1000;
function valid(value,min,max){
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Invalid synthetic actor/query budget');
 return n;
}
export async function runCrossDoBenchmark({actors=100,queries=100}={}){
 actors=valid(actors,1,10_000);
 queries=valid(queries,1,1000);
 const started=time(),at=Date.now()-1000;
 const instances=new Map();
 const namespace={
  idFromName:name=>name,
  get(name){
   if(!instances.has(name))
    instances.set(name,new V16PresenceZone({id:{name}},{}));
   return {fetch:req=>instances.get(name).fetch(req)};
  }
 };
 const room=new V16Room('free1',at,()=>0);
 const router=new V16ZoneRouter(namespace,{timeoutMs:1000});
 const ids=Array.from({length:actors},(_,i)=>'synthetic-p'+i);
 for(let i=0;i<actors;i++){
  const uid=ids[i];
  room.join(uid,at,'Hunter');
  const p=room.requirePlayer(uid);
  p.x=i%100+.25;
  p.y=Math.floor(i/100)%100+.25;
  p.lastAt=at;
  p.previewNonce='bench-nonce-'+i;
  p.previewSeq=1;
  await router.sync(room,uid);
 }
 const joinedAt=time();
 for(let i=0;i<actors;i++){
  const p=room.requirePlayer(ids[i]);
  p.x=(p.x+10)%100;
  p.lastAt=at+100;
  p.previewSeq=2;
  await router.sync(room,ids[i]);
 }
 const migratedAt=time();
 let returned=0,maxReturned=0;
 for(let i=0;i<queries;i++){
  const uid=ids[(i*977)%actors];
  const result=await router.nearby(room,uid,at+250);
  if(!result.viewerActive||result.players.length>24)
   throw Error('Unbounded or stale cross-DO output');
  returned+=result.players.length;
  maxReturned=Math.max(maxReturned,result.players.length);
 }
 const ended=time();
 if(room.scores.size!==actors||room.publicView(at+300).coins.length!==200||
  !room.publicView(at+300).chest)
  throw Error('Global reward state must remain one canonical world');
 const traffic=router.report();
 if(traffic.deadlineCount||traffic.rejectedCount||traffic.transportErrorCount)
  throw Error('Healthy synthetic DO transport unexpectedly failed');
 return {
  schema:'v16-synthetic-cross-do-cost-envelope-v1',
  mode:'in-process-zone-DO-stubs-no-browser-no-network',
  simulatedPlayers:actors,verifiedRealConcurrentPlayers:0,networkRequests:0,
  actualCloudflareDORuns:0,productionReadyConclusion:false,
  syntheticZoneInstances:instances.size,viewerQueries:queries,
  totalPlayersReturned:returned,maxPlayersReturned:maxReturned,
  globalCoinCount:200,canonicalScoreEntries:room.scores.size,
  phaseMs:{initialProjection:round(joinedAt-started),
   crossZoneHandoffs:round(migratedAt-joinedAt),
   proximityFanout:round(ended-migratedAt),
   total:round(ended-started)},
  transport:traffic,
  caveat:'These are simulated DO subrequests, not Cloudflare billed requests, real network p99, live WebSockets, or authenticated user capacity.'
 };
}
const isMain=process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href;
if(isMain){
 try{
  const actors=process.argv[2]===undefined?100:Number(process.argv[2]);
  const queries=process.argv[3]===undefined?100:Number(process.argv[3]);
  process.stdout.write(JSON.stringify(await runCrossDoBenchmark({actors,queries}),null,2)+'\n');
 }catch(error){
  process.stderr.write('Offline cross-DO probe failed: '+String(error?.message||error)+'\n');
  process.exitCode=1;
 }
}
