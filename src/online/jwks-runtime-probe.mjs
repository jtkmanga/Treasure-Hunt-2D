// TEMPORARY PUBLIC-KEY RUNTIME DIAGNOSTIC for an isolated 2D Staging Worker.
// This route retrieves public Firebase JWKS, returns only a coarse status code,
// and never accesses credentials or game data. Remove after investigation.
const JWKS_URL="https://firebaseappcheck.googleapis.com/v1/jwks";
const reply=(status,code,headers={},extra={})=>new Response(JSON.stringify({ok:status===200,code,...extra}),{
 status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}
});
export async function probeJwksRuntime(request,env={},injected={}){
 const origin=request.headers.get("origin");
 if(origin!=="https://treasure-hunt-2d-jtk.pages.dev"||origin!==env.ALLOWED_ORIGIN)
   return reply(403,"ORIGIN_DENIED");
 const cors={"access-control-allow-origin":origin,"vary":"Origin"};
 if(request.method!=="GET")return reply(405,"METHOD_DENIED",cors);
 const ip=request.headers.get("cf-connecting-ip");
 if(!ip||ip.length>64||!/^[A-Za-z0-9:.]+$/.test(ip)||
    typeof env.LOGIN_RATE_LIMITER?.limit!=="function")return reply(503,"PROBE_PROTECTION_MISSING",cors);
 let limit;try{limit=await env.LOGIN_RATE_LIMITER.limit({key:"login-verify:"+ip});}
 catch{return reply(503,"PROBE_PROTECTION_UNAVAILABLE",cors);}
 if(limit?.success!==true)return reply(429,"PROBE_RATE_LIMITED",cors);
 let fetched;
 try {fetched=await (injected.fetch??fetch)(JWKS_URL,{method:"GET",redirect:"error"});}
 catch{return reply(503,"FETCH_THROWN",cors);}
 if(!fetched?.ok)return reply(503,"HTTP_NOT_OK",cors,{upstreamStatus:Number(fetched?.status)||0});
 let body;
 try{body=await fetched.json();}catch{return reply(503,"JWKS_JSON_INVALID",cors);}
 if(!Array.isArray(body?.keys)||body.keys.length<1||body.keys.length>20)
   return reply(503,"JWKS_NO_KEYS",cors);
 const key=body.keys[0];
 if(typeof key?.n!=="string"||typeof key?.e!=="string"||key?.kty!=="RSA")
   return reply(503,"JWKS_KEY_SHAPE_INVALID",cors);
 try{await (injected.crypto??crypto).subtle.importKey("jwk",key,
   {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);}
 catch{return reply(503,"CRYPTO_IMPORT_FAILED",cors);}
 return reply(200,"JWKS_FETCH_AND_RSA_IMPORT_OK",cors,{keyCount:body.keys.length});
}
