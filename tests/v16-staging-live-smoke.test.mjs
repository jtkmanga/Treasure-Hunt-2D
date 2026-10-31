// Live HTTP health check. Safe: never authenticates, moves players, grants
// scores, or creates/changes game state. Uses only disabled staging endpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
const BASE='https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev';
test('isolated V16 staging Worker is alive with all gameplay gates disabled',async()=>{
 const health=await fetch(BASE+'/api/v16/health',{signal:AbortSignal.timeout(15000)});
 assert.equal(health.status,200);
 const data=await health.json();
 assert.equal(data.ok,true);
 assert.equal(data.phase,'staging-preview');
 assert.equal(data.map,'v16-forest-100');
 assert.equal(data.writesEnabled,false);
});
test('unauthenticated world reads and score writes stay closed',async()=>{
 const world=await fetch(BASE+'/api/v16/world?scope=free',{signal:AbortSignal.timeout(15000)});
 assert.equal(world.status,403);
 assert.match((await world.text()),/World reads not enabled/);
 const score=await fetch(BASE+'/api/v16/collect?scope=free',{
  method:'POST',headers:{'content-type':'application/json'},
  body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(score.status,403);
 assert.match((await score.text()),/Online writes not enabled/);
});
test('untrusted cross-origin requests are rejected',async()=>{
 const denied=await fetch(BASE+'/api/v16/health',{
  headers:{origin:'https://untrusted.example'},
  signal:AbortSignal.timeout(15000)});
 assert.equal(denied.status,403);
});

test('new beta deployment keeps join and VIP world disabled without credentials',async()=>{
 const join=await fetch(BASE+'/api/v16/join?scope=free',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({name:'No login'}),
  signal:AbortSignal.timeout(15000),
 });
 assert.equal(join.status,403);
 const vip=await fetch(BASE+'/api/v16/world?scope=vip',{
  signal:AbortSignal.timeout(15000),
 });
 assert.equal(vip.status,403);
});
test('staging health never reveals Firebase configuration or beta invitations',async()=>{
 const res=await fetch(BASE+'/api/v16/health',{signal:AbortSignal.timeout(15000)});
 assert.equal(res.status,200);
 const body=await res.text();
 for(const term of ['FIREBASE_WEB_API_KEY','V16_BETA_UIDS','SECRET','firebase-appcheck','google.com'])
  assert.equal(body.includes(term),false);
});

test('beta login mobile page is actually served from deployed Worker',async()=>{
 const page=await fetch(BASE+'/beta-login',{signal:AbortSignal.timeout(15000)});
 assert.equal(page.status,200);
 assert.match(page.headers.get('content-type'),/text\/html/i);
 assert.equal(page.headers.get('x-frame-options'),'DENY');
 assert.equal(page.headers.get('referrer-policy'),'strict-origin-when-cross-origin');
 assert.equal(page.headers.get('cross-origin-opener-policy'),null);
 const html=await page.text();
 for(const part of ['Treasure Hunt 2D','Firebase Web API Key','reCAPTCHA Enterprise Site Key',
 'เข้าสู่ระบบด้วย Google','/api/v16/auth-check','www.gstatic.com/firebasejs/',
 'id="googleHint"','id="redirect"','getRedirectResult','signInWithRedirect',
 'Google Login ไม่สำเร็จ','auth/popup-blocked','checkFirebaseProject(apiKey)',
 'identitytoolkit.googleapis.com/v1/projects?key=',
 'strict-origin-when-cross-origin','API ไม่ส่ง projectId','preflight.confirmed',
 'เซิร์ฟเวอร์จะปฏิเสธโทเค็น','projectId==="439998873632"',
 'Project Number 439998873632','id="providerState"',
 'identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=',
 'REDIRECT_PENDING_KEY','if(redirectPending)'])assert.ok(html.includes(part),part);
 assert.equal(html.includes('Web API Key ชี้ไป Firebase โปรเจกต์อื่น ไม่ใช่ treasure-hunt-2d'),false);
 assert.ok(html.length>5000);
 assert.ok(!html.includes('V16_BETA_UIDS'));
 assert.ok(!html.includes('FIREBASE_WEB_API_KEY'));
});
test('real auth check route requires Google login despite gameplay flags being off',async()=>{
 const unauth=await fetch(BASE+'/api/v16/auth-check?scope=free',{signal:AbortSignal.timeout(15000)});
 assert.equal(unauth.status,401);
 const body=await unauth.json();
 assert.match(body.error,/Google sign-in required/);
 const wrongOrigin=await fetch(BASE+'/api/v16/auth-check?scope=free',{
  headers:{origin:'https://untrusted.example'},signal:AbortSignal.timeout(15000)});
 assert.equal(wrongOrigin.status,403);
 const method=await fetch(BASE+'/api/v16/auth-check',{
  method:'POST',headers:{'content-type':'application/json'},
  body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(method.status,405);
});
