import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {probeJwksRuntime} from "../src/online/jwks-runtime-probe.mjs";
const ORIGIN="https://treasure-hunt-2d-jtk.pages.dev";
const url="https://api.invalid/api/v1/appcheck-jwks-probe";
const env={ALLOWED_ORIGIN:ORIGIN,LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}};
const req=(origin=ORIGIN)=>new Request(url,{headers:{origin,"cf-connecting-ip":"192.0.2.1"}});
test("Cloudflare probe validates public JWKS with a genuine RSA JWK, returns no key",async()=>{
 const keypair=generateKeyPairSync("rsa",{modulusLength:2048});
 const jwk={...keypair.publicKey.export({format:"jwk"}),kid:"test"};
 const res=await probeJwksRuntime(req(),env,{fetch:async()=>({
   ok:true,status:200,json:async()=>({keys:[jwk]})
 })});
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.code,"JWKS_FETCH_AND_RSA_IMPORT_OK");
 assert.equal(body.keyCount,1);
 assert.doesNotMatch(JSON.stringify(body),/test|private|n\":|e\":/);
});
test("untrusted origins, missing binding and upstream failure fail closed",async()=>{
 assert.equal((await probeJwksRuntime(req("https://evil.test"),env)).status,403);
 assert.equal((await probeJwksRuntime(req(),{ALLOWED_ORIGIN:ORIGIN})).status,503);
 const r=await probeJwksRuntime(req(),env,{fetch:async()=>({ok:false,status:403})});
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{ok:false,code:"HTTP_NOT_OK",upstreamStatus:403});
});
