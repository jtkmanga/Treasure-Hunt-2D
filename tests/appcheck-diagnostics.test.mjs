import test from "node:test";
import assert from "node:assert/strict";
import {checkStagingAppCheck} from "../src/online/appcheck-staging.mjs";
import {explainAppCheckFailure,verifyAppCheckOnServer} from "../src/client/appcheck-prep.mjs";
const origin="https://treasure-hunt-2d-jtk.pages.dev";
const jwt="a".repeat(140)+"."+"b".repeat(140)+"."+"c".repeat(140);
const api="https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev";
const env={ALLOWED_ORIGIN:origin,FIREBASE_PROJECT_ID:"treasure-hunt-2d",
 FIREBASE_PROJECT_NUMBER:"439998873632",FIREBASE_APP_ID:"1:439998873632:web:4b694f8159d9d9e0163c45",
 LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}};
const req=(headers={})=>new Request(api+"/api/v1/appcheck-verify",{
 method:"GET",headers:{origin,authorization:"Bearer "+jwt,"cf-connecting-ip":"192.0.2.10",
 "x-firebase-appcheck":jwt,...headers}
});
const fake={verifyToken:async()=>({uid:"u-123"})};
test("App Check faults are not confused with Firebase Google identity problems",async()=>{
 const invalid=await checkStagingAppCheck(req(),env,{...fake,verifyAppCheck:async()=>{throw Error("Invalid App Check signature");}});
 assert.equal(invalid.status,401);
 assert.equal((await invalid.json()).code,"APP_CHECK_REJECTED");
 assert.equal(invalid.headers.get("access-control-allow-origin"),origin);
 const keys=await checkStagingAppCheck(req(),env,{...fake,verifyAppCheck:async()=>{throw Error("App Check keys unavailable");}});
 assert.equal(keys.status,503);
 assert.equal((await keys.json()).code,"APP_CHECK_KEYS_UNAVAILABLE");
 const missing=await checkStagingAppCheck(req({"x-firebase-appcheck":""}),env,{...fake});
 assert.equal(missing.status,401);
 assert.equal((await missing.json()).code,"APP_CHECK_MISSING_OR_INVALID");
 const jwtBad=await checkStagingAppCheck(req(),env,{verifyToken:async()=>{throw Error("Invalid Google JWT");}});
 assert.equal(jwtBad.status,401);
 assert.equal((await jwtBad.json()).error,"Invalid or expired Firebase ID token");
});
test("diagnostic must not leak tokens, email or verifier exception text",async()=>{
 const rejected=await checkStagingAppCheck(req(),env,{...fake,verifyAppCheck:async()=>{throw Error("SECRET JWT "+jwt);}});
 const body=await rejected.text();
 assert.equal(rejected.status,401);
 assert.doesNotMatch(body,/SECRET|JWT|uid|email|eyJ|a{100}/);
});
test("client recognizes specific safe server errors and keeps all tokens in headers",async()=>{
 const args={instance:{},getToken:async()=>({token:jwt}),
  user:{uid:"u-123",getIdToken:async()=>jwt},apiOrigin:api};
 for(const [status,code,expected] of [
   [401,"APP_CHECK_REJECTED","Cloudflare ปฏิเสธ"],
   [503,"APP_CHECK_KEYS_UNAVAILABLE","Firebase JWKS"],
   [429,null,"Rate Limit"],
   [401,null,"Google ID Token"]
 ]) {
  let actual;
  try{
   await verifyAppCheckOnServer({...args,fetchImpl:async(_,init)=>{
      assert.equal(init.headers["X-Firebase-AppCheck"],jwt);
      assert.equal(init.headers.Authorization,"Bearer "+jwt);
      return {status,json:async()=>code?{code}:{ok:false}};
   }});
  }catch(e){actual=e;}
  assert.ok(actual);
  assert.match(explainAppCheckFailure(actual),new RegExp(expected));
 }
 assert.match(explainAppCheckFailure(Error("NETWORK_OR_CORS")),/CORS/);
 assert.doesNotMatch(explainAppCheckFailure(Error(jwt)),/a{100}/);
});
