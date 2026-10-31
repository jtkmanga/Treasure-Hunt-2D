import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BETA_LOGIN_PAGE} from '../src/v16-online/beta-login-page.mjs';

function scripts(html){
 const matches=[...html.matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(matches.length,1,'One inline Firebase app module');
 return matches[0][1];
}
test('diagnostic page shows Google popup failure next to the button, not below fold',()=>{
 const html=BETA_LOGIN_PAGE;
 assert.match(html,/id="googleHint"[^>]*aria-live="polite"/);
 assert.match(html,/id="googleState"[^>]*role="status"/);
 assert.match(html,/id="setupHint"/);
 assert.match(html,/auth\/popup-blocked/);
 assert.match(html,/auth\/popup-closed-by-user/);
 assert.match(html,/Google Login ไม่สำเร็จ/);
 assert.match(html,/id="redirect"/);
 assert.match(html,/getRedirectResult/);
 assert.match(html,/signInWithRedirect/);
});
test('mobile fallback only uses public client keys stored within browser session',()=>{
 const js=scripts(BETA_LOGIN_PAGE);
 assert.match(js,/sessionStorage\.setItem\(SESSION_KEY/);
 assert.match(js,/sessionStorage\.getItem\(SESSION_KEY/);
 assert.match(js,/el\("apiKey"\)\.value=""/);
 assert.match(js,/el\("siteKey"\)\.value=""/);
 assert.doesNotMatch(js,/localStorage/);
 assert.doesNotMatch(js,/\?apiKey=|\?siteKey=|\?uid=|\?token=/);
 assert.match(js,/signInWithPopup\(auth,new GoogleAuthProvider\(\)\)/);
 assert.match(js,/signInWithRedirect\(auth,new GoogleAuthProvider\(\)\)/);
 assert.match(js,/getRedirectResult\(auth\)/);
});
test('Firebase diagnostic JavaScript parses after removing pinned ESM imports',()=>{
 const script=scripts(BETA_LOGIN_PAGE);
 // vm.Script validates JS syntax; imports remain loaded as real Firebase SDK
 // in the browser so Node does not attempt any OAuth login.
 const withoutImports=script.replace(/^import\s+.+?;\s*$/gm,'');
 assert.doesNotMatch(withoutImports,/^\s*import\s/m);
 assert.doesNotThrow(()=>new vm.Script(withoutImports));
});
