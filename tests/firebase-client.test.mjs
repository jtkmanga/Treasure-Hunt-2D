import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateFirebaseWebConfig,validateStagingApiOrigin,verifyFirebaseUserWithApi,safeAuthError} from "../src/client/firebase-login-core.mjs";

const config={apiKey:"AIza"+"A".repeat(35),authDomain:"treasure-hunt-new.firebaseapp.com",
  projectId:"treasure-hunt-new",appId:"1:123456789:web:abcdef",messagingSenderId:"123456789"};
const api="https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev";
const token="abc."+"xyz".repeat(50)+"."+"SIG".repeat(30);
test("validates independent Web config without copying old credentials",()=>{
  assert.deepEqual(validateFirebaseWebConfig(config),config);
  for(const bad of [
    {...config,projectId:"gpt-voxel-3d"},
    {...config,authDomain:"other.firebaseapp.com"},
    {...config,privateKey:"SECRET"},
    {...config,apiKey:"invalid"},
    {...config,appId:"1:9999:web:abcdef"}
  ])assert.throws(()=>validateFirebaseWebConfig(bad),/Firebase/);
  assert.throws(()=>validateFirebaseWebConfig(null));
});
test("only dedicated HTTPS staging worker is an approved token receiver",()=>{
  assert.equal(validateStagingApiOrigin(api),api);
  for(const bad of [
    "http://treasure-hunt-2d-staging-api.example.workers.dev",
    "https://gpt-voxel-3d-staging-01.hjinffv5426.workers.dev",
    "https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev.evil.test",
    "https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev/path",
    "https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev?x=1",
    "javascript:alert(1)",null
  ])assert.throws(()=>validateStagingApiOrigin(bad));
});
test("sends token only to exact /me endpoint with no redirects or caches",async()=>{
  let called=0;const user={uid:"u-123",getIdToken:async()=>token};
  const r=await verifyFirebaseUserWithApi(user,api,async(url,opts)=>{
    called++;assert.equal(url,api+"/api/v1/me");
    assert.equal(opts.headers.Authorization,"Bearer "+token);
    assert.equal(opts.credentials,"omit");assert.equal(opts.redirect,"error");assert.equal(opts.cache,"no-store");
    return {status:200,json:async()=>({ok:true,signedIn:true,uid:"u-123",scoreWrites:false})};
  });
  assert.deepEqual(r,{verified:true,uid:"u-123",scoreWrites:false});
  assert.equal(called,1);
});
test("rejects forged/mismatched token, failed backend and cross-user response",async()=>{
  const user={uid:"u-123",getIdToken:async()=>token};
  await assert.rejects(verifyFirebaseUserWithApi(user,api,async()=>({
    status:200,json:async()=>({ok:true,signedIn:true,uid:"u-other",scoreWrites:false})
  })),/mismatch/);
  await assert.rejects(verifyFirebaseUserWithApi(user,api,async()=>({status:401})),/unavailable/);
  await assert.rejects(verifyFirebaseUserWithApi({uid:"u-123",getIdToken:async()=>"fake"},api,async()=>({status:200})),/Invalid/);
  let called=false;
  await assert.rejects(verifyFirebaseUserWithApi(user,null,async()=>{called=true;}),/not been enabled/);
  assert.equal(called,false);
});
test("preview is disconnected by default and never contains copied 3D config",()=>{
  const page=readFileSync(new URL("../login/index.html",import.meta.url),"utf8");
  const module=readFileSync(new URL("../login/login.mjs",import.meta.url),"utf8");
  assert.match(page,/Google Login Staging/);
  assert.match(module,/STAGING_API_ORIGIN=null/);
  assert.match(module,/firebase-config.json/);
  assert.match(module,/signInWithPopup/);
  assert.doesNotMatch(module,/localStorage|console\.log|getRedirectResult|ghp_/);
  assert.equal(safeAuthError({code:"auth/unauthorized-domain"}).includes("Authorized domains"),true);
});
