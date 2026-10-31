import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {V16WorldRoom,handleV16Request} from '../src/v16-online/worker.mjs';
import {GAME_PREVIEW_PAGE} from '../src/v16-online/game-preview-page.mjs';
import {BETA_LOGIN_PAGE} from '../src/v16-online/beta-login-page.mjs';

const BASE='https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev';
const token='A'.repeat(130);
function rig(){
 const instances=new Map(),states=new Map(),init=[];
 const env={ENABLE_V16_GAME_PREVIEW:'true',
  ENABLE_V16_PILOT_WRITES:'true',ENABLE_V16_READS:'true',ENABLE_V16_WRITES:'false',
  ALLOWED_ORIGIN:'https://treasure-hunt-2d-jtk.pages.dev',
  FIREBASE_PROJECT_ID:'treasure-hunt-2d',
  FIREBASE_PROJECT_NUMBER:'439998873632',
  FIREBASE_APP_ID:'1:439998873632:web:4b694f8159d9d9e0163c45',
  V16_BETA_UIDS:'alice,bob',
  ACCOUNT_STATUS:{async fetch(_,options){
   const {uid}=JSON.parse(options.body);return Response.json({uid,disabled:false,revoked:false});
  }},
  V16_RATE_LIMITER:{async limit(){return {success:true}}},
  ROOMS:{
   idFromName(name){return name},
   get(name){
    if(!instances.has(name)){
     if(!states.has(name))states.set(name,new Map());
     const store=states.get(name);
     const obj=new V16WorldRoom({
      storage:{async get(k){return store.get(k)},async put(k,v){store.set(k,structuredClone(v))}},
      blockConcurrencyWhile(fn){init.push(fn());}
     },{});
     instances.set(name,obj);
    }
    return instances.get(name);
   }
  }
 };
 const tests={
  verifyId:async t=>({uid:t.startsWith('A')?'alice':'bob',
   provider:'google.com',emailVerified:true,authTime:1760000000}),
  verifyApp:async()=>({appId:env.FIREBASE_APP_ID})
 };
 async function call(actor,route,body=null){
  const request=new Request(BASE+'/api/v16/'+route+'?scope=free',{
   method:body===null?'GET':'POST',
   headers:{origin:BASE,'authorization':'Bearer '+actor.repeat(130),
    'x-firebase-appcheck':'valid-app-check',
    ...(body===null?{}:{'content-type':'application/json'})},
   ...(body===null?{}:{body:JSON.stringify(body)})
  });
  const response=await handleV16Request(request,env,tests);
  return {status:response.status,result:await response.json()};
 }
 return {call,instances,states,env,init};
}

