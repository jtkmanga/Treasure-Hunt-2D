// Extra security checks for read-only 2D Google Login staging.
// Do not deploy before the 2D Firebase App Check web app is registered.
// No service-account keys or client-supplied scores are accepted here.
const APP_CHECK_JWKS_URL="https://firebaseappcheck.googleapis.com/v1/jwks";
const ACCOUNT_LOOKUP_URL="https://identitytoolkit.googleapis.com/v1/accounts:lookup";
let cachedJwks=null, jwksExpiresAt=0, jwksPromise=null;
function base64urlBytes(value){
 if(typeof value!=="string"||value.length>8192||!/^[A-Za-z0-9_-]+$/.test(value))throw Error("Invalid attestation token");
 const str=atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"="));
 return Uint8Array.from(str,c=>c.charCodeAt(0));
}
function decodePart(value){
 const result=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(base64urlBytes(value)));
 if(!result||typeof result!=="object"||Array.isArray(result))throw Error("Invalid attestation token");
 return result;
}
async function publicKeys(fetchImpl){
 // Cache only the built-in network fetch; isolated test fetches must not poison the cache.
 if(fetchImpl===fetch && cachedJwks && Date.now()<jwksExpiresAt)return cachedJwks;
 const fetchKeys=async()=>{
  const r=await fetchImpl(APP_CHECK_JWKS_URL,{method:"GET",redirect:"manual"});
  if(!r.ok)throw Error("App Check keys unavailable");
  const body=await r.json();
  if(!Array.isArray(body?.keys)||body.keys.length===0||body.keys.length>20)throw Error("Invalid App Check keys");
  if(body.keys.some(k=>!k||k.kty!=="RSA"||typeof k.kid!=="string"||!k.kid
    ||typeof k.n!=="string"||typeof k.e!=="string"))throw Error("Invalid App Check keys");
  return body.keys;
 };
 if(fetchImpl!==fetch)return fetchKeys();
 if(!jwksPromise)jwksPromise=fetchKeys().then(keys=>{
   cachedJwks=keys;jwksExpiresAt=Date.now()+60*60*1000;return keys;
 }).finally(()=>{jwksPromise=null;});
 return jwksPromise;
}
export async function verifyFirebaseAppCheckToken(token,config,options={}){
 const {projectNumber,appId}=config||{};
 if(!/^[0-9]{6,20}$/.test(projectNumber||"") ||
    typeof appId!=="string"||!/^1:[0-9]{6,20}:web:[A-Za-z0-9]+$/.test(appId)
    ||!appId.startsWith("1:"+projectNumber+":web:"))throw Error("App Check not configured");
 if(typeof token!=="string"||token.length<100||token.length>8192)throw Error("Missing App Check token");
 const parts=token.split(".");
 if(parts.length!==3)throw Error("Invalid App Check token");
 const header=decodePart(parts[0]),claims=decodePart(parts[1]);
 const now=options.nowSeconds?.()??Math.floor(Date.now()/1000);
 if(header.alg!=="RS256"||header.typ!=="JWT"||typeof header.kid!=="string"
    ||header.kid.length>200||!header.kid ||
    claims.iss!=="https://firebaseappcheck.googleapis.com/"+projectNumber ||
    !Array.isArray(claims.aud)||!claims.aud.includes("projects/"+projectNumber)||
    claims.sub!==appId||!Number.isSafeInteger(claims.iat)||claims.iat>now||
    !Number.isSafeInteger(claims.exp)||claims.exp<=now||claims.exp<=claims.iat)
    throw Error("Invalid App Check claims");
 const keys=await publicKeys(options.fetchImpl??fetch);
 const key=keys.find(k=>k.kid===header.kid && (k.alg===undefined||k.alg==="RS256")
   &&(k.use===undefined||k.use==="sig"));
 if(!key)throw Error("Unknown App Check signing key");
 const imported=await crypto.subtle.importKey("jwk",key,
   {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 const verified=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",imported,
   base64urlBytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
 if(!verified)throw Error("Invalid App Check signature");
 return {appId:claims.sub};
}
export async function verifyFirebaseAccountIsActive(idToken,identity,config,options={}){
 const {apiKey,projectId}=config||{};
 if(!/^AIza[A-Za-z0-9_-]{35}$/.test(apiKey||"")||
    projectId!=="treasure-hunt-2d"||
    !identity||typeof identity.uid!=="string"||!identity.uid||
    !Number.isSafeInteger(identity.authTime)||identity.authTime<0) {
   throw Error("Firebase revocation check not configured");
 }
 if(typeof idToken!=="string"||idToken.length<100||idToken.length>8192)
   throw Error("Invalid Firebase ID token");
 // Google's documented accounts:lookup endpoint accepts the user's own ID token.
 // This extra request checks disabled status and validSince; no Admin SDK key.
 const requestUrl=ACCOUNT_LOOKUP_URL+"?key="+encodeURIComponent(apiKey);
 let r;
 try {
  r=await (options.fetchImpl??fetch)(requestUrl,{method:"POST",
   headers:{"content-type":"application/json"},
   body:JSON.stringify({idToken}),redirect:"manual"});
 } catch { throw Error("Firebase account status unavailable"); }
 // Do not follow any redirect, including to a host which could receive the ID token.
 if(!r?.ok || r.status!==200)throw Error("Firebase account status unavailable");
 let body;
 try { body=await r.json(); } catch { throw Error("Firebase account status unavailable"); }
 if(!Array.isArray(body?.users)||body.users.length!==1)throw Error("Firebase account not found");
 const user=body.users[0];
 if(user?.localId!==identity.uid||user?.disabled===true||
    !/^[0-9]+$/.test(user?.validSince||""))throw Error("Account disabled or status invalid");
 const validSince=Number(user.validSince);
 if(!Number.isSafeInteger(validSince)||identity.authTime<validSince)
   throw Error("Firebase session revoked");
 return {active:true,uid:identity.uid};
}
