import test from "node:test";
import assert from "node:assert/strict";
import {checkStagingLogin} from "../src/online/staging-verification.mjs";
const origin="https://treasure-hunt-2d-jtk.pages.dev",url="https://api.example.workers.dev";
const token="a".repeat(150)+"."+"b".repeat(150)+"."+"c".repeat(150);
const env={ALLOWED_ORIGIN:origin,FIREBASE_PROJECT_ID:"treasure-hunt-2d",LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}};
function req(path="/api/v1/me",method="GET",headers={}){
 return new Request(url+path,{method,headers:{origin,"cf-connecting-ip":"192.0.2.10",
 authorization:"Bearer "+token,...headers}});
}
test("only /api/v1/me may be called",async()=>{
 for(const path of ["/api/v1/score","/api/v1/runs/start","/api/v1/runs/finish",
   "/api/v1/leaderboard","/api/v1/health","/api/v1/admin"]){
   assert.equal((await checkStagingLogin(req(path,"GET"),env)).status,404);
   assert.equal((await checkStagingLogin(req(path,"POST"),env)).status,404);
 }
});
test("requires exact 2D origin and permits GET preflight",async()=>{
 for(const o of ["https://attacker.example","https://gpt-voxel.example","",
   "https://treasure-hunt-2d-jtk.pages.dev.attacker.example"]){
   assert.equal((await checkStagingLogin(req("/api/v1/me","GET",{origin:o}),env)).status,403);
 }
 const good=await checkStagingLogin(req("/api/v1/me","OPTIONS",{
  "access-control-request-method":"GET","access-control-request-headers":"authorization"}),env);
 assert.equal(good.status,204);assert.equal(good.headers.get("access-control-allow-origin"),origin);
 const bad=await checkStagingLogin(req("/api/v1/me","OPTIONS",{
  "access-control-request-method":"POST","access-control-request-headers":"authorization"}),env);
 assert.equal(bad.status,405);
});
test("missing token, Cloudflare IP or limiter are rejected before upstream verification",async()=>{
 assert.equal((await checkStagingLogin(req("/api/v1/me","GET",{authorization:"Bearer fake"}),env)).status,401);
 assert.equal((await checkStagingLogin(req("/api/v1/me","GET",{"cf-connecting-ip":""}),env)).status,503);
 assert.equal((await checkStagingLogin(req(),{...env,LOGIN_RATE_LIMITER:undefined})).status,503);
 assert.equal((await checkStagingLogin(req(),{...env,LOGIN_RATE_LIMITER:{limit:async()=>({success:false})}})).status,429);
 assert.equal((await checkStagingLogin(req(),{...env,LOGIN_RATE_LIMITER:{limit:async()=>{throw Error("unavailable")}}})).status,503);
});
test("allowlisted rate-limited signed identity gets read-only response",async()=>{
 let calls=0;
 const r=await checkStagingLogin(req(),{...env,LOGIN_RATE_LIMITER:{limit:async({key})=>{
   calls++;assert.equal(key,"login-verify:192.0.2.10");return{success:true};}}},
   {verifyToken:async()=>({uid:"sample-verified-uid"})});
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,signedIn:true,uid:"sample-verified-uid",scoreWrites:false});
 assert.equal(r.headers.get("cache-control"),"no-store");
 assert.equal(calls,1);
});
