import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyAppCheckOnServer} from "../src/client/appcheck-prep.mjs";
const url="https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev";
const jwt="a".repeat(150)+"."+"b".repeat(150)+"."+"c".repeat(150);
const user={uid:"my-account",getIdToken:async()=>jwt};
test("mobile sends both tokens once without force-refresh or persistence",async()=>{
 let count=0;
 const result=await verifyAppCheckOnServer({instance:{},getToken:async(inst,force)=>{
   assert.equal(force,false);return{token:jwt};},user,apiOrigin:url,
  fetchImpl:async(endpoint,args)=>{
   count++;assert.equal(endpoint,url+"/api/v1/appcheck-verify");
   assert.equal(args.headers.Authorization,"Bearer "+jwt);
   assert.equal(args.headers["X-Firebase-AppCheck"],jwt);
   assert.equal(args.redirect,"error");assert.equal(args.cache,"no-store");
   return {status:200,json:async()=>({ok:true,signedIn:true,uid:"my-account",
    appCheckVerified:true,accountStatusVerified:false,scoreWrites:false})};
  }});
 assert.deepEqual(result,{verifiedByServer:true,accountStatusVerified:false,scoreWrites:false});
 assert.equal(count,1);
});
test("server responses cannot spoof verified state",async()=>{
 const args={instance:{},getToken:async()=>({token:jwt}),user,apiOrigin:url};
 for(const payload of [
   {ok:true,signedIn:true,uid:"wrong-account",appCheckVerified:true,accountStatusVerified:false,scoreWrites:false},
   {ok:true,signedIn:true,uid:"my-account",appCheckVerified:false,accountStatusVerified:false,scoreWrites:false},
   {ok:true,signedIn:true,uid:"my-account",appCheckVerified:true,accountStatusVerified:true,scoreWrites:false}
 ])await assert.rejects(verifyAppCheckOnServer({...args,fetchImpl:async()=>({
  status:200,json:async()=>payload})}));
 await assert.rejects(verifyAppCheckOnServer({...args,apiOrigin:"https://gpt-voxel-3d.example",
   fetchImpl:async()=>{throw Error("should not send token")}}));
});
test("separate mobile and server buttons preserve honest status labels",()=>{
 const html=readFileSync(new URL("../login/index.html",import.meta.url),"utf8");
 const js=readFileSync(new URL("../login/login.mjs",import.meta.url),"utf8");
 assert.match(html,/id="test-appcheck"/);
 assert.match(html,/id="verify-appcheck-server"/);
 assert.match(js,/serverCheck.addEventListener\("click"/);
 assert.match(js,/verifyAppCheckOnServer/);
 assert.match(js,/ยังไม่ตรวจบัญชีถูกเพิกถอน/);
 assert.match(js,/isTokenAutoRefreshEnabled:false/);
 assert.doesNotMatch(js,/localStorage|console\.log|setInterval/);
});
