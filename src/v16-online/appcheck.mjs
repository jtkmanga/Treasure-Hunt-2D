// Firebase App Check JWKS signature verification for Cloudflare Workers.
// Based on Firebase custom resource backend verification rules (RS256).
const JWKS='https://firebaseappcheck.googleapis.com/v1/jwks';
let cache=null, expiresAt=0, fetching=null;
function base64url(s){
 if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid JWT encoding');
 const binary=atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function parseJSON(s){const obj=JSON.parse(new TextDecoder().decode(base64url(s)));if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('Invalid claims');return obj;}
async function publicKeys(fetchImpl){
 const now=Date.now();if(cache&&now<expiresAt)return cache;
 if(!fetching)fetching=(async()=>{
  const res=await fetchImpl(JWKS,{method:'GET'});
  if(!res.ok)throw Error('App Check keys unavailable');
  const body=await res.json();
  if(!Array.isArray(body.keys)||body.keys.length<1||body.keys.length>20)throw Error('Invalid App Check JWKS');
  for(const k of body.keys)if(k.kty!=='RSA'||k.alg!=='RS256'||!k.kid||!k.n||!k.e)throw Error('Untrusted JWK');
  cache=body.keys;
  expiresAt=Date.now()+Math.min(6*3600_000,Math.max(60_000,Number(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||300)*1000));
  return cache;
 })().finally(()=>{fetching=null});
 return fetching;
}
export async function verifyAppCheck(token,projectNumber,appId,{fetchImpl=fetch,now=Date.now()}={}){
 if(!/^\d{5,25}$/.test(String(projectNumber))||typeof appId!=='string'||!appId)throw Error('App Check server not configured');
 if(typeof token!=='string'||token.length<100||token.length>8192)throw Error('Missing App Check token');
 const parts=token.split('.');if(parts.length!==3)throw Error('Invalid App Check JWT');
 const header=parseJSON(parts[0]),claims=parseJSON(parts[1]);
 if(header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string'||header.kid.length>200)throw Error('Invalid JWT header');
 const seconds=Math.floor(now/1000);
 if(claims.iss!==`https://firebaseappcheck.googleapis.com/${projectNumber}`||
  !(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(`projects/${projectNumber}`)||
  claims.sub!==appId||!Number.isInteger(claims.exp)||claims.exp<=seconds||
  !Number.isInteger(claims.iat)||claims.iat>seconds||claims.iat<0||claims.iat>=claims.exp)
  throw Error('Invalid App Check claims');
 const keys=await publicKeys(fetchImpl);
 const key=keys.find(k=>k.kid===header.kid);if(!key)throw Error('Unknown App Check key');
 const pub=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pub,base64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 if(!valid)throw Error('Invalid App Check signature');
 return {appId:claims.sub};
}
