// Future authoritative competition core. Not connected to any public HTTP
// route, Worker, Durable Object, D1, or payment provider in this PR.
// A trusted adapter must serialize mutations per server, persist atomically,
// verify Firebase/App Check, reject revoked users, and verify payment callbacks.
import {periodFor} from "./periods.mjs";
import {makeForestMap,FOREST_SEED,selectPracticeReward,COIN_RESPAWN_MS,CHEST_RESPAWN_MS}
 from "../../forest-v8/forest-engine.mjs";

export const BOOSTERS=Object.freeze({
 doubleCoins:Object.freeze({priceTHB:20,durationMs:86_400_000}),
 doubleSpeed:Object.freeze({priceTHB:10,durationMs:86_400_000}),
});
const SERVER_IDS=new Set(["free1","vip1"]);
const rand=()=>{
 // Uniform integer in [0,999] using rejection sampling. Server-only RNG.
 const limit=2**32-((2**32)%1000);
 let n;
 do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);
 return n%1000;
};
function validateUid(uid){
 if(typeof uid!=="string"||uid.length<1||uid.length>128||/[\x00-\x1f\x7f]/.test(uid))throw Error("Verified UID required");
}
function validateNow(now){
 if(!Number.isSafeInteger(now)||now<0)throw Error("Invalid server clock");
}
function validFrame(dx,dy){
 return Number.isInteger(dx)&&Number.isInteger(dy)&&[-1,0,1].includes(dx)&&[-1,0,1].includes(dy);
}
const safeName=s=>typeof s==="string"&&s.trim()?s.trim().slice(0,32):"Hunter";
function collision(tiles,x,y){
 const r=.26,n=tiles.length;
 return [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]].every(([a,b])=>{
  const xx=Math.floor(a),yy=Math.floor(b);
  return xx>=0&&xx<n&&yy>=0&&yy<n&&tiles[yy][xx]===0;
 });
}
export class ForestContestCore {
 constructor({scope="free1",seed=FOREST_SEED,now=Date.now(),secureDraw=rand}={}){
  if(!SERVER_IDS.has(scope))throw Error("Invalid server");
  validateNow(now);
  if(typeof secureDraw!=="function")throw Error("Server RNG required");
  this.scope=scope;this.map=makeForestMap(seed);this.secureDraw=secureDraw;
  this.periodId=periodFor(scope,now).periodId;
  this.players=new Map();this.scores=new Map();this.labels=new Map();
  this.entitlements=new Map();this.receipts=new Set();this.winners=[];
  this.lastMutationAt=now;
 }
 rotatePeriod(now){
  validateNow(now);
  const period=periodFor(this.scope,now);
  if(period.periodId===this.periodId)return;
  const ranking=this.leaders(1);
  this.winners.push({periodId:this.periodId,scope:this.scope,
    winner:ranking[0]||null,recordedAt:now});
  this.scores.clear();this.periodId=period.periodId;
 }
 // Only supply a uid and VIP expiry from a trusted, verified auth adapter.
 join(uid,now,{vipExpiresAt=0,displayName="Hunter"}={}){
  validateUid(uid);validateNow(now);this.rotatePeriod(now);
  if(this.scope==="vip1"&&(!Number.isSafeInteger(vipExpiresAt)||vipExpiresAt<=now))
   throw Error("Verified VIP membership required");
  if(!this.players.has(uid))
   this.players.set(uid,{...this.map.spawn,lastMovedAt:now});
  if(!this.scores.has(uid))this.scores.set(uid,0);
  this.labels.set(uid,safeName(displayName));
  return this.personalSnapshot(uid,now);
 }
 ensurePlayer(uid){
  validateUid(uid);
  const player=this.players.get(uid);
  if(!player)throw Error("Must join via verified identity first");
  return player;
 }
 boosterExpiry(uid,key){return this.entitlements.get(uid)?.[key]||0;}
 move(uid,dx,dy,now){
  validateNow(now);this.rotatePeriod(now);
  const player=this.ensurePlayer(uid);
  if(!validFrame(dx,dy))throw Error("Invalid movement");
  if(now<player.lastMovedAt)throw Error("Nonmonotonic clock");
  // Rate-limit simulation steps: no client-side teleport or arbitrary position.
  const dt=Math.min(200,now-player.lastMovedAt)/1000;
  let x=dx,y=dy;const length=Math.hypot(x,y);
  if(length>1){x/=length;y/=length;}
  const speed=3.9*(this.boosterExpiry(uid,"doubleSpeed")>now?2:1);
  const sub=speed*dt/6;
  for(let i=0;i<6;i++){
   if(collision(this.map.tiles,player.x+x*sub,player.y))player.x+=x*sub;
   if(collision(this.map.tiles,player.x,player.y+y*sub))player.y+=y*sub;
  }
  player.lastMovedAt=now;
  return {x:player.x,y:player.y};
 }
 maybeRespawnChest(now,uid){
  const chest=this.map.chest;
  if(!chest.claimed||now<chest.respawnAt)return;
  const p=this.ensurePlayer(uid),sites=this.map.chestSites;
  const candidate=sites.find(s=>Math.hypot(s.x-p.x,s.y-p.y)>6)
    ??sites[0];
  chest.x=candidate.x;chest.y=candidate.y;chest.claimed=false;chest.respawnAt=0;
 }
 // Must execute under one authoritative atomic per-server serialization lock.
 collect(uid,now){
  validateNow(now);this.rotatePeriod(now);
  const p=this.ensurePlayer(uid);this.maybeRespawnChest(now,uid);
  let nearest=null,dist=Infinity;
  for(const c of this.map.coins){
   if(c.respawnAt>now)continue;
   const d=Math.hypot(c.x-p.x,c.y-p.y);
   if(d<dist){dist=d;nearest=c;}
  }
  const chest=this.map.chest,cDist=Math.hypot(chest.x-p.x,chest.y-p.y);
  let amount=0,type=null;
  if(!chest.claimed&&cDist<.82&&cDist<=dist){
   const draw=this.secureDraw();
   if(!Number.isInteger(draw)||draw<0||draw>999)throw Error("Unsafe server RNG");
   amount=selectPracticeReward(draw);
   chest.claimed=true;chest.respawnAt=now+CHEST_RESPAWN_MS;type="chest";
  }else if(nearest&&dist<.75){
   amount=this.boosterExpiry(uid,"doubleCoins")>now?2:1;
   nearest.respawnAt=now+COIN_RESPAWN_MS;type="coin";
  }
  if(!type)return null;
  const prev=this.scores.get(uid)??0,next=prev+amount;
  if(!Number.isSafeInteger(next))throw Error("Score overflow");
  this.scores.set(uid,next);
  return {type,amount,score:next,scope:this.scope,periodId:this.periodId};
 }
 // Must ONLY be called after provider-side payment verification and a
 // durable unique transaction constraint; this function is not a webhook.
 activateVerifiedPurchase(uid,{product,amountTHB,transactionId,verifiedAt}){
  this.ensurePlayer(uid);validateNow(verifiedAt);
  const item=BOOSTERS[product];
  if(!item)throw Error("Unknown product");
  if(amountTHB!==item.priceTHB)throw Error("Payment amount mismatch");
  if(typeof transactionId!=="string"||!/^[A-Za-z0-9_-]{8,128}$/.test(transactionId))
   throw Error("Invalid verified transaction ID");
  if(this.receipts.has(transactionId))throw Error("Duplicate payment transaction");
  const ent=this.entitlements.get(uid)||{};
  const expiresAt=Math.max(verifiedAt,ent[product]||0)+item.durationMs;
  this.receipts.add(transactionId);
  this.entitlements.set(uid,{...ent,[product]:expiresAt});
  return {product,expiresAt};
 }
 leaders(limit=20){
  return [...this.scores.entries()].sort((a,b)=>b[1]-a[1]||(this.labels.get(a[0])||"").localeCompare(this.labels.get(b[0])||""))
   .slice(0,limit).map(([uid,score],i)=>({rank:i+1,name:this.labels.get(uid)||"Hunter",score}));
 }
 personalSnapshot(uid,now){
  const p=this.ensurePlayer(uid);
  return {scope:this.scope,periodId:this.periodId,player:{x:p.x,y:p.y},
   score:this.scores.get(uid)||0,
   boosters:Object.fromEntries(Object.keys(BOOSTERS).map(k=>[k,Math.max(0,this.boosterExpiry(uid,k)-now)]))};
 }
 publicSnapshot(now,uid){
  validateNow(now);this.rotatePeriod(now);
  if(uid)this.ensurePlayer(uid);
  this.maybeRespawnChest(now,uid||this.players.keys().next().value||"");
  return {scope:this.scope,periodId:this.periodId,
   coins:this.map.coins.filter(c=>c.respawnAt<=now).map(c=>({id:c.id,x:c.x,y:c.y})),
   chest:{x:this.map.chest.x,y:this.map.chest.y,
    available:!this.map.chest.claimed,respawnAt:this.map.chest.respawnAt},
   leaders:this.leaders(20)};
 }
}
