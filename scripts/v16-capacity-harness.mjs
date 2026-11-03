// Non-Chromium, NO-NETWORK 10K capacity probe of V16 authoritative room core.
// It never opens a WebSocket, authenticates a real Google account, deploys code,
// calls Cloudflare, or touches existing Free/VIP/staging scores.
import {performance} from 'node:perf_hooks';
import {webcrypto} from 'node:crypto';
import {V16Room} from '../src/v16-online/room.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const FIXED_TIME=Date.parse('2026-11-03T10:00:00.000Z');
const LIMIT=10_000;
function validInt(value,min,max,label){
 const v=Number(value);
 if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('Invalid '+label+' (expected '+min+'..'+max+')');
 return v;
}
export function sampleStats(values){
 if(!values.length)return {samples:0,minMs:0,p50Ms:0,p95Ms:0,p99Ms:0,maxMs:0};
 const sorted=[...values].sort((a,b)=>a-b);
 const percentile=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
 const round=x=>Math.round(x*1000)/1000;
 return {samples:values.length,minMs:round(sorted[0]),p50Ms:round(percentile(.5)),
  p95Ms:round(percentile(.95)),p99Ms:round(percentile(.99)),maxMs:round(sorted.at(-1))};
}
const ms=x=>Math.round(x*1000)/1000;
const bytes=x=>Math.round(x/1024);
function elapsed(run){const before=performance.now();const value=run();return {value,ms:performance.now()-before};}
/**
 * Fully in-process synthetic player model; it benchmarks room logic, NOT 10K
 * real concurrent authenticated HTTP/WebSocket requests or Cloudflare limits.
 */
export function runCapacityProbe({players=100,movesPerPlayer=1,worldPolls=3,
 contention=2,seed=123456789}={}){
 players=validInt(players,1,LIMIT,'players');
 movesPerPlayer=validInt(movesPerPlayer,0,5,'movesPerPlayer');
 worldPolls=validInt(worldPolls,0,100,'worldPolls');
 contention=validInt(contention,0,Math.min(100,players),'contention');
 seed=validInt(seed,1,2**31-1,'seed');
 const started=performance.now();
 const room=new V16Room('free1',FIXED_TIME,()=>0,seed);
 const joinTimes=[],moveTimes=[],pollTimes=[];
 const initialMem=process.memoryUsage();
 const ids=Array.from({length:players},(_,i)=>'test-bot-'+String(i).padStart(5,'0'));
 for(let i=0;i<players;i++){
  const {value,ms:t}=elapsed(()=>room.join(ids[i],FIXED_TIME,'Bot'+i));
  if(value.score!==0||value.world?.coins?.length!==200)
   throw Error('Join state invalid at actor '+i);
  joinTimes.push(t);
  const p=room.requirePlayer(ids[i]);
  // Only sets test fixtures required by the validated V16.26 batch protocol.
  p.previewNonce='loadtest-'+i;p.previewSeq=0;
  p.previewCreditMs=100;p.previewBudgetAt=FIXED_TIME;
 }
 const joinEnd=performance.now();
 for(let repeat=0;repeat<movesPerPlayer;repeat++){
  for(let i=0;i<players;i++){
   const seq=repeat+1;
   const {value,ms:t}=elapsed(()=>room.movePreview(ids[i],[[100,0],[0,100]],seq,
    FIXED_TIME+200+repeat*100,'loadtest-'+i));
   if(!Number.isFinite(value.x)||!Number.isFinite(value.y))
    throw Error('Movement returned invalid position');
   moveTimes.push(t);
  }
 }
 const movementEnd=performance.now();
 let lastWorld=null;
 for(let i=0;i<worldPolls;i++){
  const {value,ms:t}=elapsed(()=>room.publicView(FIXED_TIME+1000+i*100));
  if(value.coins.length!==200)throw Error('Global coin cap violated');
  lastWorld=value;pollTimes.push(t);
 }
 const pollEnd=performance.now();
 // Explicit in-memory collision fixtures, never accepted as real client input.
 // All collectors point to ONE shared coin, to check only one score is granted.
 const target=room.map.coins[0];
 let awards=0;const claimAt=FIXED_TIME+5000;
 for(let i=0;i<contention;i++){
  const p=room.requirePlayer(ids[i]);
  p.x=target.x;p.y=target.y;p.lastAt=claimAt;
  const result=room.collect(ids[i],'capacity-claim-'+String(i).padStart(6,'0'),
   claimAt,1);
  if(result?.kind==='coin')awards++;
 }
 const contentionEnd=performance.now();
 if(contention>=1&&awards!==1)throw Error('Duplicate or missed coin grant in contention test');
 const snapshot=elapsed(()=>JSON.stringify(room.save()));
 const finalMem=process.memoryUsage();
 const ended=performance.now();
 if(room.players.size!==players||room.scores.size!==players)
  throw Error('Synthetic player/score population inconsistent');
 const report={
  schema:'v16-core-capacity-v1',
  mode:'offline-no-browser-no-network',
  simulatedPlayers:players,verifiedRealConcurrentPlayers:0,
  localRoomCount:1,authenticatedOnlineRequests:0,networkRequests:0,
  realisticCloudflareLoadTest:false,productionReadyConclusion:false,
  gates:{noCloudflareTraffic:true,noProductionWrites:true,onlySyntheticUids:true,
   globalCoins:room.map.coins.length,oneCoinClaimPerContention:awards===Math.min(contention,1),
   totalSyntheticPlayers:room.players.size},
  workload:{joins:players,movementBatches:players*movesPerPlayer,
   worldSnapshots:worldPolls,sameCoinClaims:contention,successfulCoinClaims:awards},
  durationMs:{joins:ms(joinEnd-started),movement:ms(movementEnd-joinEnd),
   world:ms(pollEnd-movementEnd),contention:ms(contentionEnd-pollEnd),
   serializeSnapshot:ms(snapshot.ms),total:ms(ended-started)},
  latencyMs:{join:sampleStats(joinTimes),move:sampleStats(moveTimes),
   world:sampleStats(pollTimes)},
  memoryKiB:{heapUsedStart:bytes(initialMem.heapUsed),heapUsedEnd:bytes(finalMem.heapUsed),
   rssEnd:bytes(finalMem.rss),serializedSnapshot:bytes(Buffer.byteLength(snapshot.value))},
  caveat:'Simulated 10K local room states is not proof of 10K real signed-in users, cross-instance scale, rate-limit allowance, DO CPU quotas or costs.'
 };
 return report;
}
function parseCli(argv){
 const result={};
 for(let i=0;i<argv.length;i++){
  const token=argv[i];
  if(!['--players','--moves','--polls','--contention'].includes(token)||
   !argv[i+1]||argv[i+1].startsWith('--'))
   throw Error('Usage: node scripts/v16-capacity-harness.mjs [--players 100|1000|10000] [--moves 0..5] [--polls 0..100] [--contention 0..100]');
  const prop={'--players':'players','--moves':'movesPerPlayer','--polls':'worldPolls','--contention':'contention'}[token];
  result[prop]=argv[++i];
 }
 return result;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  const output=runCapacityProbe(parseCli(process.argv.slice(2)));
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
 }catch(e){process.stderr.write('Capacity probe failed: '+String(e.message)+'\n');process.exitCode=1;}
}
