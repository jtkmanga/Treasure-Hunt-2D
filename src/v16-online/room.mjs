// Treasure Hunt 2D V16: server-authoritative, serializable world core.
// No browser, payment, or direct account-token handling here.
import {makeForestMapV17} from './forest-map-v17.mjs';
import {periodFor} from './periods.mjs';
export const WORLD_VERSION='v16-forest-100';
export const COIN_RESPAWN_MS=60_000;
export const CHEST_RESPAWN_MS=4*60*60_000;
export const REWARDS=Object.freeze([ [100,500],[500,300],[1000,190],[5000,9],[10000,1] ]);
export const SEED=123456789;
function ensure(condition,message){if(!condition)throw new Error(message)}
function validUid(uid){ensure(typeof uid==='string'&&uid.length>0&&uid.length<=128&&!/[\x00-\x1f\x7f]/.test(uid),'Invalid verified UID')}
export function rewardFromSlot(slot){ensure(Number.isInteger(slot)&&slot>=0&&slot<1000,'Invalid secure reward slot');for(const [coins,weight] of REWARDS){if(slot<weight)return coins;slot-=weight}throw Error('Invalid reward table')}
export function secureSlot(){const limit=2**32-(2**32%1000);let x;do{x=crypto.getRandomValues(new Uint32Array(1))[0]}while(x>=limit);return x%1000}
function walkable(tiles,x,y){const r=.26;return [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]].every(([a,b])=>tiles[Math.floor(b)]?.[Math.floor(a)]===0)}
function validNow(now){ensure(Number.isSafeInteger(now)&&now>=0,'Invalid server clock')}
export class V16Room {
 constructor(scope='free1',now=Date.now(),draw=secureSlot,seed=SEED){
  ensure(scope==='free1'||scope==='vip1','Invalid room scope');validNow(now);
  this.scope=scope;this.seed=seed;this.map=makeForestMapV17(seed);this.draw=draw;
  this.period=periodFor(scope,now).periodId;
  this.coinReadyAt=Array(200).fill(0);
  this.chest={x:this.map.chest.x,y:this.map.chest.y,readyAt:0};
  this.scores=new Map();this.names=new Map();this.players=new Map();this.winners=[];
  this.claimIds=new Map();this.claimSequences=new Map();this.version=0;
 }
 static restore(data,now=Date.now(),draw=secureSlot){
  ensure(data&&data.schema===1,'Unknown saved room format');
  const room=new V16Room(data.scope,now,draw,data.seed);
  ensure(Array.isArray(data.coinReadyAt)&&data.coinReadyAt.length===200&&data.coinReadyAt.every(v=>Number.isSafeInteger(v)&&v>=0),'Corrupt coin state');
  room.coinReadyAt=data.coinReadyAt;
  ensure(data.chest&&Number.isFinite(data.chest.x)&&Number.isFinite(data.chest.y)&&Number.isSafeInteger(data.chest.readyAt),'Corrupt chest state');
  room.chest={...data.chest};
  room.period=data.period;room.scores=new Map(data.scores);room.names=new Map(data.names);
  room.winners=data.winners||[];room.version=data.version||0;
  room.claimIds=new Map((data.claimIds||[]).map(([uid,ids])=>[uid,new Map(ids)]));
  room.claimSequences=new Map(data.claimSequences||[]);
  ensure([...room.claimSequences.values()].every(n=>Number.isSafeInteger(n)&&n>=0),'Corrupt claim sequence');
  return room;
 }
 save(){return {schema:1,scope:this.scope,seed:this.seed,period:this.period,
  coinReadyAt:this.coinReadyAt.slice(),chest:{...this.chest},scores:[...this.scores],names:[...this.names],
  winners:this.winners.slice(-100),claimIds:[...this.claimIds].map(([uid,v])=>[uid,[...v].slice(-32)]),
  claimSequences:[...this.claimSequences],version:this.version};}
 rollover(now){validNow(now);const period=periodFor(this.scope,now).periodId;
  if(period===this.period)return false;
  const top=this.leaders(1)[0]||null;
  this.winners.push({scope:this.scope,period:this.period,top,closedAt:now});
  this.winners=this.winners.slice(-100);this.period=period;this.scores.clear();this.claimIds.clear();this.version++;return true;
 }
 join(uid,now,label='Hunter'){validUid(uid);validNow(now);this.rollover(now);
  if(!this.players.has(uid))this.players.set(uid,{...this.map.spawn,lastAt:now});
  if(!this.scores.has(uid))this.scores.set(uid,0);
  this.names.set(uid,String(label||'Hunter').trim().slice(0,36)||'Hunter');
  return this.privateView(uid,now);
 }
 requirePlayer(uid){validUid(uid);const p=this.players.get(uid);ensure(p,'Player not joined');return p}
 move(uid,axes,now){validNow(now);const player=this.requirePlayer(uid);
  ensure(Array.isArray(axes)&&axes.length===2&&axes.every(v=>Number.isInteger(v)&&v>=-100&&v<=100),'Invalid movement');
  ensure(now>=player.lastAt,'Nonmonotonic input');
  let [ax,ay]=axes;const length=Math.hypot(ax,ay);if(length>100){ax=ax*100/length;ay=ay*100/length}
  const seconds=Math.min(200,now-player.lastAt)/1000;
  const step=3.9*seconds/100/4;
  for(let i=0;i<4;i++){
   const dx=ax*step,dy=ay*step;
   if(walkable(this.map.tiles,player.x+dx,player.y))player.x+=dx;
   if(walkable(this.map.tiles,player.x,player.y+dy))player.y+=dy;
  }
  player.lastAt=now;return {x:player.x,y:player.y};
 }
 chestRespawn(now){if(this.chest.readyAt===0||this.chest.readyAt>now)return false;
  const sites=this.map.chestSites;
  const start=Math.floor(this.draw()*sites.length/1000);
  for(let i=0;i<sites.length;i++){
   const s=sites[(start+i)%sites.length];
   // Spawn away from every player with recent activity; no box at anyone's feet.
   if([...this.players.values()].some(p=>now-p.lastAt<90_000&&Math.hypot(s.x-p.x,s.y-p.y)<6))continue;
   this.chest={x:s.x,y:s.y,readyAt:0};this.version++;return true;
  }
  return false;
 }
 collect(uid,requestId,now,claimSeq=null){validNow(now);this.requirePlayer(uid);
  // Monotonic server-persisted client sequence prevents old claim retries
  // from granting coins after the 60-second respawn, even after DO restart.
  if(claimSeq!==null){
   ensure(Number.isSafeInteger(claimSeq)&&claimSeq>0,'Invalid claim sequence');
   const last=this.claimSequences.get(uid)||0;
   if(claimSeq<last)throw Error('Stale claim sequence');
   if(claimSeq===last){const prior=this.claimIds.get(uid)?.get(requestId);return prior??null;}
   ensure(claimSeq===last+1,'Out-of-order claim sequence');
  }
  ensure(typeof requestId==='string'&&/^[A-Za-z0-9_-]{12,80}$/.test(requestId),'Invalid claim request ID');
  this.rollover(now);this.chestRespawn(now);
  const memory=this.claimIds.get(uid)||new Map();
  if(memory.has(requestId))return memory.get(requestId); // Same claim cannot be credited twice.
  const p=this.requirePlayer(uid);let candidate=null,distance=Infinity;
  for(let i=0;i<200;i++){
   if(this.coinReadyAt[i]>now)continue;
   const c=this.map.coins[i],d=Math.hypot(p.x-c.x,p.y-c.y);
   if(d<distance){distance=d;candidate=i;}
  }
  const chestDistance=Math.hypot(p.x-this.chest.x,p.y-this.chest.y);
  let result=null;
  if(this.chest.readyAt===0&&chestDistance<.82&&chestDistance<=distance){
   const amount=rewardFromSlot(this.draw());
   this.chest.readyAt=now+CHEST_RESPAWN_MS;
   result={kind:'chest',amount};
  }else if(candidate!==null&&distance<.75){
   this.coinReadyAt[candidate]=now+COIN_RESPAWN_MS;
   result={kind:'coin',coinId:candidate,amount:1};
  }
  if(result){
   const total=(this.scores.get(uid)||0)+result.amount;
   ensure(Number.isSafeInteger(total),'Score overflow');
   this.scores.set(uid,total);this.version++;
   result={...result,score:total,scope:this.scope,period:this.period,requestId,version:this.version};
  }
  // Remember misses to stop request replay from becoming a future free claim.
  memory.set(requestId,result);if(memory.size>32)memory.delete(memory.keys().next().value);
  if(claimSeq!==null)this.claimSequences.set(uid,claimSeq);
  this.claimIds.set(uid,memory);
  return result;
 }
 leaders(count=20){return [...this.scores.entries()]
  .sort(([a,x],[b,y])=>y-x||(this.names.get(a)||a).localeCompare(this.names.get(b)||b))
  .slice(0,count).map(([uid,score],i)=>({rank:i+1,name:this.names.get(uid)||'Hunter',score}));}
 publicView(now){validNow(now);this.rollover(now);this.chestRespawn(now);
  return {version:this.version,scope:this.scope,mapVersion:WORLD_VERSION,seed:this.seed,period:this.period,
   coins:this.map.coins.map((c,i)=>({id:i,x:c.x,y:c.y,readyAt:this.coinReadyAt[i]})),
   chest:{...this.chest},leaders:this.leaders()};
 }
 privateView(uid,now){const p=this.requirePlayer(uid);return {uid,position:{x:p.x,y:p.y},score:this.scores.get(uid)||0,
  nextClaimSeq:(this.claimSequences.get(uid)||0)+1,world:this.publicView(now)};}
}
