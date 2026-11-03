// Simulate all 30 daily quotas, not a 30-day network load test.
// Cloudflare account traffic and real-user CPU/duration are intentionally
// NOT consumed by running this probe on GitHub Actions.
import {checkFree30DayScenario} from '../src/v16-online/free-tier-30day-feasibility.mjs';
const common={players:10_000,days:30};
const settings=[
 {id:'10k-always-idle-zero-updates',description:'10K sockets connected but no game actions; optimistic first-day handshakes only',...common},
 {id:'10k-idle-daily-reconnect',description:'10K idle; each reconnects once/day and reads global world once/day',...common,reconnectsPerPlayerPerDay:1,httpWorldReadsPerPlayerPerDay:1},
 {id:'10k-all-move-60seconds',description:'All 10K continuously update once per 60 seconds',...common,movingFraction:1,movementIntervalSeconds:60},
 {id:'10k-one-percent-move-3seconds',description:'Only 100 of 10K are moving every 3 seconds',...common,movingFraction:.01,movementIntervalSeconds:3},
 {id:'10k-five-percent-move-3seconds',description:'Only 500 of 10K are moving every 3 seconds',...common,movingFraction:.05,movementIntervalSeconds:3},
 {id:'10k-half-percent-move-3seconds',description:'Only 50 of 10K actively moving, other 9,950 idle',...common,movingFraction:.005,movementIntervalSeconds:3},
 {id:'10k-all-move-10minutes',description:'All 10K update position only once every 10 minutes; unsuitable for smooth action',...common,movingFraction:1,movementIntervalSeconds:600},
 {id:'10k-all-http-world-read-60seconds',description:'10K clients poll global snapshot over Worker HTTP every minute',...common,httpWorldReadsPerPlayerPerDay:1440},
 {id:'10k-mobile-reconnect-12times-day',description:'10K inactive clients reconnect every 2 hours on average',...common,reconnectsPerPlayerPerDay:12},
 {id:'10k-5pct-moving-plus-coin-and-zones',description:'500 active; 3s packets, 1 coin pickup/player/day plus 4 zone DO calls/player/day',...common,movingFraction:.05,movementIntervalSeconds:3,coinClaimsPerPlayerPerDay:1,zoneDoCallsPerPlayerPerDay:4}
];
const results=settings.map(({id,description,...input})=>{
 const r=checkFree30DayScenario(input);
 return {id,description,concurrentPlayers:r.simulatedConcurrentPlayers,
  movingPlayers:r.movingPlayers,days:r.days,
  firstDayWorkerRequests:r.firstDay.workerRequests,
  firstDayDurableRequestsMin:r.firstDay.durableObjectRequestsLowerBound,
  largestDailyWorkerRequests:r.maxWorkerRequestsInOneDay,
  largestDailyDurableRequestsMin:r.maxDoRequestsInOneDay,
  limitWorkerRequests:r.freeWorkerRequestsPerDay,
  limitDurableRequests:r.freeDurableRequestsPerDay,
  quotaFailDays:r.quotaFailDays,
  earliestQuotaFailDay:r.earliestQuotaFailDay,
  requestQuotasPassAll30Days:r.requestQuotasPassAll30Days,
  zeroDollarMultiplayerProven:r.thirtyDayZeroCostProven,
  realCloudflareConnectionsTested:0};
});
const result={
 schema:'v16-10k-30day-zero-dollar-feasibility-v1',
 runType:'deterministic-offline-30day-budget-math-not-live-traffic',
 plan:'Cloudflare Workers Free + SQLite Durable Objects',
 concurrentPlayerGoal:10_000,days:30,targetUSD:0,
 cloudflareOutgoingRequests:0,realConcurrentUsersTested:0,
 allSustainedInteractiveCasesPass:results.filter(x=>
  ['10k-all-move-60seconds','10k-one-percent-move-3seconds','10k-five-percent-move-3seconds']
   .includes(x.id)).every(x=>x.requestQuotasPassAll30Days),
 ceiling:checkFree30DayScenario({...common}).maxOptimisticMessagesPerPlayerFirstDay,
 minimumSecondsBetweenAllPlayerMessages:
  checkFree30DayScenario({...common}).minimumAverageInputGapSecondsForAllPlayers,
 results,
 conclusion:'10K mostly idle sockets may be within request allowance only. Persistent responsive Multiplayer for all 10K at $0/month cannot be proven and common active patterns mathematically exceed Free DO request quota before CPU/duration/zone/broadcast costs.',
 sources:[
  'https://developers.cloudflare.com/durable-objects/platform/pricing/',
  'https://developers.cloudflare.com/workers/platform/limits/',
  'https://developers.cloudflare.com/durable-objects/best-practices/websockets/'
 ]
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
