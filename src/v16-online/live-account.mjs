// Live account verification with Firebase Authentication REST API.
// Firebase ID token signature MUST be verified separately before this function.
// The Web API key identifies the Firebase project; it does not grant admin
// privileges. Never send Firebase user tokens to logs or third-party origins.
// https://firebase.google.com/docs/reference/rest/auth#section-get-account-info
const FIREBASE_ACCOUNT_LOOKUP='https://identitytoolkit.googleapis.com/v1/accounts:lookup';
export async function verifyFirebaseLiveAccount({uid,idToken,authTime,apiKey,fetchImpl=fetch}){
 if(typeof uid!=='string'||!uid||uid.length>128
  ||typeof idToken!=='string'||idToken.length<100||idToken.length>8192
  ||!Number.isSafeInteger(authTime)||authTime<=0
  ||typeof apiKey!=='string'||!/^[A-Za-z0-9_-]{20,200}$/.test(apiKey))
  throw Error('Firebase account verification not configured');
 const result=await fetchImpl(FIREBASE_ACCOUNT_LOOKUP+'?key='+encodeURIComponent(apiKey),{
  method:'POST',
  headers:{'content-type':'application/json','cache-control':'no-store'},
  body:JSON.stringify({idToken}),
 });
 if(!result?.ok)throw Error('Firebase live account lookup unavailable');
 const json=await result.json();
 if(!Array.isArray(json?.users)||json.users.length!==1)throw Error('Account record unavailable');
 const account=json.users[0];
 if(!account||account.localId!==uid||account.disabled===true)
  return {uid,disabled:true,revoked:true};
 if(account.disabled!==undefined&&account.disabled!==false)
  throw Error('Invalid Firebase account status');
 // validSince is the revocation boundary in seconds: compare with JWT auth_time,
 // not iat. Missing/invalid bounds fail closed, never imply not revoked.
 const validSince=account.validSince;
 if((typeof validSince!=='string'&&typeof validSince!=='number')
  ||!/^\d{1,12}$/.test(String(validSince))
  ||!Number.isSafeInteger(Number(validSince))||Number(validSince)<0)
  throw Error('Firebase revocation state unavailable');
 if(account.emailVerified===false)return {uid,disabled:false,revoked:true};
 return {uid,disabled:false,revoked:authTime<Number(validSince)};
}
