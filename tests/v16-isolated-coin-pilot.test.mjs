import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {V16WorldRoom,handleV16Request} from '../src/v16-online/worker.mjs';
import {BETA_LOGIN_PAGE} from '../src/v16-online/beta-login-page.mjs';

const BASE='https://treasure-hunt-2d-v16-world-staging.example';
const TOKEN='A'.repeat(130);
function harness(){
 const stores=new Map(),objects=new Map(),initializers=[],roomNames=[],rate=[];
 const env={
  ENABLE_V16_READS:'true',ENABLE_V16_WRITES:'false',ENABLE_V16_PILOT_WRITES:'true',
  ALLOWED_ORIGIN:BASE,
  FIREBASE_PROJECT_ID:'treasure-hunt-2d',
  FIREBASE_PROJECT_NUMBER:'439998873632',
  FIREBASE_APP_ID:'1:439998873632:web:4b694f8159d9d9e0163c45',
  V16_BETA_UIDS:'alice,bob',
  ACCOUNT_STATUS:{async fetch(_url,{body}){const {uid}=JSON.parse(body);return Response.json({uid,disabled:false,revoked:false})}},
  V16_RATE_LIMITER:{async limit({key}){rate.push(key);return {success:true}}},
  ROOMS:{
   idFromName(name){roomNames.push(name);return name},
   get(name){
    if(objects.has(name))return objects.get(name);
    if(!stores.has(name))stores.set(name,new Map());
    const store=stores.get(name),state={
     storage:{async get(k){return store.get(k)},async put(k,v){store.set(k,structuredClone(v))}},
     blockConcurrencyWhile(fn){initializers.push(fn())},
    };
    const object=new V16WorldRoom(state,{});
    objects.set(name,object);
    return object;
   }
  },
 };
 const tester={
  verifyId:async token=>({uid:token.startsWith('A')?'alice':'bob',provider:'google.com',emailVerified:true,authTime:1760000000}),
  verifyApp:async()=>({appId:env.FIREBASE_APP_ID}),
 };
 const req=(actor,endpoint,body=null,scope='free')=>{
  const method=body===null?'GET':'POST';
  return new Request(BASE+'/api/v16/'+endpoint+'?scope='+scope,{
   method,headers:{'authorization':'Bearer '+actor.repeat(130),'x-firebase-appcheck':'valid-app-check',
     'origin':BASE,...(method==='POST'?{'content-type':'application/json'}:{})},
   ...(method==='POST'?{body:JSON.stringify(body)}:{})
  });
 };
 const call=async(actor,endpoint,body,scope)=> {
  const res=await handleV16Request(req(actor,endpoint,body,scope),env,tester);
  return {status:res.status,data:await res.json()};
 };
 return {env,tester,call,req,objects,stores,roomNames,rate,ready:()=>Promise.all(initializers)};
}
test('pilot coin race: two verified users join shared isolated DO; only one can collect coin #0',async()=>{
 const h=harness();
 const [a,b]=await Promise.all([
  h.call('A','pilot/join',{name:'Alice'}),
  h.call('B','pilot/join',{name:'Bob'})
 ]);
 assert.equal(a.status,200);assert.equal(b.status,200);
 const pilotNames=h.roomNames.filter(n=>n.includes('coin-race-pilot'));
 assert.equal(pilotNames.length,2);
 assert.equal(new Set(pilotNames).size,1);
 const pilot=h.objects.get(pilotNames[0]);await h.ready();
 const coin=pilot.room.map.coins[0];
 for(const uid of ['alice','bob']){
  const p=pilot.room.players.get(uid);
  assert.equal(p.x,coin.x);assert.equal(p.y,coin.y);
 }
 assert.equal(a.data.result.nextClaimSeq,1);
 assert.equal(b.data.result.nextClaimSeq,1);
 const [x,y]=await Promise.all([
  h.call('A','pilot/collect',{requestId:'claim-alice-0001',claimSeq:1}),
  h.call('B','pilot/collect',{requestId:'claim-bob-000001',claimSeq:1})
 ]);
 assert.equal(x.status,200);assert.equal(y.status,200);
 assert.equal([x,y].filter(z=>z.data.result?.kind==='coin').length,1);
 assert.equal(pilot.room.scores.get('alice')+pilot.room.scores.get('bob'),1);
 const [worldA,worldB]=await Promise.all([h.call('A','pilot/world'),h.call('B','pilot/world')]);
 assert.equal(worldA.status,200);assert.equal(worldB.status,200);
 assert.deepEqual(worldA.data.world,worldB.data.world);
 assert.equal(worldA.data.world.coins[0].readyAt>Date.now(),true);
 assert.equal(worldA.data.world.leaders.reduce((n,p)=>n+p.score,0),1);
 assert.equal(worldA.data.world.leaders.some(p=>'email' in p||'uid' in p),false);
 const winner=x.data.result?.kind==='coin'?'A':'B';
 const id=winner==='A'?'claim-alice-0001':'claim-bob-000001';
 const retry=await h.call(winner,'pilot/collect',{requestId:id,claimSeq:1});
 assert.equal(retry.data.result.amount,1);
 assert.equal(pilot.room.scores.get('alice')+pilot.room.scores.get('bob'),1);
 assert.ok(h.rate.every(k=>k.startsWith('pilot:')));
});
test('ordinary Free Server remains immutable and all actual-game writes are disabled',async()=>{
 const h=harness();
 assert.equal((await h.call('A','join',{name:'Alice'})).status,403);
 assert.equal((await h.call('A','collect',{claimSeq:1,requestId:'coin-claim-test'})).status,403);
 assert.equal((await h.call('B','move',{dx:100,dy:0})).status,403);
 const before=await h.call('A','world');
 assert.equal(before.status,200);
 assert.equal(before.data.world.coins.filter(c=>c.readyAt<=Date.now()).length,200);
 const pilJoin=await h.call('A','pilot/join',{name:'Pilot'});
 assert.equal(pilJoin.status,200);
 const pilCollect=await h.call('A','pilot/collect',{claimSeq:1,requestId:'claim-pilot-0001'});
 assert.equal(pilCollect.data.result?.kind,'coin');
 const after=await h.call('A','world');
 assert.equal(after.status,200);
 assert.deepEqual(after.data.world,before.data.world);
 assert.equal(after.data.world.leaders.length,0);
 assert.equal(after.data.world.coins[0].readyAt,0);
 const names=[...h.stores.keys()];
 assert.equal(names.length,2);
 assert.notEqual(names[0],names[1]);
});
test('pilot API denies uninvited, missing App Check, VIP and disabled pilot flag',async()=>{
 const h=harness();
 assert.equal((await h.call('A','pilot/join',{name:'Tester'},'vip')).status,403);
 const denied=harness();denied.env.V16_BETA_UIDS='bob';
 assert.equal((await denied.call('A','pilot/join',{name:'Tester'})).status,403);
 const bad=harness();bad.tester.verifyApp=async()=>{throw Error('bad App Check')};
 assert.equal((await bad.call('A','pilot/join',{name:'Tester'})).status,401);
 const off=harness();off.env.ENABLE_V16_PILOT_WRITES='false';
 assert.equal((await off.call('A','pilot/join',{name:'Tester'})).status,403);
 assert.equal((await off.call('A','pilot/world')).status,403);
 assert.equal(off.objects.size,0);
 const anon=await handleV16Request(new Request(BASE+'/api/v16/pilot/world?scope=free'),h.env,h.tester);
 assert.equal(anon.status,401);
 assert.equal((await handleV16Request(new Request(BASE+'/api/v16/pilot/join?scope=free',{
  method:'POST',headers:{origin:'https://evil.test'},body:'{}'}),h.env,h.tester)).status,403);
 assert.equal((await h.call('A','pilot/move',{dx:100,dy:0})).status,404);
});
test('mobile pilot UI requires beta verification and retries idempotently on network error',()=>{
 for(const id of ['coinPilotPanel','pilotJoin','pilotCollect','pilotWorld','pilotState','pilotName'])
  assert.ok(BETA_LOGIN_PAGE.includes('id="'+id+'"'),id);
 assert.match(BETA_LOGIN_PAGE,/if\(!betaVerified\|\|!ready\|\|!auth\?\.currentUser\|\|!appCheck\)/);
 assert.match(BETA_LOGIN_PAGE,/\/api\/v16\/pilot\//);
 assert.match(BETA_LOGIN_PAGE,/pilotPendingClaim=null;pilotClaimSeq\+\+/);
 assert.match(BETA_LOGIN_PAGE,/if\(!pilotPendingClaim\)pilotPendingClaim=/);
 assert.match(BETA_LOGIN_PAGE,/pilot-"\\+crypto.randomUUID/);
 assert.match(BETA_LOGIN_PAGE,/ห้องทดลอง/);
 const script=BETA_LOGIN_PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new vm.Script(script.replace(/^import\s+.+?;\s*$/gm,'')));
});
