import {validateFirebaseWebConfig,verifyFirebaseUserWithApi,safeAuthError} from "../src/client/firebase-login-core.mjs";

const $=id=>document.getElementById(id);
const login=$("google-login"),verify=$("verify-api"),logout=$("google-logout");
const configStatus=$("config-status"),loginStatus=$("login-status");
// Set only AFTER verifying that the isolated API hostname is enabled and publicly testable.
// Never use the GPT-VOXEL-3D Worker URL here.
const STAGING_API_ORIGIN=null;
let firebaseAuth, authSDK, currentUser, busy=false;
function setStatus(target,message){target.textContent=message;}
function controls(){
  login.disabled=!firebaseAuth||busy||!!currentUser;
  logout.disabled=!firebaseAuth||busy||!currentUser;
  verify.disabled=!firebaseAuth||busy||!currentUser||!STAGING_API_ORIGIN;
}
async function bootstrap(){
  // Only fetch public Firebase web config from THIS app's origin.
  // firebase-config.json is intentionally not in Git (no 2D Firebase project yet).
  let response;
  try{response=await fetch("../firebase-config.json",{cache:"no-store",credentials:"same-origin",redirect:"error"});}
  catch{setStatus(configStatus,"ยังไม่ได้ตั้งค่า Firebase ของ Treasure Hunt 2D");return;}
  if(!response.ok){setStatus(configStatus,"ยังไม่ได้สร้างไฟล์ Firebase Web Config สำหรับเกมใหม่");return;}
  let cfg;
  try{cfg=validateFirebaseWebConfig(await response.json());}
  catch{setStatus(configStatus,"ค่า Firebase ไม่ครบหรือไม่ตรงกับโปรเจกต์ใหม่");return;}
  setStatus(configStatus,"กำลังโหลด Firebase SDK…");
  try{
    const [{initializeApp},sdk]=await Promise.all([
      import("https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js")
    ]);
    authSDK=sdk;
    firebaseAuth=sdk.getAuth(initializeApp(cfg,"treasure-hunt-2d-web"));
    // Only persist within the browser session, not indefinitely on the device.
    await sdk.setPersistence(firebaseAuth,sdk.browserSessionPersistence);
    sdk.onAuthStateChanged(firebaseAuth,user=>{
      currentUser=user||null;
      setStatus(loginStatus,user?"Google Login สำเร็จ (บน Firebase เท่านั้น) • ยังไม่ยืนยันกับเซิร์ฟเวอร์":"ยังไม่ได้เข้าสู่ระบบ");
      controls();
    },()=>{currentUser=null;setStatus(loginStatus,"ไม่สามารถตรวจสอบสถานะบัญชีได้");controls();});
    setStatus(configStatus,"โหลด Firebase สำหรับเกมใหม่สำเร็จ");
    controls();
  }catch{
    setStatus(configStatus,"โหลด Firebase SDK ไม่สำเร็จ โปรดตรวจอินเทอร์เน็ต/การตั้งค่า");
  }
}
login.addEventListener("click",async()=>{
  if(!firebaseAuth||busy)return;busy=true;controls();
  setStatus(loginStatus,"กำลังเปิด Google Login…");
  try{
    // Popup avoids 3rd-party redirect storage issues with a *.pages.dev origin.
    await authSDK.signInWithPopup(firebaseAuth,new authSDK.GoogleAuthProvider());
  }catch(error){setStatus(loginStatus,safeAuthError(error));}
  finally{busy=false;controls();}
});
verify.addEventListener("click",async()=>{
  if(!firebaseAuth||!currentUser||busy||!STAGING_API_ORIGIN)return;
  busy=true;controls();setStatus(loginStatus,"กำลังตรวจสอบกับ Staging API…");
  try{
    const result=await verifyFirebaseUserWithApi(currentUser,STAGING_API_ORIGIN);
    if(result.verified)setStatus(loginStatus,"บัญชีได้รับการยืนยันโดย Staging (ยังไม่เปิดคะแนนแข่งขัน)");
  }catch{setStatus(loginStatus,"ยังไม่สามารถยืนยันบัญชีกับ Staging API ได้");}
  finally{busy=false;controls();}
});
logout.addEventListener("click",async()=>{
  if(!firebaseAuth||busy)return;busy=true;controls();
  try{await authSDK.signOut(firebaseAuth);setStatus(loginStatus,"ออกจากระบบแล้ว");}
  catch{setStatus(loginStatus,"ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");}
  finally{busy=false;controls();}
});
controls();void bootstrap();
