import test from "node:test";
import assert from "node:assert/strict";
import {periodFor} from "../src/online/periods.mjs";
import {handleRequest} from "../src/online/handler.mjs";
import {verifyFirebaseIdToken} from "../src/online/firebase-auth.mjs";
const now=()=>Date.parse("2026-10-28T12:00:00.000Z");
const req=(p,init)=>new Request("https://api.example.test"+p,init);
test("Free weekly and VIP daily midnight Thailand reset",()=>{
 const free=periodFor("free1",now()),vip=periodFor("vip1",now());
 assert.equal(free.periodId,"2026-10-25");
 assert.equal(free.resetsAt,"2026-10-31T17:00:00.000Z");
 assert.equal(vip.periodId,"2026-10-28");
 assert.equal(vip.resetsAt,"2026-10-28T17:00:00.000Z");
 assert.equal(periodFor("vip1",Date.parse("2026-10-28T17:00:00Z")).periodId,"2026-10-29");
 assert.equal(periodFor("free1",Date.parse("2026-10-31T17:00:00Z")).periodId,"2026-11-01");
 assert.throws(()=>periodFor("oops",now()));
});
test("score and run writes always forbidden",async()=>{
 for(const path of ["/api/v1/score","/api/v1/runs/start","/api/v1/runs/finish"]){
  const r=await handleRequest(req(path,{method:"POST",headers:{"content-type":"application/json"},body:'{"score":999999}'}));
  assert.equal(r.status,403); assert.equal((await r.json()).ok,false);
 }
});
test("rules and health are read-only",async()=>{
 const health=await handleRequest(req("/api/v1/health"));
 assert.equal(health.status,200);assert.equal((await health.json()).scoreWrites,false);
 const rules=await handleRequest(req("/api/v1/rules"),{},{now});
 assert.equal((await rules.json()).vip.periodId,"2026-10-28");
});
test("parameterized top 20 lookup, scope and period isolation",async()=>{
 let parameters,statement;
 const DB={prepare(sql){statement=sql;return{bind(...args){parameters=args;return{all:async()=>({results:[
   {player_label:"Tester",score:100},{player_label:"Guest",score:50}]})};}};}};
 const r=await handleRequest(req("/api/v1/leaderboard?scope=vip1"),{DB},{now});
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(body.leaders.length,2);assert.equal(body.leaders[0].score,100);
 assert.deepEqual(parameters,["vip1","2026-10-28"]);assert.match(statement,/LIMIT 20/);
 assert.equal((await handleRequest(req("/api/v1/leaderboard?scope=vip1%27"),{DB},{now})).status,400);
 assert.equal((await handleRequest(req("/api/v1/leaderboard"),{},{now})).status,503);
});
test("no anonymous identity or cross-origin authenticated reads",async()=>{
 const env={FIREBASE_PROJECT_ID:"treasure-hunt-test",ALLOWED_ORIGIN:"https://treasure-hunt-2d-jtk.pages.dev"};
 assert.equal((await handleRequest(req("/api/v1/me"),env)).status,401);
 assert.equal((await handleRequest(req("/api/v1/me",{headers:{origin:"https://attacker.invalid"}}),env)).status,403);
 const request=req("/api/v1/me",{headers:{authorization:"Bearer "+"X".repeat(128),origin:env.ALLOWED_ORIGIN}});
 const good=await handleRequest(request,env,{verifyToken:async()=>({uid:"verified-user"})});
 assert.equal(good.status,200); assert.equal((await good.json()).uid,"verified-user");
 const fail=await handleRequest(request,env,{verifyToken:async()=>{throw Error("bad")}});
 assert.equal(fail.status,401);
 assert.equal((await handleRequest(req("/api/v1/me"),{FIREBASE_PROJECT_ID:"REPLACE_ME"})).status,503);
});
test("signature verifier rejects malformed JWT without external fetch",async()=>{
 await assert.rejects(verifyFirebaseIdToken("not.jwt","treasure-hunt-test"),/Invalid token/);
 await assert.rejects(verifyFirebaseIdToken("a.b.c","treasure-hunt-test"),/Invalid/);
});