test('online forest preview is a separate Durable Object from ordinary Free world and coin race',async()=>{
 const t=rig();
 const read=await t.call('A','world');
 assert.equal(read.status,200);
 const coinPilot=await t.call('A','pilot/join',{name:'Alice'});
 assert.equal(coinPilot.status,200);
 const joinA=await t.call('A','preview/join',{name:'HunterA'});
 const joinB=await t.call('B','preview/join',{name:'HunterB'});
 assert.equal(joinA.status,200);
 assert.equal(joinB.status,200);
 const names=[...t.instances.keys()];
 assert.equal(names.length,3);
 assert.equal(new Set(names).size,3);
 assert.ok(names.some(n=>n.includes('game-preview')));
 assert.ok(names.some(n=>n.includes('coin-race-pilot')));
 assert.ok(names.includes('free1'));
 const spawn=joinA.result.result.position;
 assert.deepEqual(spawn,joinB.result.result.position);
 assert.equal(joinA.result.result.world.coins.length,200);
 assert.equal(joinA.result.result.world.mapVersion,'v16-forest-100');
 assert.equal(joinA.result.result.nextClaimSeq,1);
 const [world1,world2]=await Promise.all([t.call('A','preview/world'),t.call('B','preview/world')]);
 assert.deepEqual(world1.result.world,world2.result.world);
 assert.equal((await t.call('A','collect',{claimSeq:1,requestId:'claim-realfree0001'})).status,403);
 assert.equal((await t.call('B','join',{name:'Blocked'})).status,403);
 assert.equal((await t.call('A','move',{dx:100,dy:0})).status,403);
 assert.equal(read.result.world.leaders.length,0);
});
test('preview enforces server-side movement speed, collision and pickup distance',async()=>{
 const t=rig();
 const a=await t.call('A','preview/join',{name:'Explorer'});
 assert.equal(a.status,200);
 const start=a.result.result.position;
 const move=await t.call('A','preview/move',{dx:100,dy:100});
 assert.equal(move.status,200);
 const end=move.result.result;
 assert.ok(Math.hypot(end.x-start.x,end.y-start.y)<=0.8,'one move does not teleport to a distant coin');
 const invalid=await t.call('A','preview/move',{dx:10000,dy:0});
 assert.equal(invalid.status,400);
 const claim=await t.call('A','preview/collect',{requestId:'claim-far-away-001',claimSeq:1});
 assert.equal(claim.status,200);
 assert.equal(claim.result.result,null,'cannot claim arbitrary distant coin from spawn');
 const world=await t.call('A','preview/world');
 assert.equal(world.result.world.leaders.reduce((n,p)=>n+p.score,0),0);
 const v=t.instances.get('free1-forest-game-preview-v1');
 assert.equal(v.room.players.get('alice').x,end.x);
 assert.equal(v.room.players.get('alice').y,end.y);
});
test('preview cannot be accessed anonymously, by VIP, or when its independent flag is disabled',async()=>{
 const t=rig();
 assert.equal((await t.call('A','preview/world')).status,200);
 const anon=await handleV16Request(new Request(BASE+'/api/v16/preview/world?scope=free'),t.env);
 assert.equal(anon.status,401);
 const vip=await handleV16Request(new Request(BASE+'/api/v16/preview/world?scope=vip'),t.env);
 assert.equal(vip.status,403);
 t.env.ENABLE_V16_GAME_PREVIEW='false';
 assert.equal((await t.call('A','preview/world')).status,403);
 assert.equal((await t.call('A','preview/join',{name:'Denied'})).status,403);
 assert.equal((await t.call('A','preview/collect',{claimSeq:1,requestId:'claim-denied-001'})).status,403);
 const badOrigin=await handleV16Request(new Request(BASE+'/api/v16/preview/world?scope=free',
  {headers:{origin:'https://evil.test'}}),t.env);
 assert.equal(badOrigin.status,403);
});
test('only same-origin frame can request actions; Firebase tokens never sent into game',()=>{
 for(const key of ['id="previewOpen"','id="previewOverlay"','id="previewFrame"',
   'event.source!==el("previewFrame").contentWindow',
   'event.origin!==location.origin','th2d-preview-request',
   '"/api/v16/preview/"','auth.currentUser.getIdToken()','getToken(appCheck)',
   'const {uid,...safe}=value.result','previewVerified=true'])
  assert.ok(BETA_LOGIN_PAGE.includes(key),key);
 assert.ok(GAME_PREVIEW_PAGE.includes('th2d-preview-result'));
 assert.ok(GAME_PREVIEW_PAGE.includes('window.parent.postMessage'));
 assert.ok(!GAME_PREVIEW_PAGE.includes('firebasejs/'));
 assert.ok(!GAME_PREVIEW_PAGE.includes('V16_BETA_UIDS'));
 assert.ok(!GAME_PREVIEW_PAGE.includes('AIza'));
 assert.ok(!GAME_PREVIEW_PAGE.includes('x-firebase-appcheck'));
});
test('rendered V16 game preserves approved forest, HUD and camera but disables offline points in preview',()=>{
 const original=readFileSync(new URL('../v16-approved/index.html',import.meta.url),'utf8');
 for(const tag of ['id="world"','id="joystick"','id="collect"','id="mini"',
  'id="camera-zoom-slider"','id="shopPanel"','id="rankingPanel"','id="rewardPanel"'])
  assert.ok(original.includes(tag)&&GAME_PREVIEW_PAGE.includes(tag),tag);
 assert.ok(GAME_PREVIEW_PAGE.includes('V16 Forest 100×100'));
 assert.ok(GAME_PREVIEW_PAGE.includes('frame=[dx,dy,0]'),'offline engine must never mint coins from button');
 assert.ok(GAME_PREVIEW_PAGE.includes('previewRequest("collect",previewPendingClaim)'));
 assert.ok(GAME_PREVIEW_PAGE.includes('previewRequest("move",{dx,dy})'));
 assert.ok(GAME_PREVIEW_PAGE.includes('previewRequest("world")'));
 assert.ok(GAME_PREVIEW_PAGE.includes('previewRequest("join",{name:previewNickname()})'));
 assert.ok(GAME_PREVIEW_PAGE.includes('session.map.coins'));
 assert.ok(GAME_PREVIEW_PAGE.includes('session.map.chest'));
 assert.ok(GAME_PREVIEW_PAGE.includes('const {TICK_MS, createForestSession: createRunSession'));
 assert.ok(GAME_PREVIEW_PAGE.includes('cameraZoomCurrent'));
 assert.ok(GAME_PREVIEW_PAGE.includes("el('coin-try').disabled=true;el('speed-try').disabled=true"));
 assert.ok(!GAME_PREVIEW_PAGE.includes('คะแนนฝึกเท่านั้น ยังไม่มีการส่งข้อมูลจริง'));
 const script=GAME_PREVIEW_PAGE.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script&&script.length>100000);
 assert.doesNotThrow(()=>new vm.Script(script));
 const parent=BETA_LOGIN_PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(parent);
 assert.doesNotThrow(()=>new vm.Script(parent.replace(/^import\s+.+?;\s*$/gm,'')));
});
test('preview HTML is same-origin framed only and full world read remains gated',async()=>{
 const t=rig();
 const page=await handleV16Request(new Request(BASE+'/beta-game'),t.env);
 assert.equal(page.status,200);
 assert.equal(page.headers.get('x-frame-options'),'SAMEORIGIN');
 assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'self'/);
 assert.match(page.headers.get('content-security-policy'),/connect-src 'none'/);
 assert.equal(page.headers.get('cache-control'),'no-store');
 assert.ok((await page.text()).includes('camera-zoom-slider'));
 const noFrame=await handleV16Request(new Request(BASE+'/beta-game',{method:'POST'}),t.env);
 assert.equal(noFrame.status,405);
});
