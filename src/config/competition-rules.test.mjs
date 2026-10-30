import assert from "node:assert/strict";
import test from "node:test";
import {GAME_CONFIG,chooseLuckyReward,boosterExpiresAt} from "./competition-rules.mjs";
test("two servers, one 100x100 forest and unlimited session",()=>{
 assert.deepEqual(GAME_CONFIG.servers,["free","vip"]);
 assert.equal(GAME_CONFIG.map.width,100);
 assert.equal(GAME_CONFIG.map.height,100);
 assert.equal(GAME_CONFIG.map.type,"forest");
 assert.equal(GAME_CONFIG.unlimitedPlay,true);
});
test("all 1000 reward slots match approved exact probabilities",()=>{
 const counts=new Map();
 for(let i=0;i<1000;i++){const prize=chooseLuckyReward(i);counts.set(prize,(counts.get(prize)||0)+1);}
 assert.deepEqual([...counts],[[100,500],[500,300],[1000,190],[5000,9],[10000,1]]);
 assert.throws(()=>chooseLuckyReward(1000),RangeError);
});
test("boosts priced in THB and valid for exactly 24 hours",()=>{
 assert.equal(GAME_CONFIG.boosters.doubleCoins.priceTHB,20);
 assert.equal(GAME_CONFIG.boosters.doubleSpeed.priceTHB,10);
 assert.equal(boosterExpiresAt(1000),86_401_000);
 assert.equal(boosterExpiresAt(1000,86_401_000),172_801_000);
});
