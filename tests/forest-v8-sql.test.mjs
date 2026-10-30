import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
const sql=path=>readFileSync(new URL(path,import.meta.url),"utf8");
function db(){
 const d=new DatabaseSync(":memory:");
 d.exec(sql("../db/schema.sql"));d.exec(sql("../db/forest-v8.sql"));
 return d;
}
test("one verified forest event credits once, duplicate and forged values blocked",()=>{
 const d=db(),t=1_000_000;
 const write=d.prepare("INSERT INTO forest_score_events(event_id,scope,period_id,uid,player_label,claim_id,kind,score_delta,collected_at) VALUES(?,?,?,?,?,?,?,?,?)");
 write.run("eventaaaaaaaaaaaaaa","free1","2026-10-25","alice","Alice","coinClaim0001","map_coin",1,t);
 let score=d.prepare("SELECT score FROM leaderboard_entries WHERE uid='alice'").get().score;
 assert.equal(score,1);
 assert.throws(()=>write.run("eventaaaaaaaaaaaaaa","free1","2026-10-25","alice","Alice","coinClaim0001","map_coin",1,t));
 assert.throws(()=>write.run("eventbbbbbbbbbbbbbb","free1","2026-10-25","alice","Alice","coinClaim0001","map_coin",1,t));
 assert.throws(()=>write.run("eventcccccccccccccc","free1","2026-10-25","alice","Alice","coinClaim0002","map_coin",10000,t));
 write.run("eventdddddddddddddd","free1","2026-10-25","alice","Alice","chestClaim01","lucky_box",10000,t);
 score=d.prepare("SELECT score FROM leaderboard_entries WHERE uid='alice'").get().score;
 assert.equal(score,10001);
 d.close();
});
test("verified payments activate 24h, extend once only, no wrong amount or reused slip",()=>{
 const d=db(),t=1_000_000;
 const pay=d.prepare("INSERT INTO forest_verified_payments(transaction_id,order_id,uid,product,amount_thb,verified_at,provider) VALUES(?,?,?,?,?,?,?)");
 pay.run("bankTx00001","order00001","alice","doubleCoins",20,t,"Slip2Go");
 assert.equal(d.prepare("SELECT expires_at FROM forest_boost_entitlements WHERE uid='alice' AND product='doubleCoins'").get().expires_at,t+86_400_000);
 assert.throws(()=>pay.run("bankTx00001","order00002","alice","doubleCoins",20,t,"Slip2Go"));
 assert.throws(()=>pay.run("bankTx00002","order00001","alice","doubleCoins",20,t,"Slip2Go"));
 assert.throws(()=>pay.run("bankTx00003","order00003","alice","doubleCoins",10,t,"Slip2Go"));
 pay.run("bankTx00004","order00004","alice","doubleCoins",20,t+1000,"Slip2Go");
 assert.equal(d.prepare("SELECT expires_at FROM forest_boost_entitlements WHERE uid='alice' AND product='doubleCoins'").get().expires_at,t+172_800_000);
 pay.run("bankTx00005","order00005","alice","doubleSpeed",10,t,"Slip2Go");
 assert.equal(d.prepare("SELECT expires_at FROM forest_boost_entitlements WHERE uid='alice' AND product='doubleSpeed'").get().expires_at,t+86_400_000);
 d.close();
});
test("winner history is immutable per scope and period",()=>{
 const d=db();
 const stmt=d.prepare("INSERT INTO forest_round_winners(scope,period_id,uid,player_label,score,captured_at) VALUES(?,?,?,?,?,?)");
 stmt.run("free1","2026-10-25","alice","Alice",765,1000000);
 stmt.run("vip1","2026-10-25","bob","Bob",432,1000000);
 assert.throws(()=>stmt.run("free1","2026-10-25","other","Other",9999,1000001));
 assert.equal(d.prepare("SELECT COUNT(*) AS n FROM forest_round_winners").get().n,2);
 d.close();
});
