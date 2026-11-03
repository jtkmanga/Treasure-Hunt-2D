import test from 'node:test';
import assert from 'node:assert/strict';
import {checkFree30DayScenario,FREE_WORKER_REQUESTS_PER_DAY,
 FREE_DURABLE_REQUESTS_PER_DAY,WS_INCOMING_MESSAGES_PER_BILLED_REQUEST}
 from '../src/v16-online/free-tier-30day-feasibility.mjs';

const common={players:10_000,days:30};
test('official 2026 Free request quotas are hard-capped and no test claims a zero-dollar invoice',()=>{
 assert.equal(FREE_WORKER_REQUESTS_PER_DAY,100_000);
 assert.equal(FREE_DURABLE_REQUESTS_PER_DAY,100_000);
 assert.equal(WS_INCOMING_MESSAGES_PER_BILLED_REQUEST,20);
 const r=checkFree30DayScenario(common);
 assert.equal(r.requestQuotasPassAll30Days,true);
 assert.equal(r.thirtyDayZeroCostProven,false);
 assert.equal(r.realConcurrentPlayersTested,0);
 assert.equal(r.actualCloudflareRequests,0);
 assert.equal(r.gameplayValidatedOnline,false);
 assert.equal(r.firstDay.connectionsOpened,10_000);
 assert.equal(r.firstDay.workerRequests,10_000);
 assert.equal(r.firstDay.durableObjectRequestsLowerBound,10_000);
 assert.equal(r.steadyDay.workerRequests,0);
 assert.equal(r.maxOptimisticMessagesPerPlayerFirstDay,180);
 assert.equal(r.minimumAverageInputGapSecondsForAllPlayers,480);
});
test('10K active players with one incoming direction packet per minute exhaust free DO daily quota',()=>{
 const r=checkFree30DayScenario({...common,
  movingFraction:1,movementIntervalSeconds:60});
 assert.equal(r.wsIncomingPerDay,14_400_000);
 assert.equal(r.billedWsDoRequestsPerDay,720_000);
 assert.equal(r.firstDay.durableObjectRequestsLowerBound,730_000);
 assert.equal(r.earliestQuotaFailDay,1);
 assert.equal(r.quotaFailDays,30);
 assert.equal(r.requestQuotasPassAll30Days,false);
 assert.ok(r.maxDoRequestsInOneDay/FREE_DURABLE_REQUESTS_PER_DAY>7);
});
test('5 percent moving every 3 seconds equals 720K DO requests daily before joins',()=>{
 const r=checkFree30DayScenario({...common,
  movingFraction:.05,movementIntervalSeconds:3});
 assert.equal(r.movingPlayers,500);
 assert.equal(r.wsIncomingPerDay,14_400_000);
 assert.equal(r.billedWsDoRequestsPerDay,720_000);
 assert.equal(r.firstDay.durableObjectRequestsLowerBound,730_000);
 assert.equal(r.earliestQuotaFailDay,1);
});
test('even 1 percent moving continuously every 3 seconds breaks 100K/day DO allowance',()=>{
 const r=checkFree30DayScenario({...common,
  movingFraction:.01,movementIntervalSeconds:3});
 assert.equal(r.movingPlayers,100);
 assert.equal(r.billedWsDoRequestsPerDay,144_000);
 assert.equal(r.firstDay.durableObjectRequestsLowerBound,154_000);
 assert.equal(r.quotaFailDays,30);
});
test('0.5 percent moving or one packet each 10 minutes only pass minimum request accounting',()=>{
 const limited=checkFree30DayScenario({...common,
  movingFraction:.005,movementIntervalSeconds:3});
 assert.equal(limited.movingPlayers,50);
 assert.equal(limited.billedWsDoRequestsPerDay,72_000);
 assert.equal(limited.firstDay.durableObjectRequestsLowerBound,82_000);
 assert.equal(limited.requestQuotasPassAll30Days,true);
 assert.equal(limited.thirtyDayZeroCostProven,false);
 const choppy=checkFree30DayScenario({...common,
  movingFraction:1,movementIntervalSeconds:600});
 assert.equal(choppy.firstDay.durableObjectRequestsLowerBound,82_000);
 assert.equal(choppy.requestQuotasPassAll30Days,true);
 assert.equal(choppy.thirtyDayZeroCostProven,false);
});
test('one daily reconnect and world read per player consumes account-wide Worker and DO quotas',()=>{
 const r=checkFree30DayScenario({...common,
  reconnectsPerPlayerPerDay:1,httpWorldReadsPerPlayerPerDay:1});
 assert.equal(r.firstDay.workerRequests,30_000);
 assert.equal(r.firstDay.durableObjectRequestsLowerBound,30_000);
 assert.equal(r.steadyDay.workerRequests,20_000);
 assert.equal(r.steadyDay.durableObjectRequestsLowerBound,20_000);
 assert.equal(r.requestQuotasPassAll30Days,true);
 const heavy=checkFree30DayScenario({...common,reconnectsPerPlayerPerDay:12});
 assert.ok(heavy.maxWorkerRequestsInOneDay>FREE_WORKER_REQUESTS_PER_DAY);
 assert.equal(heavy.earliestQuotaFailDay,1);
});
test('HTTP polling all 10K users every minute hits Worker AND DO caps',()=>{
 const r=checkFree30DayScenario({...common,
  httpWorldReadsPerPlayerPerDay:1440});
 assert.equal(r.firstDay.workerRequests,14_410_000);
 assert.equal(r.firstDay.durableObjectRequestsLowerBound,14_410_000);
 assert.equal(r.earliestQuotaFailDay,1);
});
test('coin claims, client event changes and zone DO fanout consume additional shared headroom',()=>{
 const r=checkFree30DayScenario({...common,
  movingFraction:.005,movementIntervalSeconds:3,
  directionEventsPerMovingPlayerPerDay:200,
  coinClaimsPerPlayerPerDay:10,
  zoneDoCallsPerPlayerPerDay:2,
  existingAccountWorkerRequestsPerDay:1000,
  existingAccountDoRequestsPerDay:1000});
 assert.equal(r.quotaFailDays,30);
 assert.ok(r.firstDay.durableObjectRequestsLowerBound>FREE_DURABLE_REQUESTS_PER_DAY);
 assert.ok(r.billedWsDoRequestsPerDay>72_000);
 assert.equal(r.thirtyDayZeroCostProven,false);
});
test('free limit resets each day and cannot be borrowed from another day',()=>{
 const r=checkFree30DayScenario({...common,
  movingFraction:.01,movementIntervalSeconds:3});
 assert.equal(r.monthDoRequestsLowerBound,r.firstDay.durableObjectRequestsLowerBound+
  r.steadyDay.durableObjectRequestsLowerBound*29);
 assert.equal(r.quotaFailDays,30);
 assert.equal(r.days,30);
});
test('future scenarios cannot bypass input validation with malformed actors or percentages',()=>{
 for(const bad of [
  {players:0},{players:100001},{days:0},{days:32},
  {movingFraction:1.1},{movingFraction:-.1},
  {movingFraction:.1,movementIntervalSeconds:null},
  {idleIntervalSeconds:0},{movementIntervalSeconds:-1},
  {reconnectsPerPlayerPerDay:-1},
  {httpWorldReadsPerPlayerPerDay:NaN}
 ])assert.throws(()=>checkFree30DayScenario({...common,...bad}),/Invalid|Active/);
});
