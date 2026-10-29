// Read-only test endpoint: verify active Firebase account AFTER Google and App Check.
// This endpoint is NOT the game authorization path and has no database or payment access.
import {checkStagingAppCheck} from "./appcheck-staging.mjs";
import {verifyFirebaseIdToken} from "./firebase-auth.mjs";
import {verifyFirebaseAccountIsActive} from "./firebase-hardening.mjs";
const ROUTE="/api/v1/account-status";
const PROJECT="treasure-hunt-2d";
const WEB_ORIGIN="https://treasure-hunt-2d-jtk.pages.dev";
function reply(status,code,headers={}) {
 const h=new Headers(headers);
 h.set("content-type","application/json; charset=utf-8");
 h.set("cache-control","no-store");
 h.set("x-content-type-options","nosniff");
 return new Response(JSON.stringify({ok:false,code,scoreWrites:false}),{status,headers:h});
}
export async function checkStagingAccountStatus(request,env={},options={}) {
 const url=new URL(request.url);
 if(url.pathname!==ROUTE)return checkStagingAppCheck(request,env,options);
 const origin=request.headers.get("origin");
 if(origin!==WEB_ORIGIN||origin!==env.ALLOWED_ORIGIN)
   return reply(403,"ORIGIN_DENIED");
 const cors={"access-control-allow-origin":origin,"vary":"Origin"};
 // Delegate preflight and unsupported methods to the existing, tested gate.
 url.pathname="/api/v1/appcheck-verify";
 const routed=new Request(url,request);
 if(request.method==="OPTIONS"||request.method!=="GET")
   return checkStagingAppCheck(routed,env,options);
 // No secret? Fail closed before token/JWKS/Identity Toolkit requests.
 if(env.FIREBASE_PROJECT_ID!==PROJECT||
    typeof env.FIREBASE_WEB_API_KEY!=="string"||
    !/^AIza[A-Za-z0-9_-]{35}$/.test(env.FIREBASE_WEB_API_KEY))
   return reply(503,"ACCOUNT_LOOKUP_NOT_CONFIGURED",cors);
 const valid=await checkStagingAppCheck(routed,env,options);
 if(valid.status!==200)return valid;
 let body;try{body=await valid.json();}catch{return reply(503,"VERIFY_RESULT_INVALID",valid.headers);}
 if(body?.ok!==true||body?.signedIn!==true||body?.appCheckVerified!==true||
    body?.scoreWrites!==false||typeof body.uid!=="string"||!body.uid)
   return reply(503,"VERIFY_RESULT_INVALID",valid.headers);
 const authorization=request.headers.get("authorization")||"";
 const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 let identity;
 try{identity=await (options.verifyToken??verifyFirebaseIdToken)(token,PROJECT);}
 catch{return reply(401,"ACCOUNT_IDENTITY_INVALID",valid.headers);}
 if(identity?.uid!==body.uid||!Number.isSafeInteger(identity.authTime))
   return reply(401,"ACCOUNT_IDENTITY_INVALID",valid.headers);
 let current;
 try{
   current=await (options.verifyAccount??verifyFirebaseAccountIsActive)(token,identity,{
     apiKey:env.FIREBASE_WEB_API_KEY,projectId:PROJECT
   });
 }catch(e){
   if(e?.message==="Firebase account status unavailable")
     return reply(503,"ACCOUNT_LOOKUP_UNAVAILABLE",valid.headers);
   return reply(401,"ACCOUNT_NOT_ACTIVE_OR_REVOKED",valid.headers);
 }
 if(current?.active!==true||current?.uid!==identity.uid)
   return reply(401,"ACCOUNT_NOT_ACTIVE_OR_REVOKED",valid.headers);
 return new Response(JSON.stringify({
  ok:true,signedIn:true,uid:identity.uid,appCheckVerified:true,
  accountStatusVerified:true,scoreWrites:false
 }),{status:200,headers:valid.headers});
}
export default {fetch(request,env){return checkStagingAccountStatus(request,env);}};
