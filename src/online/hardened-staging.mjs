// Fail-closed next-generation login gate. NOT deployed.
// Existing Staging gate is left untouched until the 2D web App Check is configured.
import {checkStagingLogin} from "./staging-verification.mjs";
import {verifyFirebaseIdToken} from "./firebase-auth.mjs";
import {verifyFirebaseAppCheckToken,verifyFirebaseAccountIsActive} from "./firebase-hardening.mjs";
export async function checkHardenedStagingLogin(request,env={},options={}){
 // The existing Staging gateway enforces exact Origin, GET /me only,
 // a rate limit binding and a signed Firebase ID token.
 return checkStagingLogin(request,env,{
  verifyToken:async(token,projectId)=>{
   if(projectId!=="treasure-hunt-2d"||
      env.FIREBASE_PROJECT_ID!=="treasure-hunt-2d"||
      env.FIREBASE_PROJECT_NUMBER!=="439998873632"||
      env.FIREBASE_APP_ID!=="1:439998873632:web:4b694f8159d9d9e0163c45") {
     throw Error("Isolated Firebase App Check settings not configured");
   }
   const identity=await (options.verifyToken??verifyFirebaseIdToken)(token,projectId);
   if(!identity||typeof identity.uid!=="string"||!identity.uid)throw Error("Invalid identity");
   const attestation=request.headers.get("x-firebase-appcheck");
   await (options.verifyAppCheck??verifyFirebaseAppCheckToken)(attestation,{
     projectNumber:env.FIREBASE_PROJECT_NUMBER,appId:env.FIREBASE_APP_ID});
   await (options.verifyAccount??verifyFirebaseAccountIsActive)(token,identity,{
     apiKey:env.FIREBASE_WEB_API_KEY,projectId});
   return identity;
  }
 });
}
export default {fetch(request,env){return checkHardenedStagingLogin(request,env);}};
