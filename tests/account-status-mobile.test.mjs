import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyActiveAccountOnServer,explainAccountStatusError}
 from "../src/client/appcheck-prep.mjs";
const BASE="https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev";
const jwt="a".repeat(150)+"."+"b".repeat(150)+"."+"c".repeat(150);
const user={uid:"owner-test-uid",getIdToken:async()=>jwt};
test("client requests current Firebase account status on one explicit tap only",async()=>{
 let count=0;
 const r=await verifyActiveAccountOnServer({instance:{},
  getToken:async(_,forceRefresh)=>{assert.equal(forceRefresh,false);return {token:jwt}},
  user,apiOrigin:BASE,
  fetchImpl:async(url,init)=>{
   count++;assert.equal(url,BASE+"/api/v1/account-status");
   assert.equal(init.method,"GET");assert.equal(init.headers.Authorization,"Bearer "+jwt);
   assert.equal(init.headers["X-Firebase-AppCheck"],jwt);
   assert.equal(init.redirect,"error");assert.equal(init.cache,"no-store");
   return {status:200,json:async()=>({
    ok:true,signedIn:true,uid:user.uid,
    appCheckVerified:true,accountStatusVerified:true,scoreWrites:false
   })};
  }
 });
 assert.equal(count,1);
 assert.deepEqual(r,{accountStatusVerified:true,appCheckVerified:true,scoreWrites:false});
});
test("client does not trust an unverified or mismatched Firebase identity",async()=>{
 const a={instance:{},getToken:async()=>({token:jwt}),user,apiOrigin:BASE};
 for(const body of [
  {ok:true,signedIn:true,uid:"wrong",appCheckVerified:true,accountStatusVerified:true,scoreWrites:false},
  {ok:true,signedIn:true,uid:user.uid,appCheckVerified:false,accountStatusVerified:true,scoreWrites:false},
  {ok:true,signedIn:true,uid:user.uid,appCheckVerified:true,accountStatusVerified:false,scoreWrites:false}
 ]){
  await assert.rejects(verifyActiveAccountOnServer({...a,fetchImpl:async()=>({status:200,json:async()=>body})}));
 }
 await assert.rejects(verifyActiveAccountOnServer({...a,apiOrigin:"https://other.invalid",
  fetchImpl:async()=>{throw Error("SHOULD NOT SEND")}}));
});
test("client shows safe English/Thai status and never leaks raw bearer token",async()=>{
 for(const code of ["ACCOUNT_LOOKUP_NOT_CONFIGURED","ACCOUNT_NOT_ACTIVE_OR_REVOKED",
  "ACCOUNT_LOOKUP_UNAVAILABLE"]){
  const safe=explainAccountStatusError(Error(code));
  assert.ok(safe.length>20);
  assert.ok(!safe.includes(jwt));
 }
 const js=readFileSync(new URL("../login/login.mjs",import.meta.url),"utf8");
 const html=readFileSync(new URL("../login/index.html",import.meta.url),"utf8");
 assert.match(js,/verifyActiveAccountOnServer/);
 assert.match(js,/accountCheck.addEventListener\("click"/);
 assert.match(js,/ยังไม่เปิดคะแนนแข่งขัน/);
 assert.match(html,/id="verify-account-status"/);
 assert.match(html,/id="account-status"/);
 assert.match(js,/isTokenAutoRefreshEnabled:false/);
 assert.doesNotMatch(js,/console\.log|setInterval|localStorage/);
});
