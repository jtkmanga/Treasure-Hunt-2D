import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {verifyFirebaseAppCheckToken,verifyFirebaseAccountIsActive}
  from "../src/online/firebase-hardening.mjs";
import {checkHardenedStagingLogin} from "../src/online/hardened-staging.mjs";

const PROJECT_NUMBER="439998873632", PROJECT_ID="treasure-hunt-2d";
const APP_ID="1:439998873632:web:4b694f8159d9d9e0163c45";
const APP_CFG={projectNumber:PROJECT_NUMBER,appId:APP_ID};
const now=1761660000;
const keyPair=generateKeyPairSync("rsa",{modulusLength:2048});
const jwk={...keyPair.publicKey.export({format:"jwk"}),kid:"test-signing-key",alg:"RS256",use:"sig"};
const enc=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims={},header={}){
  const h=enc({alg:"RS256",typ:"JWT",kid:"test-signing-key",...header});
  const c=enc({iss:"https://firebaseappcheck.googleapis.com/"+PROJECT_NUMBER,
    aud:["projects/"+PROJECT_NUMBER],sub:APP_ID,iat:now-180,exp:now+180,...claims});
  const data=h+"."+c;
  const sig=sign("RSA-SHA256",Buffer.from(data),keyPair.privateKey).toString("base64url");
  return data+"."+sig;
}
const jwkFetch=async(url,opts)=>{
  assert.equal(url,"https://firebaseappcheck.googleapis.com/v1/jwks");
  assert.equal(opts.redirect,"manual");
  return {ok:true,json:async()=>({keys:[jwk]})};
};
test("verify a real RSA signature for the exact Firebase App Check app",async()=>{
  const result=await verifyFirebaseAppCheckToken(token(),APP_CFG,{
    fetchImpl:jwkFetch,nowSeconds:()=>now});
  assert.deepEqual(result,{appId:APP_ID});
});
test("forgery, wrong issuer/audience/app, expiry and wrong JWT type are rejected",async()=>{
  const opts={fetchImpl:jwkFetch,nowSeconds:()=>now};
  const good=token();
  // Signing-key changes, payload changes and invalid claims all fail.
  const altered=good.split(".");
  altered[1]=enc({...JSON.parse(Buffer.from(altered[1],"base64url").toString()),sub:"1:439998873632:web:forged"});
  const invalid=[
    altered.join("."),
    token({aud:["projects/123456789"]}),
    token({iss:"https://firebaseappcheck.googleapis.com/000000000"}),
    token({sub:"1:439998873632:web:other"}),
    token({exp:now-1}),
    token({iat:now+5}),
    token({}, {typ:"OTHER"}),
    token({}, {alg:"HS256"}),
    token({}, {kid:"missing"}),
    "not-a-jwt"
  ];
  for(const t of invalid)await assert.rejects(
    verifyFirebaseAppCheckToken(t,APP_CFG,opts),/Invalid|Unknown|Missing/);
  await assert.rejects(verifyFirebaseAppCheckToken(token(),{projectNumber:"000000",appId:APP_ID},opts));
});
test("App Check key retrieval failures fail closed",async()=>{
  await assert.rejects(verifyFirebaseAppCheckToken(token(),APP_CFG,{
    fetchImpl:async()=>({ok:false,status:503}),nowSeconds:()=>now}),/unavailable/);
});
const API_KEY="AIza"+"x".repeat(35);
const accountCfg={apiKey:API_KEY,projectId:PROJECT_ID};
const idToken="x".repeat(180);
const identity={uid:"firebase-user-01",authTime:now-150};
function accountFetch(user,{status=200,fail=false}={}){
  return async(url,opts)=>{
    assert.ok(url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="));
    assert.equal(opts.method,"POST");
    assert.equal(opts.redirect,"manual");
    assert.equal(opts.cache,undefined);
    assert.deepEqual(JSON.parse(opts.body),{idToken});
    return {ok:!fail,status,json:async()=>({users:[user]})};
  };
}
test("Firebase accounts:lookup accepts enabled and not revoked signed-in UID",async()=>{
  const checked=await verifyFirebaseAccountIsActive(idToken,identity,accountCfg,{
    fetchImpl:accountFetch({localId:identity.uid,validSince:String(now-300),disabled:false})});
  assert.deepEqual(checked,{active:true,uid:identity.uid});
});
test("disabled user, revoked token, invalid account or missing backend config are rejected",async()=>{
  for(const user of [
    {localId:identity.uid,validSince:String(now-300),disabled:true},
    {localId:identity.uid,validSince:String(now-10),disabled:false},
    {localId:"another-user",validSince:String(now-300),disabled:false},
    {localId:identity.uid,disabled:false},
    {localId:identity.uid,validSince:"INVALID"},
    {localId:identity.uid,validSince:String(Number.MAX_SAFE_INTEGER)+"9"}
  ]){
    await assert.rejects(verifyFirebaseAccountIsActive(idToken,identity,accountCfg,{
      fetchImpl:accountFetch(user)}));
  }
  await assert.rejects(verifyFirebaseAccountIsActive(idToken,identity,accountCfg,{
    fetchImpl:accountFetch({localId:identity.uid,validSince:"0"},{fail:true})}));
  await assert.rejects(verifyFirebaseAccountIsActive(idToken,identity,{apiKey:"",projectId:PROJECT_ID}));
});
const origin="https://treasure-hunt-2d-jtk.pages.dev",uri="https://api.example.workers.dev";
const bearer="a".repeat(150)+"."+"b".repeat(150)+"."+"c".repeat(150);
const env={
  ALLOWED_ORIGIN:origin,FIREBASE_PROJECT_ID:PROJECT_ID,
  FIREBASE_PROJECT_NUMBER:PROJECT_NUMBER,FIREBASE_APP_ID:APP_ID,
  FIREBASE_WEB_API_KEY:API_KEY,
  LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}
};
function request(path="/api/v1/me",method="GET",headers={}){
 return new Request(uri+path,{method,headers:{
  origin,"cf-connecting-ip":"192.0.2.25",authorization:"Bearer "+bearer,
  "x-firebase-appcheck":token(),...headers}});
}
test("hardened gateway verifies all three phases before confirming read-only identity",async()=>{
  const sequence=[];
  const reply=await checkHardenedStagingLogin(request(),env,{
    verifyToken:async(t,project)=>{sequence.push("id");assert.equal(project,PROJECT_ID);
      return {uid:identity.uid,authTime:identity.authTime};},
    verifyAppCheck:async(t,conf)=>{sequence.push("app");
      assert.equal(t,request().headers.get("x-firebase-appcheck"));
      assert.deepEqual(conf,APP_CFG);return {appId:APP_ID};},
    verifyAccount:async(t,user,conf)=>{sequence.push("active");
      assert.equal(user.uid,identity.uid);
      assert.deepEqual(conf,accountCfg);return {active:true,uid:identity.uid};}
  });
  assert.equal(reply.status,200);
  assert.deepEqual(await reply.json(),{ok:true,signedIn:true,uid:identity.uid,scoreWrites:false});
  assert.deepEqual(sequence,["id","app","active"]);
});
test("hardened gateway fails if App Check missing, project mismatch, or account denied",async()=>{
  const validToken=async()=>({...identity});
  const active=async()=>({active:true});
  const noApp=await checkHardenedStagingLogin(request("/api/v1/me","GET",{"x-firebase-appcheck":""}),env,{
    verifyToken:validToken,verifyAccount:active});
  assert.equal(noApp.status,401);
  const wrongProject=await checkHardenedStagingLogin(request(),{...env,FIREBASE_PROJECT_NUMBER:"00000"},{
    verifyToken:validToken,verifyAppCheck:async()=>({appId:APP_ID}),verifyAccount:active});
  assert.equal(wrongProject.status,401);
  const disabled=await checkHardenedStagingLogin(request(),env,{
    verifyToken:validToken,verifyAppCheck:async()=>({appId:APP_ID}),
    verifyAccount:async()=>{throw Error("disabled");}});
  assert.equal(disabled.status,401);
  for(const method of ["GET","POST"])
    assert.equal((await checkHardenedStagingLogin(request("/api/v1/score",method),env)).status,404);
});
test("preflight allows App Check header without opening score routes",async()=>{
  const resp=await checkHardenedStagingLogin(request("/api/v1/me","OPTIONS",{
    "access-control-request-method":"GET",
    "access-control-request-headers":"authorization,x-firebase-appcheck"}),env);
  assert.equal(resp.status,204);
  assert.match(resp.headers.get("access-control-allow-headers"),/x-firebase-appcheck/i);
});
