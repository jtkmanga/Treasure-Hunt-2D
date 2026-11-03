// 30-day deterministic Cloudflare Workers Free feasibility boundary model.
// No Cloudflare requests, secrets, browsers, socket connections, or timers.
// Pricing/quotas source: https://developers.cloudflare.com/durable-objects/platform/pricing/
// and https://developers.cloudflare.com/workers/platform/limits/ (Nov 2026).
// This model deliberately calculates an optimistic request-only LOWER BOUND.
// It CANNOT establish full zero-dollar feasibility (DO CPU/duration/storage,
// bandwidth, churn, auth and fan-out are workload-dependent).
export const FREE_WORKER_REQUESTS_PER_DAY=100_000;
export const FREE_DURABLE_REQUESTS_PER_DAY=100_000;
export const WS_INCOMING_MESSAGES_PER_BILLED_REQUEST=20;
export const SECONDS_PER_DAY=86_400;
function integer(value,min,max,name){
 if(!Number.isSafeInteger(value)||value<min||value>max)
  throw new Error('Invalid '+name);
 return value;
}
function fraction(value,name){
 if(!Number.isFinite(value)||value<0||value>1)
  throw new Error('Invalid '+name);
 return value;
}
function optionalInterval(value,name){
 if(value===null)return null;
 if(!Number.isFinite(value)||value<=0||value>SECONDS_PER_DAY)
  throw new Error('Invalid '+name);
 return value;
}
function rate(value,name){
 if(!Number.isFinite(value)||value<0||value>10000)
  throw new Error('Invalid '+name);
 return value;
}
function ratio(n,d){return Math.round(n/d*1000)/1000}
export function checkFree30DayScenario(input={}){
 const v={
  players:input.players??10_000,
  days:input.days??30,
  movingFraction:input.movingFraction??0,
  movementIntervalSeconds:input.movementIntervalSeconds??null,
  idleIntervalSeconds:input.idleIntervalSeconds??null,
  directionEventsPerMovingPlayerPerDay:
   input.directionEventsPerMovingPlayerPerDay??0,
  coinClaimsPerPlayerPerDay:input.coinClaimsPerPlayerPerDay??0,
  otherWsMessagesPerPlayerPerDay:input.otherWsMessagesPerPlayerPerDay??0,
  reconnectsPerPlayerPerDay:input.reconnectsPerPlayerPerDay??0,
  httpWorldReadsPerPlayerPerDay:input.httpWorldReadsPerPlayerPerDay??0,
  zoneDoCallsPerPlayerPerDay:input.zoneDoCallsPerPlayerPerDay??0,
  existingAccountWorkerRequestsPerDay:
   input.existingAccountWorkerRequestsPerDay??0,
  existingAccountDoRequestsPerDay:
   input.existingAccountDoRequestsPerDay??0,
 };
 integer(v.players,1,100_000,'concurrent player count');
 integer(v.days,1,31,'duration days');
 fraction(v.movingFraction,'moving fraction');
 optionalInterval(v.movementIntervalSeconds,'movement interval');
 optionalInterval(v.idleIntervalSeconds,'idle interval');
 for(const name of [
  'directionEventsPerMovingPlayerPerDay','coinClaimsPerPlayerPerDay',
  'otherWsMessagesPerPlayerPerDay','reconnectsPerPlayerPerDay',
  'httpWorldReadsPerPlayerPerDay','zoneDoCallsPerPlayerPerDay',
  'existingAccountWorkerRequestsPerDay','existingAccountDoRequestsPerDay'
 ])rate(v[name],name);
 if(v.movingFraction>0&&v.movementIntervalSeconds===null)
  throw new Error('Active players must have a positive send interval');
 const movingPlayers=Math.ceil(v.players*v.movingFraction);
 const idlePlayers=v.players-movingPlayers;
 const movementMessagesPerDay=v.movementIntervalSeconds===null?0:
  Math.ceil(movingPlayers*SECONDS_PER_DAY/v.movementIntervalSeconds);
 const idleMessagesPerDay=v.idleIntervalSeconds===null?0:
  Math.ceil(idlePlayers*SECONDS_PER_DAY/v.idleIntervalSeconds);
 const directionMessagesPerDay=Math.ceil(movingPlayers*
  v.directionEventsPerMovingPlayerPerDay);
 const coinMessagesPerDay=Math.ceil(v.players*v.coinClaimsPerPlayerPerDay);
 const otherMessagesPerDay=Math.ceil(v.players*
  v.otherWsMessagesPerPlayerPerDay);
 const wsIncomingPerDay=movementMessagesPerDay+idleMessagesPerDay+
  directionMessagesPerDay+coinMessagesPerDay+otherMessagesPerDay;
 // Optimistic account-wide lower bound; actual rounding, DO subrequests,
 // world broadcasts, authenticated reads and background work add usage.
 const billedWsDoRequests=Math.ceil(wsIncomingPerDay/
  WS_INCOMING_MESSAGES_PER_BILLED_REQUEST);
 const dailyReconnects=Math.ceil(v.players*v.reconnectsPerPlayerPerDay);
 const httpReads=Math.ceil(v.players*v.httpWorldReadsPerPlayerPerDay);
 const zoneSubrequests=Math.ceil(v.players*v.zoneDoCallsPerPlayerPerDay);
 const workerExtra=Math.ceil(v.existingAccountWorkerRequestsPerDay);
 const doExtra=Math.ceil(v.existingAccountDoRequestsPerDay);
 let maxDo=0,maxWorker=0,totalDo=0,totalWorker=0;
 const failures=[],daily=[];
 for(let day=1;day<=v.days;day++){
  // 10K users already connected on first day. A reconnection is a new Worker
  // upgrade request AND a new Durable Object connection request.
  const handshakes=(day===1?v.players:0)+dailyReconnects;
  const worker=handshakes+httpReads+workerExtra;
  const durable=handshakes+httpReads+zoneSubrequests+
   billedWsDoRequests+doExtra;
  const doPass=durable<=FREE_DURABLE_REQUESTS_PER_DAY;
  const workerPass=worker<=FREE_WORKER_REQUESTS_PER_DAY;
  daily.push({day,workerRequests:worker,durableObjectRequestsLowerBound:durable,
   connectionsOpened:handshakes,incomingSocketMessages:wsIncomingPerDay,
   workerPass,durablePass:doPass});
  maxDo=Math.max(maxDo,durable);maxWorker=Math.max(maxWorker,worker);
  totalDo+=durable;totalWorker+=worker;
  if(!workerPass||!doPass)failures.push(day);
 }
 const firstDay=daily[0],steadyDay=daily[Math.min(1,daily.length-1)];
 const sharedDoHeadroom=Math.max(0,FREE_DURABLE_REQUESTS_PER_DAY-
  v.players-dailyReconnects-httpReads-zoneSubrequests-doExtra);
 const maxOptimisticMessagesPerPlayerFirstDay=Math.floor(sharedDoHeadroom*
  WS_INCOMING_MESSAGES_PER_BILLED_REQUEST/v.players);
 const minimumAverageInputGapSecondsForAllPlayers=
  maxOptimisticMessagesPerPlayerFirstDay>0?
   Math.ceil(SECONDS_PER_DAY/maxOptimisticMessagesPerPlayerFirstDay):null;
 const result={
  schema:'v16-free-30-day-feasibility-v1',
  mode:'offline-cloudflare-free-lower-bound',
  days:v.days,simulatedConcurrentPlayers:v.players,
  movingPlayers,idlePlayers,assumptions:v,
  freeWorkerRequestsPerDay:FREE_WORKER_REQUESTS_PER_DAY,
  freeDurableRequestsPerDay:FREE_DURABLE_REQUESTS_PER_DAY,
  wsMessagesPerBilledRequest:WS_INCOMING_MESSAGES_PER_BILLED_REQUEST,
  wsIncomingPerDay,billedWsDoRequestsPerDay:billedWsDoRequests,
  firstDay,steadyDay,maxWorkerRequestsInOneDay:maxWorker,
  maxDoRequestsInOneDay:maxDo,monthWorkerRequests:totalWorker,
  monthDoRequestsLowerBound:totalDo,quotaFailDays:failures.length,
  earliestQuotaFailDay:failures[0]??null,
  requestQuotasPassAll30Days:failures.length===0,
  maxOptimisticMessagesPerPlayerFirstDay,
  minimumAverageInputGapSecondsForAllPlayers,
  thirtyDayZeroCostProven:false,realConcurrentPlayersTested:0,
  actualCloudflareRequests:0,gameplayValidatedOnline:false,
  caveat:'Passing request quotas is NECESSARY, not SUFFICIENT for zero-cost 10K multiplayer. Active DO duration, CPU, data, coin state, broadcasts, Firebase, reconnect spikes, other account Workers and network failures remain unmeasured.'
 };
 return result;
}
