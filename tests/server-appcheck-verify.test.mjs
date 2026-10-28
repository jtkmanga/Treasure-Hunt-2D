import test from "node:test";
import assert from "node:assert/strict";
import {checkStagingAppCheck} from "../src/online/appcheck-staging.mjs";
const origin="https://treasure-hunt-2d-jtk.pages.dev";
const bearer="a".repeat(150)+"."+"b".repeat(150)+"."+"c".repeat(150);
const base="https://api.test.workers.dev";
const env={ALLOWED_ORIGIN:origin,FIREBASE_PROJECT_ID:"treasure-hunt-2d",
 FIREBASE_PROJECT_NUMBER:"439998873632",FIREBASE_APP_ID:"1:439998873632:web:4b694f8159d9d9e0163c45",
 LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}};
function request(path="/api/v1/appcheck-verify",method="GET",headers={}){
 return new Request(base+path,{method,headers:{origin,"cf-connecting-ip":"192.0.2.3",
  authorization:"Bearer "+bearer,"x-firebase-appcheck":bearer,...headers}});
}
const pass={verifyToken:async()=>({uid:"u-123"}),
 verifyAppCheck:async()=>({appId:env.FIREBASE_APP_ID})};
test("only both signed Firebase JWTs provide read-only attestation",async()=>{
 const result=await checkStagingAppCheck(request(),env,pass);
 assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{ok:true,signedIn:true,uid:"u-123",
  scoreWrites:false,appCheckVerified:true,accountStatusVerified:false});
 assert.equal(result.headers.get("access-control-allow-origin"),origin);
 assert.equal((await checkStagingAppCheck(request(),env,{
  ...pass,verifyAppCheck:async()=>{throw Error("forged")}})).status,401);
});
test("score, payment, VIP and admin remain closed",async()=>{
 for(const p of ["/api/v1/runs/start","/api/v1/runs/finish","/api/v1/score",
  "/api/v1/shop","/api/v1/payment","/api/v1/leaderboard","/admin"]){
  assert.equal((await checkStagingAppCheck(request(p),env)).status,404);
 }
 assert.equal((await checkStagingAppCheck(request("/api/v1/appcheck-verify","POST"),env)).status,405);
});
test("fail closed for invalid origin, missing limiter, project or token",async()=>{
 assert.equal((await checkStagingAppCheck(request("/api/v1/appcheck-verify","GET",
  {origin:"https://other.example"}),env)).status,403);
 assert.equal((await checkStagingAppCheck(request(),{...env,LOGIN_RATE_LIMITER:null})).status,503);
 assert.equal((await checkStagingAppCheck(request(),{...env,FIREBASE_APP_ID:"wrong"})).status,503);
 assert.equal((await checkStagingAppCheck(request("/api/v1/appcheck-verify","GET",
  {authorization:"Bearer short"}),env)).status,401);
 assert.equal((await checkStagingAppCheck(request("/api/v1/appcheck-verify","GET",
  {"x-firebase-appcheck":""}),env,{
    verifyToken:pass.verifyToken,verifyAppCheck:async(t)=>{if(!t)throw Error("missing");return {appId:env.FIREBASE_APP_ID};}
  })).status,401);
});
test("App Check CORS preflight permits only GET",async()=>{
 const r=await checkStagingAppCheck(request("/api/v1/appcheck-verify","OPTIONS",{
  "access-control-request-method":"GET",
  "access-control-request-headers":"authorization,x-firebase-appcheck"}),env);
 assert.equal(r.status,204);
 assert.match(r.headers.get("access-control-allow-headers"),/x-firebase-appcheck/);
});
