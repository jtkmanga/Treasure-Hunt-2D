import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validatePublicSiteKey,getAppCheckOnce,appCheckHeader} from "../src/client/appcheck-prep.mjs";

const validKey="6L"+ "a".repeat(38);
const jwt="eyJhbGciOiJSUzI1NiJ9."+"a".repeat(120)+"."+"b".repeat(120);
test("public Enterprise site keys accepted but code, URL and secrets rejected",()=>{
 assert.equal(validatePublicSiteKey(" "+validKey+" "),validKey);
 for(const v of ["",null,"a".repeat(257),"AIza"+"b".repeat(35)+".", "https://example.com/sitekey", "<script>alert(1)</script>", "    "])
   assert.throws(()=>validatePublicSiteKey(v),/Invalid/);
});
test("app check token is only validated, never returned or logged",async()=>{
 let called=0,forced;
 const result=await getAppCheckOnce({name:"app"},async(app,refresh)=>{
  called++;assert.equal(app.name,"app");forced=refresh;return {token:jwt};
 });
 assert.deepEqual(result,{ok:true,verifiedByServer:false});
 assert.equal(called,1);
 assert.equal(forced,false);
 const h=appCheckHeader(jwt);
 assert.deepEqual(h,{"X-Firebase-AppCheck":jwt});
 assert.throws(()=>appCheckHeader("token"),/unavailable/);
});
test("requests fail closed when no SDK, token or valid app instance",async()=>{
 await assert.rejects(getAppCheckOnce(null,async()=>({token:jwt})));
 await assert.rejects(getAppCheckOnce({},undefined));
 await assert.rejects(getAppCheckOnce({},async()=>({token:"incomplete"})));
});
test("staging preview is user-triggered and does not turn on auto-refresh",()=>{
 const html=readFileSync(new URL("../login/index.html",import.meta.url),"utf8");
 const source=readFileSync(new URL("../login/login.mjs",import.meta.url),"utf8");
 assert.match(html,/id="site-key"/);
 assert.match(html,/id="test-appcheck"/);
 assert.match(html,/App Check — ทดสอบจากมือถือเท่านั้น/);
 assert.match(source,/ReCaptchaEnterpriseProvider/);
 assert.match(source,/isTokenAutoRefreshEnabled:false/);
 assert.match(source,/getAppCheckOnce\(appCheckInstance,appCheckSDK.getToken\)/);
 assert.match(source,/appcheckButton.addEventListener\("click"/);
 assert.doesNotMatch(source,/forceRefresh|setInterval|setTimeout|console\.log|localStorage/);
 assert.match(source,/ยังไม่ได้ตรวจโดย Staging Worker/);
});
