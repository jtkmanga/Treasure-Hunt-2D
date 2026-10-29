import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyFirebaseAccountIsActive,verifyFirebaseAppCheckToken} from "../src/online/firebase-hardening.mjs";
const project="439998873632",appId="1:439998873632:web:4b694f8159d9d9e0163c45";
test("Worker public JWKS uses supported redirect handling and rejects bad HTTP status",async()=>{
 const jwtPart=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
 const epoch=Math.floor(Date.now()/1000);
 const token=jwtPart({alg:"RS256",typ:"JWT",kid:"fixture"})+"."+
   jwtPart({iss:"https://firebaseappcheck.googleapis.com/"+project,
     aud:["projects/"+project],sub:appId,iat:epoch-10,exp:epoch+1000})+"."+("A".repeat(150));
 let called=0;
 await assert.rejects(verifyFirebaseAppCheckToken(token,{projectNumber:project,appId},{
  fetchImpl:async(url,opts)=>{
   called++;assert.equal(url,"https://firebaseappcheck.googleapis.com/v1/jwks");
   assert.equal(opts.redirect,"manual");
   assert.notEqual(opts.cache,"default");
   return {ok:false,status:302};
  }
 }));
 assert.equal(called,1);
 const source=readFileSync(new URL("../src/online/firebase-hardening.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/redirect:\s*["']error["']/);
});
test("disabled-user lookup never follows Google redirects",async()=>{
 const cfg={apiKey:"AIza"+"A".repeat(35),projectId:"treasure-hunt-2d"};
 const identity={uid:"user",authTime:1};
 await assert.rejects(verifyFirebaseAccountIsActive("A".repeat(250),identity,cfg,{
  fetchImpl:async(_,init)=>{
   assert.equal(init.redirect,"manual");
   return {ok:false,status:302};
  }
 }));
});
