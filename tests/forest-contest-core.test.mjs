import test from "node:test";
import assert from "node:assert/strict";
import {ForestContestCore,BOOSTERS} from "../src/online/forest-contest-core.mjs";
const now=Date.parse("2026-10-30T10:00:00Z");
test("two isolated server worlds, no client-made coordinates and VIP gate",()=>{
 const free=new ForestContestCore({scope:"free1",now,secureDraw:()=>0});
 const vip=new ForestContestCore({scope:"vip1",now,secureDraw:()=>0});
 free.join("alice",now,{displayName:"Alice"});
 assert.throws(()=>vip.join("alice",now),/VIP/);
 vip.join("alice",now,{vipExpiresAt:now+86_400_000,displayName:"Alice"});
 assert.equal(free.map.coins.length,200);assert.equal(vip.map.coins.length,200);
 assert.throws(()=>free.move("alice",100,0,now+200),/Invalid/);
 const p=free.move("alice",1,0,now+200);
 assert.ok(p.x-free.map.spawn.x<=0.781);
 assert.equal(free.publicSnapshot(now,"alice").leaders.length,1);
});
test("exactly one player wins simultaneous coin and chest claims in same authoritative room",()=>{
 const core=new ForestContestCore({now,secureDraw:()=>999});
 core.join("alice",now,{displayName:"Alice"});
 core.join("bob",now,{displayName:"Bob"});
 const coin=core.map.coins[0];
 for(const who of ["alice","bob"]){core.players.get(who).x=coin.x;core.players.get(who).y=coin.y;}
 const a=core.collect("alice",now),b=core.collect("bob",now);
 assert.equal(a.type,"coin");assert.equal(a.amount,1);assert.equal(b,null);
 const chest=core.map.chest;
 for(const who of ["alice","bob"]){core.players.get(who).x=chest.x;core.players.get(who).y=chest.y;}
 const c=core.collect("bob",now),d=core.collect("alice",now);
 assert.equal(c.type,"chest");assert.equal(c.amount,10_000);assert.equal(d,null);
 assert.equal(core.scores.get("bob"),10_000);
 assert.equal(core.scores.get("alice"),1);
 assert.equal(core.publicSnapshot(now,"alice").chest.available,false);
 assert.equal(core.publicSnapshot(now+4*60*60_000,"alice").chest.available,true);
});
test("verified paid entitlement 20/10 baht 24 hours, expires, anti-replay, cannot stack x4",()=>{
 const core=new ForestContestCore({now,secureDraw:()=>0});
 core.join("alice",now);
 assert.equal(BOOSTERS.doubleCoins.priceTHB,20);
 assert.equal(BOOSTERS.doubleSpeed.priceTHB,10);
 assert.throws(()=>core.activateVerifiedPurchase("alice",{product:"doubleCoins",amountTHB:1,transactionId:"receipt00001",verifiedAt:now}),/amount/);
 assert.equal(core.activateVerifiedPurchase("alice",{product:"doubleCoins",amountTHB:20,transactionId:"receipt00001",verifiedAt:now}).expiresAt,now+86_400_000);
 assert.throws(()=>core.activateVerifiedPurchase("alice",{product:"doubleCoins",amountTHB:20,transactionId:"receipt00001",verifiedAt:now}),/Duplicate/);
 assert.equal(core.activateVerifiedPurchase("alice",{product:"doubleCoins",amountTHB:20,transactionId:"receipt00002",verifiedAt:now}).expiresAt,now+2*86_400_000);
 assert.equal(core.activateVerifiedPurchase("alice",{product:"doubleSpeed",amountTHB:10,transactionId:"receipt00003",verifiedAt:now}).expiresAt,now+86_400_000);
 const coin=core.map.coins[0];
 core.players.get("alice").x=coin.x;core.players.get("alice").y=coin.y;
 const a=core.collect("alice",now);
 assert.equal(a.amount,2);
 assert.equal(core.personalSnapshot("alice",now).boosters.doubleCoins,2*86_400_000);
 assert.equal(core.personalSnapshot("alice",now+2*86_400_000).boosters.doubleCoins,0);
});
test("Free weekly and VIP daily snapshots retain past winner but reset score",()=>{
 const before=Date.parse("2026-10-31T16:59:59Z"),after=before+1000;
 const free=new ForestContestCore({scope:"free1",now:before});
 const vip=new ForestContestCore({scope:"vip1",now:before});
 free.join("a",before,{displayName:"Winner"});
 vip.join("a",before,{vipExpiresAt:after+86_400_000,displayName:"VIP Winner"});
 free.scores.set("a",123);vip.scores.set("a",456);
 free.rotatePeriod(after);vip.rotatePeriod(after);
 assert.equal(free.scores.get("a")||0,123); // Saturday 23:59:59 TH -> Sunday 00:00:00? Actually Sunday reset, see test fixture
 assert.equal(vip.scores.get("a")||0,0);
 assert.equal(vip.winners[0].winner.score,456);
 const sun=Date.parse("2026-10-31T17:00:00Z");
 free.rotatePeriod(sun);
 assert.equal(free.scores.get("a")||0,0);
 assert.equal(free.winners.at(-1).winner.score,123);
});
