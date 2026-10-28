import {validateFirebaseWebConfig,parseWebConfigSnippet,verifyFirebaseUserWithApi,safeAuthError} from "../src/client/firebase-login-core.mjs";
import {validatePublicSiteKey,getAppCheckOnce,verifyAppCheckOnServer,explainAppCheckFailure} from "../src/client/appcheck-prep.mjs";

const $=id=>document.getElementById(id);
const login=$("google-login"),verify=$("verify-api"),logout=$("google-logout");
const configStatus=$("config-status"),loginStatus=$("login-status"),setup=$("setup-panel"),input=$("config-input"),apply=$("apply-config");
const siteKeyInput=$("site-key"),appcheckStatus=$("appcheck-status"),appcheckButton=$("test-appcheck"),serverCheck=$("verify-appcheck-server");
// Set only AFTER verifying that the isolated API hostname is enabled and publicly testable.
// Never use the GPT-VOXEL-3D Worker URL here.
const STAGING_API_ORIGIN="https://treasure-hunt-2d-staging-api.hjinffv5426.workers.dev";
let firebaseAuth, authSDK, currentUser, busy=false;
let appCheckInstance=null, appCheckSDK=null;
function setStatus(target,message){target.textContent=message;}
function controls(){
  login.disabled=!firebaseAuth||busy||!!currentUser;
  logout.disabled=!firebaseAuth||busy||!currentUser;
  verify.disabled=!firebaseAuth||busy||!currentUser||!STAGING_API_ORIGIN;
  appcheckButton.disabled=!firebaseAuth||busy||!currentUser||!appCheckInstance;
  serverCheck.disabled=!firebaseAuth||busy||!currentUser||!appCheckInstance;
}

async function initializeWithConfig(cfg) {
  if(firebaseAuth||busy)return;
  if(cfg.projectId!=="treasure-hunt-2d" || cfg.messagingSenderId!=="439998873632")
    throw Error("This web app is not the independent Treasure Hunt 2D project");
  busy=true;apply.disabled=true;controls();
  setStatus(configStatus,"กำลังโหลด Firebase SDK ของเกมใหม่…");
  try{
    const [{initializeApp},sdk]=await Promise.all([
      import("https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js")
    ]);
    authSDK=sdk;
    const app=initializeApp(cfg,"treasure-hunt-2d-web");
    // Initialize optional App Check BEFORE Firebase Auth. The refresh loop stays OFF.
    // No site key means Google Login can still be tested as before.
    const keyText=siteKeyInput.value.trim();
    if(keyText){
      try {
        const key=validatePublicSiteKey(keyText);
        appCheckSDK=await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js");
        appCheckInstance=appCheckSDK.initializeAppCheck(app,{
          provider:new appCheckSDK.ReCaptchaEnterpriseProvider(key),
          isTokenAutoRefreshEnabled:false
        });
        setStatus(appcheckStatus,"App Check พร้อมทดสอบ • ยังไม่ได้ขอ Token");
      } catch {
        appCheckInstance=null;appCheckSDK=null;
        setStatus(appcheckStatus,"Site Key หรือ App Check SDK ใช้งานไม่ได้ • Google Login ยังทดสอบได้");
      }
    }
    siteKeyInput.value="";
    firebaseAuth=sdk.getAuth(app);
    await sdk.setPersistence(firebaseAuth,sdk.browserSessionPersistence);
    sdk.onAuthStateChanged(firebaseAuth,user=>{
      currentUser=user||null;
      setStatus(loginStatus,user?"Google Login สำเร็จ (Firebase) • ยังไม่ยืนยันกับเซิร์ฟเวอร์":"ยังไม่ได้เข้าสู่ระบบ");
      controls();
    },()=>{currentUser=null;setStatus(loginStatus,"ตรวจสถานะบัญชีไม่สำเร็จ");controls();});
    input.value=""; // Clear the public web config text after initialization.
    setup.hidden=true;
    setStatus(configStatus,"Firebase Web App เชื่อมต่อแล้ว • พร้อมทดสอบ Google Login");
  }catch{
    firebaseAuth=null;authSDK=null;
    setStatus(configStatus,"โหลด Firebase SDK ไม่สำเร็จ โปรดตรวจอินเทอร์เน็ตและการตั้งค่า");
  }finally{busy=false;apply.disabled=!!firebaseAuth;controls();}
}
async function bootstrap(){
  // Optional same-origin config file. If absent, use manual web config pasted into memory.
  try{
    const response=await fetch("../firebase-config.json",{cache:"no-store",credentials:"same-origin",redirect:"error"});
    if(response.ok){
      const cfg=validateFirebaseWebConfig(await response.json());
      await initializeWithConfig(cfg);
      return;
    }
  }catch{}
  setStatus(configStatus,"ตั้งค่า Firebase ที่สร้างแล้วได้โดยวาง Web SDK Config ด้านล่าง");
}
apply.addEventListener("click",async()=>{
  if(firebaseAuth||busy)return;
  let cfg;
  try{cfg=parseWebConfigSnippet(input.value);}
  catch{setStatus(configStatus,"ข้อมูล Web SDK Config ไม่ครบหรือรูปแบบไม่ถูกต้อง");return;}
  try{await initializeWithConfig(cfg);}
  catch{setStatus(configStatus,"Firebase Project ไม่ตรงกับ Treasure Hunt 2D");}
});

