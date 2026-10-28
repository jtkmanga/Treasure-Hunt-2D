import {handleRequest} from "./handler.mjs";
const send=(error,status,headers={})=>new Response(JSON.stringify({ok:false,error}),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "x-content-type-options":"nosniff",...headers}});
export async function checkStagingLogin(request,env={},testOptions={}){
 const pathname=new URL(request.url).pathname;
 if(pathname!=="/api/v1/me")return send("Not found",404);
 const origin=request.headers.get("origin");
 if(origin!=="https://treasure-hunt-2d-jtk.pages.dev"||origin!==env.ALLOWED_ORIGIN)
   return send("Origin not allowed",403);
 const cors={"access-control-allow-origin":origin,"vary":"Origin",
 "access-control-allow-methods":"GET, OPTIONS",
 "access-control-allow-headers":"authorization, content-type","access-control-max-age":"120"};
 if(request.method==="OPTIONS"){
   if(request.headers.get("access-control-request-method")!=="GET")return send("Method not allowed",405,cors);
   if(!/^(authorization|content-type)(\s*,\s*(authorization|content-type))?$/i.test(request.headers.get("access-control-request-headers")||""))
     return send("Headers not allowed",403,cors);
   return new Response(null,{status:204,headers:cors});
 }
 if(request.method!=="GET")return send("Method not allowed",405,cors);
 if(!/^Bearer [A-Za-z0-9_.-]{100,8192}$/.test(request.headers.get("authorization")||""))
   return send("Authentication required",401,cors);
 const ip=request.headers.get("cf-connecting-ip");
 if(!ip||ip.length>64||!/^[A-Za-z0-9:.]+$/.test(ip))return send("Client IP unavailable",503,cors);
 // Fail closed if the native Cloudflare rate-limit binding has not been configured.
 if(typeof env.LOGIN_RATE_LIMITER?.limit!=="function")return send("Protection not configured",503,cors);
 let answer;try{answer=await env.LOGIN_RATE_LIMITER.limit({key:"login-verify:"+ip});}
 catch{return send("Protection unavailable",503,cors);}
 if(answer?.success!==true)return send("Rate limit exceeded",429,{...cors,"retry-after":"60"});
 // Handler validates Firebase JWT RS256; it doesn't validate revocation or App Check.
 // No database writes, purchases, VIP or ranked scores.
 return handleRequest(request,env,testOptions);
}
export default {fetch(request,env){return checkStagingLogin(request,env);}};
