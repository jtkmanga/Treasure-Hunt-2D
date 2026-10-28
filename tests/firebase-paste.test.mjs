import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseWebConfigSnippet} from "../src/client/firebase-login-core.mjs";
const config={
  apiKey:"AIza"+"x".repeat(35),
  authDomain:"treasure-hunt-2d.firebaseapp.com",
  projectId:"treasure-hunt-2d",
  messagingSenderId:"439998873632",
  appId:"1:439998873632:web:4b694f8159d9d9e0163c45"
};
test("parse pasted Firebase Console JavaScript as inert text",()=>{
  const snippet='const firebaseConfig = {\\n'+Object.entries(config).map(([k,v])=>k+': "'+v+'"').join(",\\n")
    +',\\nstorageBucket: "ignored.appspot.com", measurementId: "G-IGNORED"\\n};';
  assert.deepEqual(parseWebConfigSnippet(snippet),config);
  assert.deepEqual(parseWebConfigSnippet(JSON.stringify(config)),config);
});
test("pasted config never evaluates JavaScript or executes injected statements",()=>{
  delete globalThis.__testInjected;
  const s='const firebaseConfig = {apiKey: "AIza'+"x".repeat(35)+'", authDomain: "treasure-hunt-2d.firebaseapp.com", projectId: "treasure-hunt-2d", messagingSenderId: "439998873632", appId: "1:439998873632:web:abcd"}; globalThis.__testInjected = true;';
  assert.equal(parseWebConfigSnippet(s).projectId,"treasure-hunt-2d");
  assert.equal(globalThis.__testInjected,undefined);
});
test("missing keys / duplicate keys / overlarge input are rejected",()=>{
  assert.throws(()=>parseWebConfigSnippet("const firebaseConfig = { projectId:'treasure-hunt-2d' }"));
  assert.throws(()=>parseWebConfigSnippet(JSON.stringify(config).replace('"projectId":"treasure-hunt-2d"','"projectId":"treasure-hunt-2d","projectId":"wrong"')));
  assert.throws(()=>parseWebConfigSnippet("X".repeat(5000)));
});
test("login preview offers manual mobile setup but does not send tokens automatically",()=>{
  const html=readFileSync(new URL("../login/index.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../login/login.mjs",import.meta.url),"utf8");
  assert.match(html,/id="config-input"/);
  assert.match(js,/parseWebConfigSnippet/);
  assert.match(js,/cfg.projectId!=="treasure-hunt-2d"/);
  assert.match(js,/STAGING_API_ORIGIN=null/);
  assert.match(js,/browserSessionPersistence/);
  assert.doesNotMatch(js,/eval\(|localStorage|console\.log/);
});
