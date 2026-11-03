// Safe offline 10K presence locality benchmark. Never talks to Cloudflare.
import {performance} from 'node:perf_hooks';
import {webcrypto} from 'node:crypto';
import {ZonePresenceIndex,ZONE_VISIBILITY_CAP} from '../src/v16-online/zone-presence.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const valid=(v,min,max)=>Number.isSafeInteger(Number(v))&&+v>=min&&+v<=max?+v:(()=>{throw Error('Invalid benchmark size')})();
export function runZoneBenchmark({players=10_000,queries=1_000}={}){
 players=valid(players,1,10_000);queries=valid(queries,1,5_000);
 const index=new ZonePresenceIndex(),now=Date.parse('2026-11-03T10:00:00Z');
 const ids=Array.from({length:players},(_,i)=>'synthetic-zone-'+i);
 const pos=i=>({x:10+(i%80)+.35,y:10+(Math.floor(i/80)%80)+.35,lastAt:now});
 const t0=performance.now();
 for(let i=0;i<players;i++)index.upsert(ids[i],pos(i));
 const t1=performance.now(),latencies=[];
 let delivered=0,maxDelivered=0;
 for(let q=0;q<queries;q++){
  const uid=ids[(q*977)%players],start=performance.now();
  const found=index.nearby(uid,now);
  latencies.push(performance.now()-start);
  delivered+=found.players.length;
  maxDelivered=Math.max(maxDelivered,found.players.length);
  if(found.players.length>ZONE_VISIBILITY_CAP||!found.viewerActive)
   throw Error('Invalid bounded nearby result');
 }
 const t2=performance.now();
 let migrated=0;
 for(let i=0;i<players;i++){
  const p=pos(i);
  p.x+=(i%2===0?10:-10);p.y+=(i%3===0?10:-10);
  p.lastAt=now+100;
  const old=index.entries.get(ids[i]).cell;
  index.upsert(ids[i],p);
  if(index.entries.get(ids[i]).cell!==old)migrated++;
 }
 const t3=performance.now();
 if(!index.checkInvariants()||index.size!==players)
  throw Error('Zone index invariant failed under cross-zone movement');
 const ordered=latencies.slice().sort((a,b)=>a-b);
 const pct=p=>Math.round(ordered[Math.ceil(p*ordered.length)-1]*1000)/1000;
 return {schema:'v16-local-zone-capacity-v1',mode:'offline-no-browser-no-network',
  actors:players,queries,crossZoneMigrations:migrated,returnedPlayers:delivered,
  maxReturnedPlayers:maxDelivered,returnedPlayersCap:ZONE_VISIBILITY_CAP,
  zoneCellSize:10,zoneCount:index.cells.size,
  phaseMs:{upsert:Math.round((t1-t0)*1000)/1000,
   nearbyQueries:Math.round((t2-t1)*1000)/1000,
   migration:Math.round((t3-t2)*1000)/1000},
  queryLatencyMs:{p50:pct(.5),p95:pct(.95),p99:pct(.99)},
  networkRequests:0,verifiedRealConcurrentPlayers:0,productionReadyConclusion:false,
  note:'All actors and proximity checks run inside one Node process. This is not cross-DO sharding or 10K real authenticated online traffic.'};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  const actors=process.argv[2]===undefined?10_000:Number(process.argv[2]);
  const output=runZoneBenchmark({players:actors});
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
 }catch(e){process.stderr.write(String(e?.message||e)+'\n');process.exitCode=1}
}
