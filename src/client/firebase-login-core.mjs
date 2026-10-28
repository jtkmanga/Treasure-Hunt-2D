// Pure client-side validation boundary. No network and no secrets.
// Do not use the Firebase web config as proof of identity.
export function validateFirebaseWebConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Firebase config not provided");
  const allowed = new Set(["apiKey","authDomain","projectId","appId","messagingSenderId"]);
  if (Object.keys(raw).some(k=>!allowed.has(k))) throw Error("Unexpected Firebase config field");
  const {apiKey,authDomain,projectId,appId,messagingSenderId}=raw;
  if (typeof projectId!=="string" || !/^[a-z][a-z0-9-]{3,62}$/.test(projectId) ||
      !/^AIza[A-Za-z0-9_-]{35}$/.test(apiKey||"") ||
      typeof authDomain!=="string" || authDomain!==projectId+".firebaseapp.com" ||
      typeof appId!=="string" || !/^1:[0-9]{5,20}:web:[A-Za-z0-9]+$/.test(appId) ||
      typeof messagingSenderId!=="string" || !/^[0-9]{5,20}$/.test(messagingSenderId)) {
    throw Error("Firebase config is incomplete or inconsistent");
  }
  if (!appId.startsWith("1:"+messagingSenderId+":web:")) throw Error("Firebase project mismatch");
  return {apiKey,authDomain,projectId,appId,messagingSenderId};
}

// Keep the offline game locked until backend verifies a signed Firebase token.
// Caller must explicitly configure a dedicated staging API; never infer it from 3D.
export function validateStagingApiOrigin(raw) {
  if (typeof raw!=="string" || raw.length>240) throw Error("Staging API has not been enabled");
  let u;try{u=new URL(raw);}catch{throw Error("Staging API has not been enabled");}
  if (u.protocol!=="https:" || u.pathname!=="/" || u.search || u.hash || u.username || u.password ||
      !/^treasure-hunt-2d-staging-api\.[a-z0-9-]+\.workers\.dev$/.test(u.hostname)) {
    throw Error("Unapproved staging API origin");
  }
  return u.origin;
}

export async function verifyFirebaseUserWithApi(user,apiOrigin,fetchImpl=fetch) {
  const origin=validateStagingApiOrigin(apiOrigin);
  if (!user || typeof user.uid!=="string" || !user.uid || typeof user.getIdToken!=="function") {
    throw Error("Google sign-in is required");
  }
  if (typeof fetchImpl!=="function") throw Error("Network unavailable");
  const token=await user.getIdToken();
  // Firebase ID JWT, never save/display/log it. Avoid sending to redirects.
  if (typeof token!=="string" || token.length<100 || token.length>8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw Error("Invalid Firebase ID token");
  }
  let response;
  try{
    response=await fetchImpl(origin+"/api/v1/me",{
      method:"GET", headers:{Authorization:"Bearer "+token, Accept:"application/json"},
      credentials:"omit",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000)
    });
  }catch{throw Error("Staging API not reachable");}
  if (!response || response.status!==200) throw Error("Server verification is unavailable");
  let result;try{result=await response.json();}catch{throw Error("Server sent invalid response");}
  if (result?.ok!==true || result?.signedIn!==true || result?.uid!==user.uid ||
      result?.scoreWrites!==false) throw Error("Server identity mismatch");
  return {verified:true,uid:result.uid,scoreWrites:false};
}

export function safeAuthError(error) {
  const code=typeof error?.code==="string"?error.code:"";
  if(code==="auth/popup-blocked")return "เบราว์เซอร์บล็อกหน้าต่าง Google โปรดอนุญาตป๊อปอัปหรือใช้ Chrome";
  if(code==="auth/popup-closed-by-user"||code==="auth/cancelled-popup-request")return "ยกเลิกการเข้าสู่ระบบ";
  if(code==="auth/unauthorized-domain")return "โดเมนเว็บไซต์ยังไม่ได้เพิ่มใน Firebase Authorized domains";
  if(code==="auth/operation-not-allowed")return "ยังไม่ได้เปิด Google Sign-in ใน Firebase";
  if(code==="auth/network-request-failed")return "เชื่อมต่อ Firebase ไม่สำเร็จ โปรดลองใหม่";
  return "Google Login ยังไม่พร้อมใช้งาน โปรดตรวจการตั้งค่า Firebase";
}

// Accept pasted Firebase WEB SDK config snippets without executing JavaScript.
// Supports the Firebase Console's const firebaseConfig = { apiKey: "...", ... } format.
// Optional storageBucket / measurementId are intentionally discarded.
export function parseWebConfigSnippet(source) {
  if (typeof source!=="string" || source.length>4096) throw Error("Invalid web SDK config text");
  const fields=["apiKey","authDomain","projectId","appId","messagingSenderId"];
  const config={};
  for(const key of fields){
    const pattern=new RegExp("(?:^|[,{\\s])['\\\"]?"+key+"['\\\"]?\\s*:\\s*(['\\\"])([^'\\\"\\r\\n]+)\\1","g");
    const matches=[...source.matchAll(pattern)];
    if(matches.length!==1)throw Error("Incomplete Firebase Web config");
    config[key]=matches[0][2];
  }
  return validateFirebaseWebConfig(config);
}
