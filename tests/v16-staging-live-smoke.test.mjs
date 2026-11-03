// Live HTTP health check. Safe: never authenticates, moves players, grants
// scores, or changes game state. Reads can be enabled but all writes stay OFF.
import test from 'node:test';
import assert from 'node:assert/strict';
const BASE='https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev';
test('isolated V16 staging Worker is alive with reads only and no score writes',async()=>{
 const health=await fetch(BASE+'/api/v16/health',{signal:AbortSignal.timeout(15000)});
 assert.equal(health.status,200);
 const data=await health.json();
 assert.equal(data.ok,true);
 assert.equal(data.phase,'staging-preview');
 assert.equal(data.map,'v16-forest-100');
 assert.equal(data.writesEnabled,false);
 assert.equal(data.readsEnabled,true);
 assert.equal(data.pilotEnabled,true);
 assert.equal(data.gamePreviewEnabled,true);
 const liveDo=await fetch(BASE+'/api/v16/preview/protocol',{signal:AbortSignal.timeout(15000)});
 assert.equal(liveDo.status,200,'staging Durable Object must have adopted same code as Worker');
 const protocol=await liveDo.json();
 assert.equal(protocol.movementProtocol,'Sync V16.26');
 assert.equal(protocol.durableObjectCode,'v16-preview-batched-input-v2');
 assert.equal(protocol.freeSeasonPreview,'free-season-v1','live DO must have adopted season code');
 assert.equal(protocol.scoreAudit,'private-audit-v1','running DO must have private score audit build');
 assert.equal(protocol.fullJournal,'sqlite-awards-v1','Durable Object code must support full score journal');
 assert.equal(protocol.journalIntegrity,'read-only-v1','DO must serve integrity verifier code');
 assert.equal(protocol.adminEnrollment,'pinned-google-uid-v1','running DO contains secure role logic');
 assert.equal(protocol.isolatedRecoveryDrill,'synthetic-pitr-v1','running DO must have synthetic PITR gate');
 assert.equal(protocol.pitrApiAvailable,true,'live SQLite-backed DO must provide non-destructive recovery bookmark API');
 assert.equal(protocol.durableJournalSupported,true,'live DO must expose SQLite transaction + synchronous KV support');
 assert.equal(data.movementProtocol,'Sync V16.26','live staging must serve movement fix');
 assert.equal(data.freeSeasonPreview,'free-season-v1','live Worker must expose new season build');
 assert.equal(data.scoreAudit,'private-audit-v1','running Worker must have private score audit build');
 assert.equal(data.fullJournal,'sqlite-awards-v1','Worker must expose full score journal version');
 assert.equal(data.journalIntegrity,'read-only-v1','Worker must expose private consistency verifier');
 assert.equal(data.adminEnrollment,'pinned-google-uid-v1','Worker is enrolled admin-aware');
 assert.equal(data.isolatedRecoveryDrill,'synthetic-pitr-v1','Worker must have guarded PITR code');
 assert.equal(health.headers.get('cache-control'),'no-store');
});
test('anonymous world reads are denied and score writes stay closed',async()=>{
 const world=await fetch(BASE+'/api/v16/world?scope=free',{signal:AbortSignal.timeout(15000)});
 assert.equal(world.status,401);
 assert.match((await world.text()),/Google sign-in required/);
 const score=await fetch(BASE+'/api/v16/collect?scope=free',{
  method:'POST',headers:{'content-type':'application/json'},
  body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(score.status,403);
 assert.match((await score.text()),/Online writes not enabled/);
});
test('Staging enrollment is locked while authenticated pinned-admin status can still work',async()=>{
 const status=await fetch(BASE+'/api/v16/admin/status?scope=free',{signal:AbortSignal.timeout(15000)});
 assert.equal(status.status,401,'admin status requires Google token and App Check');
 assert.match(await status.text(),/Google sign-in required/);
 const enroll=await fetch(BASE+'/api/v16/admin/enroll?scope=free',{
  method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)
 });
 assert.equal(enroll.status,403,'all additional enrollment attempts are blocked');
 assert.match(await enroll.text(),/Admin enrollment unavailable/);
 const wrongMethod=await fetch(BASE+'/api/v16/admin/enroll?scope=free',{signal:AbortSignal.timeout(15000)});
 assert.equal(wrongMethod.status,403,'disabled registration is closed regardless of method');
});
test('private journal and score audit are unavailable without authenticated administrator',async()=>{
 const base=BASE+'/api/v16/admin/audit?scope=free&room=preview';
 for(const url of [base,BASE+'/api/v16/admin/audit?scope=free&room=free',
  base+'&beforeId=1']){
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,401,'no public UID, score ledger or PITR bookmark');
  assert.match(await response.text(),/Google sign-in required/);
 }
 const editAttempt=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},
  body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(editAttempt.status,405,'Admin audit API remains strictly read-only');
});
test('synthetic restore is never accessible through an anonymous or unpinned request',async()=>{
 const legacy=await fetch(BASE+'/api/v16/recovery-drill?scope=free',{
  signal:AbortSignal.timeout(15000)});
 assert.equal(legacy.status,404,'public restore endpoint must not exist');
 const action=await fetch(BASE+'/api/v16/admin/pitr-drill?scope=free',{
  method:'POST',signal:AbortSignal.timeout(15000)});
 assert.ok([401,403].includes(action.status),
  'disabled action is 403, temporarily enabled action requires Google and App Check');
 assert.ok(!(await action.text()).includes('bookmark'),'no bookmark information can be disclosed');
 const other=await fetch(BASE+'/api/v16/admin/pitr-drill?scope=free',{signal:AbortSignal.timeout(15000)});
 assert.ok([403,405].includes(other.status),'PITR is POST-only for authorized users');
});
test('anonymous coin race is denied while real Free writes stay disabled',async()=>{
 const [read,join,collect]=await Promise.all([
  fetch(BASE+'/api/v16/pilot/world?scope=free',{signal:AbortSignal.timeout(15000)}),
  fetch(BASE+'/api/v16/pilot/join?scope=free',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)}),
  fetch(BASE+'/api/v16/pilot/collect?scope=free',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)})
 ]);
 for(const res of [read,join,collect]){
  assert.equal(res.status,401);
  assert.match((await res.text()),/Google sign-in required/);
 }
 const vip=await fetch(BASE+'/api/v16/pilot/world?scope=vip',{signal:AbortSignal.timeout(15000)});
 assert.equal(vip.status,403);
 const invalid=await fetch(BASE+'/api/v16/pilot/move?scope=free',{method:'POST',body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(invalid.status,404);
});
test('mobile Staging origin reaches authentication instead of Origin denied',async()=>{
 const origin=BASE;
 const post=await fetch(BASE+'/api/v16/pilot/join?scope=free',{
  method:'POST',
  headers:{origin,'content-type':'application/json'},
  body:JSON.stringify({name:'UnauthenticatedProbe'}),
  signal:AbortSignal.timeout(15000)
 });
 assert.equal(post.status,401);
 assert.match((await post.text()),/Google sign-in required/);
 assert.equal(post.headers.get('access-control-allow-origin'),origin);
 const preflight=await fetch(BASE+'/api/v16/pilot/join?scope=free',{
  method:'OPTIONS',
  headers:{origin,'access-control-request-method':'POST',
   'access-control-request-headers':'authorization,x-firebase-appcheck,content-type'},
  signal:AbortSignal.timeout(15000)
 });
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
 const attack=await fetch(BASE+'/api/v16/pilot/join?scope=free',{
  method:'POST',headers:{origin:origin+'.attacker.example','content-type':'application/json'},
  body:'{}',signal:AbortSignal.timeout(15000)
 });
 assert.equal(attack.status,403);
 assert.match((await attack.text()),/Origin denied/);
});
test('Staging playable forest is iframe-only HTML and anonymous preview API denied',async()=>{
 const game=await fetch(BASE+'/beta-game',{signal:AbortSignal.timeout(15000)});
 assert.equal(game.status,200);
 assert.ok(game.headers.get('content-type')?.includes('text/html'));
 assert.equal(game.headers.get('x-frame-options'),'SAMEORIGIN');
 assert.match(game.headers.get('content-security-policy'),/frame-ancestors 'self'/);
 assert.match(game.headers.get('content-security-policy'),/connect-src 'none'/);
 const html=await game.text();
 for(const part of ['id="world"','id="joystick"','id="collect"','id="camera-zoom-slider"',
  'previewRequest("move",{seq,nonce:previewMoveNonce,frames:sent.map(f=>[f.dx,f.dy])})','previewRequest("collect",previewPendingClaim)',
  'frame=[dx,dy,0]','src="/beta-game"'])
  if(part==='src="/beta-game"')assert.ok(!html.includes(part));
  else assert.ok(html.includes(part),part);
 assert.ok(html.includes('window.addEventListener("blur",()=>{clearControls();})'), 'inactive Android window must not pause');
 assert.ok(html.includes('previewPlanCorrection(r.result,clientAtSend)'), 'staging uses delayed reply compensation');
 assert.ok(html.includes('Sync V16.26'),'real beta page must identify current build');
 assert.ok(html.includes('previewApplyCorrection()'), 'staging applies bounded motion correction');
 assert.ok(!html.includes('if(dist>.65){session.player.x=position.x'), 'staging must not teleport on delayed acknowledgment');
 for(const path of ['world','join','move','collect']){
  const post=path!=='world';
  const res=await fetch(BASE+'/api/v16/preview/'+path+'?scope=free',{
   method:post?'POST':'GET',
   headers:{...(post?{'content-type':'application/json'}:{})},
   ...(post?{body:'{}'}:{}),signal:AbortSignal.timeout(15000)
  });
  assert.equal(res.status,401);
  assert.match((await res.text()),/Google sign-in required/);
 }
 const blocked=await fetch(BASE+'/api/v16/join?scope=free',{
  method:'POST',headers:{'content-type':'application/json'},body:'{}',
  signal:AbortSignal.timeout(15000)
 });
 assert.equal(blocked.status,403);
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
 assert.equal(vip.status,401);
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
 assert.match(page.headers.get('content-security-policy'),/script-src[^;]*https:\/\/accounts\.google\.com/);
 assert.match(page.headers.get('content-security-policy'),/style-src[^;]*https:\/\/accounts\.google\.com/);
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
 'REDIRECT_PENDING_KEY','if(redirectPending)',
 'id="gisButton"','id="googleClientId"','https://accounts.google.com/gsi/client',
 'globalThis.google.accounts.id.renderButton',
 'signInWithCredential(auth,GoogleAuthProvider.credential(response.credential))',
 'Authorized JavaScript origin','id="worldPanel"','id="worldRead"',
 'api/v16/world?scope=free','describeWorld(world)','เหรียญพร้อมเก็บ:',
 'id="worldFingerprint"','function comparableWorld(world)',
 'crypto.subtle.digest("SHA-256",bytes)','await showWorldFingerprint(world)',
 'await showWorldFingerprint(lastWorldSnapshot)',
 'id="coinPilotPanel"','id="pilotJoin"','id="pilotCollect"','id="pilotReplay"','id="pilotWorld"',
 '/api/v16/pilot/','pilotPendingClaim=null;pilotClaimSeq++',
 'pilotRequest("collect",pilotLastAck.claim)','หลังครบ 60 วินาที','รีเฟรชหน้า',
 'details.includes("Player not joined")','เซิร์ฟเวอร์ห้องทดลองเริ่มทำงานใหม่',
 'id="gamePreviewPanel"','id="previewOpen"','id="previewOverlay"','id="previewFrame"',
 'th2d-preview-request','/api/v16/preview/','frame.src="/beta-game"'])assert.ok(html.includes(part),part);
 assert.equal(html.includes('Web API Key ชี้ไป Firebase โปรเจกต์อื่น ไม่ใช่ treasure-hunt-2d'),false);
 assert.ok(html.includes('function validPreviewMovementBatch(body)'),'deployed iframe bridge must validate batch protocol');
 assert.ok(html.includes('if(!validPreviewMovementBatch(body))'),'deployed iframe bridge must accept new batch form');
 assert.ok(!html.includes('Invalid movement axes'),'stale dx/dy validation must never ship');
 assert.ok(html.includes('id="adminAuditPanel" hidden'), 'admin section hidden until verified');
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
