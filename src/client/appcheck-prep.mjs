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
 }catch{throw Error("NETWORK_OR_CORS");}
 if(res?.status!==200){
   let body=null;
   try{body=await res.json();}catch{}
   const codes=new Set(["APP_CHECK_MISSING_OR_INVALID","APP_CHECK_REJECTED",
     "APP_CHECK_KEYS_UNAVAILABLE","APP_CHECK_NOT_CONFIGURED","GOOGLE_RESPONSE_INVALID"]);
   const code=codes.has(body?.code)?body.code:"HTTP_"+(Number.isInteger(res?.status)?res.status:"UNKNOWN");
   throw Error(code);
 }
 let body;try{body=await res.json();}catch{throw Error("INVALID_RESPONSE");}
 if(body?.ok!==true||body?.signedIn!==true||body?.uid!==user.uid||
    body?.appCheckVerified!==true||body?.accountStatusVerified!==false||
    body?.scoreWrites!==false)throw Error("Attestation mismatch");
 return {verifiedByServer:true,accountStatusVerified:false,scoreWrites:false};
}

// Present only fixed non-sensitive statuses; never display JWTs or raw server JSON.
export function explainAppCheckFailure(err){
 const code=err?.message||"";
 if(code==="APP_CHECK_MISSING_OR_INVALID")return "ไม่พบ App Check Token ที่ใช้ได้ (HTTP 401)";
 if(code==="APP_CHECK_REJECTED")return "Cloudflare ปฏิเสธลายเซ็นหรือข้อมูล App Check (HTTP 401)";
 if(code==="APP_CHECK_KEYS_UNAVAILABLE")return "Cloudflare ติดต่อ Firebase JWKS ไม่สำเร็จ (HTTP 503)";
 if(code==="APP_CHECK_NOT_CONFIGURED")return "Cloudflare ยังไม่ตั้งค่า App Check ครบ (HTTP 503)";
 if(code==="GOOGLE_RESPONSE_INVALID")return "ผลการตรวจ Google Login ฝั่ง Cloudflare ไม่ถูกต้อง (HTTP 503)";
 if(code==="HTTP_401")return "Google ID Token ไม่ผ่านการตรวจ (HTTP 401)";
 if(code==="HTTP_403")return "Origin ไม่ได้รับอนุญาต (HTTP 403)";
 if(code==="HTTP_429")return "ติด Rate Limit ให้หยุดทดสอบชั่วคราว (HTTP 429)";
 if(code==="HTTP_503")return "Cloudflare หรือ Firebase ยังไม่พร้อม (HTTP 503)";
 if(code==="HTTP_500")return "Cloudflare ทำงานผิดพลาด (HTTP 500)";
 if(code==="NETWORK_OR_CORS")return "เชื่อมต่อไม่ได้ อาจเกิดจาก CORS หรือเครือข่าย";
 return "การตรวจ App Check ยังไม่ผ่าน ("+
   (/^HTTP_[0-9]{3}$/.test(code)?code:"ไม่ทราบรหัส")+")";
}

/**
 * One explicit active-account check AFTER Google ID and App Check verification.
 * Keep tokens only in HTTPS headers; never print, cache, save or display credentials.
 */
export async function verifyActiveAccountOnServer({instance,getToken,user,apiOrigin,fetchImpl=fetch}) {
 if(!instance||typeof getToken!=="function"||!user?.uid||
    typeof user.getIdToken!=="function")throw Error("Sign in and initialize App Check first");
 if(apiOrigin!=="https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev")
    throw Error("Unapproved verification server");
 const app=await getToken(instance,false);
 const headers=appCheckHeader(app?.token);
 const idToken=await user.getIdToken();
 if(typeof idToken!=="string"||idToken.length<100||idToken.length>8192||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken))
   throw Error("Invalid Google identity token");
 let response;
 try{
  response=await fetchImpl(apiOrigin+"/api/v1/account-status",{
   method:"GET",headers:{...headers,Authorization:"Bearer "+idToken,Accept:"application/json"},
   credentials:"omit",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)
  });
 }catch{throw Error("NETWORK_OR_CORS");}
 if(response?.status!==200){
   let payload;try{payload=await response.json();}catch{}
   const codes=new Set(["ACCOUNT_LOOKUP_NOT_CONFIGURED","ACCOUNT_IDENTITY_INVALID",
    "ACCOUNT_NOT_ACTIVE_OR_REVOKED","ACCOUNT_LOOKUP_UNAVAILABLE","VERIFY_RESULT_INVALID"]);
   throw Error(codes.has(payload?.code)?payload.code:
    "HTTP_"+(Number.isInteger(response?.status)?response.status:"UNKNOWN"));
 }
 let body;try{body=await response.json();}catch{throw Error("INVALID_RESPONSE");}
 if(body?.ok!==true||body?.signedIn!==true||body?.uid!==user.uid||
   body?.appCheckVerified!==true||body?.accountStatusVerified!==true||
   body?.scoreWrites!==false)throw Error("ACCOUNT_RESPONSE_INVALID");
 return {accountStatusVerified:true,appCheckVerified:true,scoreWrites:false};
}
export function explainAccountStatusError(error) {
 const code=error?.message;
 if(code==="ACCOUNT_LOOKUP_NOT_CONFIGURED")return "ยังไม่ได้ตั้งค่า Firebase Web API Key บน Staging (HTTP 503)";
 if(code==="ACCOUNT_IDENTITY_INVALID")return "Google ID Token หรือบัญชีไม่ตรงกัน (HTTP 401)";
 if(code==="ACCOUNT_NOT_ACTIVE_OR_REVOKED")return "บัญชีถูกระงับหรือ Token ถูกเพิกถอน (HTTP 401)";
 if(code==="ACCOUNT_LOOKUP_UNAVAILABLE")return "Firebase Identity Toolkit ไม่พร้อม (HTTP 503)";
 if(code==="VERIFY_RESULT_INVALID"||code==="ACCOUNT_RESPONSE_INVALID")return "ผลการตรวจสอบบัญชีไม่ถูกต้อง";
 return explainAppCheckFailure(error);
}
