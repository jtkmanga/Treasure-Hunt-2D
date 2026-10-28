import {checkStagingLogin} from "./staging-verification.mjs";
import {verifyFirebaseAppCheckToken} from "./firebase-hardening.mjs";

// A staged diagnostic only: /me remains as-is, no D1/score/payment capability.
// Responses contain coarse status codes; never include JWTs, user email, UID in errors,
// signing key details, upstream error messages or token contents.
function reject(status,code,headers={}) {
 const result=new Headers(headers);
 result.set("content-type","application/json; charset=utf-8");
 result.set("cache-control","no-store");
 result.set("x-content-type-options","nosniff");
 return new Response(JSON.stringify({ok:false,code,scoreWrites:false}),{status,headers:result});
}
export async function checkStagingAppCheck(request,env={},options={}) {
 const url=new URL(request.url);
 if(url.pathname!=="/api/v1/appcheck-verify")
   return checkStagingLogin(request,env,options);
 if(env.FIREBASE_PROJECT_ID!=="treasure-hunt-2d"||
    env.FIREBASE_PROJECT_NUMBER!=="439998873632"||
    env.FIREBASE_APP_ID!=="1:439998873632:web:4b694f8159d9d9e0163c45")
   return reject(503,"APP_CHECK_NOT_CONFIGURED");
 // Reuse the verified origin/method, CORS, rate limit and Google ID token checks.
 // Preflight does not need a JWT and is handled by this existing gateway.
 url.pathname="/api/v1/me";
 const googleResponse=await checkStagingLogin(new Request(url,request),env,options);
 if(request.method!=="GET"||googleResponse.status!==200)return googleResponse;
 let identity;try{identity=await googleResponse.json();}catch {
   return reject(503,"GOOGLE_RESPONSE_INVALID",googleResponse.headers);
 }
 if(identity?.ok!==true||identity?.signedIn!==true||identity?.scoreWrites!==false||
    typeof identity.uid!=="string"||identity.uid.length<1)
   return reject(503,"GOOGLE_RESPONSE_INVALID",googleResponse.headers);
 const attestation=request.headers.get("x-firebase-appcheck");
 if(typeof attestation!=="string"||attestation.length<100||attestation.length>8192||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(attestation))
   return reject(401,"APP_CHECK_MISSING_OR_INVALID",googleResponse.headers);
 let result;
 try{
   result=await (options.verifyAppCheck??verifyFirebaseAppCheckToken)(attestation,{
    projectNumber:env.FIREBASE_PROJECT_NUMBER,appId:env.FIREBASE_APP_ID
   });
 }catch(e){
   // Temporary failure of the trusted public-key service is not an invalid JWT.
   // Do not expose the exact verification failure to the client.
   if(String(e?.message||"").includes("keys unavailable")||
      String(e?.message||"").includes("App Check keys")||
      e?.name==="AbortError"||e?.name==="TypeError")
     return reject(503,"APP_CHECK_KEYS_UNAVAILABLE",googleResponse.headers);
   return reject(401,"APP_CHECK_REJECTED",googleResponse.headers);
 }
 if(result?.appId!==env.FIREBASE_APP_ID)
   return reject(401,"APP_CHECK_REJECTED",googleResponse.headers);
 const headers=new Headers(googleResponse.headers);
 headers.set("cache-control","no-store");
 return new Response(JSON.stringify({ok:true,signedIn:true,uid:identity.uid,
    scoreWrites:false,appCheckVerified:true,accountStatusVerified:false}),
    {status:200,headers});
}
export default {fetch(request,env){return checkStagingAppCheck(request,env);}};