appcheckButton.addEventListener("click",async()=>{
  if(!currentUser||busy||!appCheckInstance||!appCheckSDK)return;
  busy=true;controls();
  setStatus(appcheckStatus,"กำลังทดสอบ App Check บนมือถือ…");
  try{
    // Explicit user gesture only. Never force-refresh or send raw tokens to the page.
    const result=await getAppCheckOnce(appCheckInstance,appCheckSDK.getToken);
    if(result.ok)setStatus(appcheckStatus,"App Check Token ได้รับสำเร็จบนมือถือ • ยังไม่ได้ตรวจโดย Staging Worker");
  }catch{
    setStatus(appcheckStatus,"App Check ไม่ผ่าน กรุณาตรวจ Site Key/โดเมนและโควตาฟรี");
  }finally{busy=false;controls();}
});
serverCheck.addEventListener("click",async()=>{
 if(!currentUser||busy||!appCheckInstance||!appCheckSDK)return;
 busy=true;controls();
 setStatus(appcheckStatus,"กำลังให้ Cloudflare ตรวจ App Check…");
 try {
  const result=await verifyAppCheckOnServer({
   instance:appCheckInstance,getToken:appCheckSDK.getToken,user:currentUser,
   apiOrigin:STAGING_API_ORIGIN
  });
  if(result.verifiedByServer)
   setStatus(appcheckStatus,"App Check ผ่านการตรวจลายเซ็นโดย Cloudflare Staging • ยังไม่ตรวจบัญชีถูกเพิกถอน");
 }catch (error) {
  setStatus(appcheckStatus,explainAppCheckFailure(error));
 }finally{busy=false;controls();}
});
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
    if(result.verified)setStatus(loginStatus,"Google ID Token ได้รับการยืนยันโดย Staging • App Check ยังไม่ได้ตรวจฝั่งเซิร์ฟเวอร์");
  }catch{setStatus(loginStatus,"ยังไม่สามารถยืนยันบัญชีกับ Staging API ได้");}
  finally{busy=false;controls();}
});
logout.addEventListener("click",async()=>{
  if(!firebaseAuth||busy)return;busy=true;controls();
  try{await authSDK.signOut(firebaseAuth);setStatus(loginStatus,"ออกจากระบบแล้ว");setStatus(appcheckStatus,"ออกจากระบบแล้ว");}
  catch{setStatus(loginStatus,"ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");}
  finally{busy=false;controls();}
});
controls();void bootstrap();
