import test from "node:test";
import assert from "node:assert/strict";
import {checkStagingAccountStatus} from "../src/online/account-status-staging.mjs";
const origin="https://treasure-hunt-2d-jtk.pages.dev";
const base="https://example.workers.dev";
const jwt="a".repeat(140)+"."+"b".repeat(140)+"."+"c".repeat(140);
const env={ALLOWED_ORIGIN:origin,FIREBASE_PROJECT_ID:"treasure-hunt-2d",
  FIREBASE_PROJECT_NUMBER:"439998873632",
  FIREBASE_APP_ID:"1:439998873632:web:4b694f8159d9d9e0163c45",
  FIREBASE_WEB_API_KEY:"AIza"+"z".repeat(35),
  LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}};
function makeReq(path="/api/v1/account-status",method="GET",headers={}){
 return new Request(base+path,{method,headers:{
   origin,"cf-connecting-ip":"192.0.2.4",
   authorization:"Bearer "+jwt,"x-firebase-appcheck":jwt,...headers
 }});
}
const identity={uid:"firebase-user",authTime:1750000000};
const validators={
 verifyToken:async(t,project)=>{
  assert.equal(t,jwt);assert.equal(project,"treasure-hunt-2d");return identity;
 },
 verifyAppCheck:async()=>({appId:env.FIREBASE_APP_ID}),
 verifyAccount:async(t,id,cfg)=>{
  assert.equal(t,jwt);assert.equal(id.uid,identity.uid);
  assert.equal(cfg.apiKey,env.FIREBASE_WEB_API_KEY);
  return {active:true,uid:identity.uid};
 }
};
test("both signed token checks and current active account needed before success",async()=>{
 const r=await checkStagingAccountStatus(makeReq(),env,validators);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,signedIn:true,uid:identity.uid,
  appCheckVerified:true,accountStatusVerified:true,scoreWrites:false});
 assert.equal(r.headers.get("cache-control"),"no-store");
 assert.equal(r.headers.get("access-control-allow-origin"),origin);
});
test("without API key rejects early without fetching App Check or Google keys",async()=>{
 let called=0;
 const r=await checkStagingAccountStatus(makeReq(),
  {...env,FIREBASE_WEB_API_KEY:undefined},
  {verifyToken:async()=>{called++;return identity;},
   verifyAppCheck:async()=>{called++;return {appId:env.FIREBASE_APP_ID};}});
 assert.equal(r.status,503);
 assert.equal((await r.json()).code,"ACCOUNT_LOOKUP_NOT_CONFIGURED");
 assert.equal(called,0);
});
test("revoked, disabled, wrong UID and network failures are denied",async()=>{
 for(const account of [async()=>{throw Error("Firebase session revoked");},
  async()=>{throw Error("Account disabled or status invalid");},
  async()=>({active:false,uid:identity.uid}),
  async()=>({active:true,uid:"different"})]){
  const r=await checkStagingAccountStatus(makeReq(),env,{...validators,verifyAccount:account});
  assert.equal(r.status,401);
  assert.equal((await r.json()).code,"ACCOUNT_NOT_ACTIVE_OR_REVOKED");
 }
 const network=await checkStagingAccountStatus(makeReq(),env,{
  ...validators,verifyAccount:async()=>{throw Error("Firebase account status unavailable");}});
 assert.equal(network.status,503);
 assert.equal((await network.json()).code,"ACCOUNT_LOOKUP_UNAVAILABLE");
});
test("invalid Google ID, App Check and origins cannot access active-account endpoint",async()=>{
 const failedToken=await checkStagingAccountStatus(makeReq(),env,{
  ...validators,verifyToken:async()=>{throw Error("invalid signature");}});
 assert.equal(failedToken.status,401);
 const wrongApp=await checkStagingAccountStatus(makeReq(),env,{
  ...validators,verifyAppCheck:async()=>{throw Error("Invalid App Check token");}});
 assert.equal(wrongApp.status,401);
 const malicious=await checkStagingAccountStatus(makeReq("/api/v1/account-status","GET",
  {origin:"https://evil.invalid"}),env,validators);
 assert.equal(malicious.status,403);
});
test("score, paid, admin and legacy App Check routes remain isolated and read-only",async()=>{
 for(const path of ["/api/v1/score","/api/v1/runs/start","/api/v1/payment","/admin"]){
  assert.equal((await checkStagingAccountStatus(makeReq(path),env,validators)).status,404);
 }
 const original=await checkStagingAccountStatus(makeReq("/api/v1/appcheck-verify"),env,validators);
 assert.equal(original.status,200);
 assert.equal((await original.json()).accountStatusVerified,false);
 assert.equal((await checkStagingAccountStatus(makeReq("/api/v1/account-status","POST"),env,validators)).status,405);
});
test("CORS preflight remains restricted to Google ID + App Check and GET",async()=>{
 const r=await checkStagingAccountStatus(makeReq("/api/v1/account-status","OPTIONS",{
   "access-control-request-method":"GET",
   "access-control-request-headers":"authorization,x-firebase-appcheck"
 }),env,validators);
 assert.equal(r.status,204);
 const d=await checkStagingAccountStatus(makeReq("/api/v1/account-status","OPTIONS",{
   "access-control-request-method":"POST",
   "access-control-request-headers":"authorization,x-firebase-appcheck"
 }),env,validators);
 assert.equal(d.status,405);
});

test("Identity Toolkit network failure, redirect and bad JSON fail closed as unavailable",async()=>{
 const {verifyFirebaseAccountIsActive}=await import("../src/online/firebase-hardening.mjs");
 const account={uid:"firebase-user",authTime:1750000000};
 const cfg={apiKey:"AIza"+"z".repeat(35),projectId:"treasure-hunt-2d"};
 for(const fake of [
  async()=>{throw Error("Edge connection failed")},
  async()=>({ok:true,status:302,json:async()=>({users:[]})}),
  async()=>({ok:true,status:200,json:async()=>{throw Error("JSON parser failed")}})
 ]) {
  await assert.rejects(
   verifyFirebaseAccountIsActive(jwt,account,cfg,{fetchImpl:fake}),
   /Firebase account status unavailable/);
 }
});
