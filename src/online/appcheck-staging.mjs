import {checkStagingLogin} from "./staging-verification.mjs";
import {verifyFirebaseIdToken} from "./firebase-auth.mjs";
import {verifyFirebaseAppCheckToken} from "./firebase-hardening.mjs";
// Read-only diagnostics. All score, VIP, payment, leaderboard, and admin routes stay closed.
export async function checkStagingAppCheck(request,env={},options={}){
 const url=new URL(request.url);
 if(url.pathname!=="/api/v1/appcheck-verify")return checkStagingLogin(request,env,options);
 if(env.FIREBASE_PROJECT_ID!=="treasure-hunt-2d"||
    env.FIREBASE_PROJECT_NUMBER!=="439998873632"||
    env.FIREBASE_APP_ID!=="1:439998873632:web:4b694f8159d9d9e0163c45")
  return new Response(JSON.stringify({ok:false,error:"App Check not configured"}),{
   status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
 url.pathname="/api/v1/me";
 const verified=await checkStagingLogin(new Request(url,request),env,{
  verifyToken:async(token,projectId)=>{
   const identity=await (options.verifyToken??verifyFirebaseIdToken)(token,projectId);
   if(!identity||typeof identity.uid!=="string"||!identity.uid)throw Error("Invalid identity");
   const app=await (options.verifyAppCheck??verifyFirebaseAppCheckToken)(
    request.headers.get("x-firebase-appcheck"),{
     projectNumber:env.FIREBASE_PROJECT_NUMBER,appId:env.FIREBASE_APP_ID
    });
   if(app?.appId!==env.FIREBASE_APP_ID)throw Error("Wrong app");
   return identity;
  }
 });
 if(request.method!=="GET"||verified.status!==200)return verified;
 const body=await verified.json();
 if(body?.ok!==true||body?.signedIn!==true||body?.scoreWrites!==false||
   typeof body.uid!=="string"||!body.uid)
  return new Response(JSON.stringify({ok:false,error:"Bad signed-in response"}),{status:503});
 const headers=new Headers(verified.headers);headers.set("cache-control","no-store");
 return new Response(JSON.stringify({...body,appCheckVerified:true,accountStatusVerified:false}),{status:200,headers});
}
export default {fetch(request,env){return checkStagingAppCheck(request,env);}};
