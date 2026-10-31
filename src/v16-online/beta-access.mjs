// Staging-only Closed Beta admission. Never allow a missing/empty list
// or wildcard to grant access. Put real Firebase UIDs into a Cloudflare secret,
// not in a public repository. Public scoreboard never exposes emails or UIDs.
const UID_RE=/^[A-Za-z0-9:_-]{1,128}$/;
export function configuredBetaUids(value){
 if(typeof value!=='string'||value.length>2048)return null;
 const raw=value.split(',').map(x=>x.trim());
 if(raw.length<1||raw.length>10||raw.some(x=>!UID_RE.test(x)))return null;
 const ids=new Set(raw);
 return ids.size===raw.length?ids:null;
}
export function authorizeClosedBeta(identity,env){
 const allowed=configuredBetaUids(env.V16_BETA_UIDS);
 if(!allowed)return {allowed:false,reason:'Closed Beta is not configured'};
 if(!identity||!UID_RE.test(identity.uid))return {allowed:false,reason:'Invalid verified identity'};
 // Firebase ID token validation MUST occur before this function is called.
 // UID is the stable user identity; do not trust a client-supplied email or UID.
 if(!allowed.has(identity.uid))return {allowed:false,reason:'Not invited to Closed Beta'};
 if(identity.provider!=='google.com'||identity.emailVerified!==true)
  return {allowed:false,reason:'Verified Google sign-in required'};
 return {allowed:true};
}
