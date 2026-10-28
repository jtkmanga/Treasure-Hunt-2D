// This optional module is used only by the mobile staging preview.
// Never log, display, or persist raw App Check tokens.
export function validatePublicSiteKey(input) {
  if (typeof input !== "string" || input.trim().length < 16 || input.trim().length > 256 ||
      !/^[A-Za-z0-9_-]+$/.test(input.trim()) || input.includes(".")) {
    throw Error("Invalid reCAPTCHA Enterprise public site key");
  }
  return input.trim();
}
export function appCheckHeader(token) {
  if(typeof token!=="string"||token.length<100||token.length>8192||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw Error("App Check token unavailable");
  return {"X-Firebase-AppCheck":token};
}
// getToken(instance, false) uses a still-valid cached App Check token if available.
// No force refresh, no background interval, no upload to a backend in this trial.
export async function getAppCheckOnce(instance,getToken) {
  if(!instance||typeof getToken!=="function")throw Error("App Check not initialized");
  const result=await getToken(instance,false);
  appCheckHeader(result?.token);
  return {ok:true,verifiedByServer:false};
}

// One deliberate Cloudflare attestation check. Tokens only in HTTPS headers.
export async function verifyAppCheckOnServer({instance,getToken,user,apiOrigin,fetchImpl=fetch}){
 if(!instance||typeof getToken!=="function"||!user||!user.uid||
    typeof user.getIdToken!=="function")throw Error("Sign in and initialize App Check first");
 if(apiOrigin!=="https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev")
   throw Error("Unapproved verification server");
 const attestation=await getToken(instance,false);
 const appHeaders=appCheckHeader(attestation?.token);
 const idToken=await user.getIdToken();
 if(typeof idToken!=="string"||idToken.length<100||idToken.length>8192||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken))
   throw Error("Invalid Google identity token");
 let res;
 try{
   res=await fetchImpl(apiOrigin+"/api/v1/appcheck-verify",{
    method:"GET",headers:{...appHeaders,Authorization:"Bearer "+idToken,Accept:"application/json"},
    credentials:"omit",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)
   });
 }catch{throw Error("Staging verification unavailable");}
 if(res?.status!==200)throw Error("Staging rejected attestation");
 let body;try{body=await res.json();}catch{throw Error("Invalid server result");}
 if(body?.ok!==true||body?.signedIn!==true||body?.uid!==user.uid||
    body?.appCheckVerified!==true||body?.accountStatusVerified!==false||
    body?.scoreWrites!==false)throw Error("Attestation mismatch");
 return {verifiedByServer:true,accountStatusVerified:false,scoreWrites:false};
}
