// Treasure Hunt 2D V16: server-authoritative, serializable world core.
// No browser, payment, or direct account-token handling here.
import {makeForestMapV17} from './forest-map-v17.mjs';
import {periodFor} from './periods.mjs';
import {IncrementalLeaderboard} from './incremental-leaderboard.mjs';
export const WORLD_VERSION='v16-forest-100';
export const COIN_RESPAWN_MS=60_000;
export const CHEST_RESPAWN_MS=4*60*60_000;
// First-stage recent audit window, not full production accounting history.
export const AUDIT_WINDOW=256;
export const REWARDS=Object.freeze([ [100,500],[500,300],[1000,190],[5000,9],[10000,1] ]);
export const SEED=123456789;
function ensure(condition,message){if(!condition)throw new Error(message)}
function validUid(uid){ensure(typeof uid==='string'&&uid.length>0&&uid.length<=128&&!/[\x00-\x1f\x7f]/.test(uid),'Invalid verified UID')}
function publicNickname(value){
 // Never show an email address in a public leaderboard, including names
 // created before this rule. Also remove bidirectional/control characters.
 const name=String(value||'Hunter').trim().slice(0,36);
 return !name||name.includes('@')||/[<>\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/i.test(name)
  ?'Hunter':name;
}
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
  // Index is derived, never persisted; canonical Maps retain existing schema.
  this.ranking=new IncrementalLeaderboard([],[],publicNickname);
  this.scores=this.ranking.scores;this.names=this.ranking.names;
  this.players=new Map();this.winners=[];
  this.claimIds=new Map();this.claimSequences=new Map();this.version=0;
  this.auditEvents=[];this.auditNextId=1;
 }
 static restore(data,now=Date.now(),draw=secureSlot){
  ensure(data&&data.schema===1,'Unknown saved room format');
  const room=new V16Room(data.scope,now,draw,data.seed);
  ensure(Array.isArray(data.coinReadyAt)&&data.coinReadyAt.length===200&&data.coinReadyAt.every(v=>Number.isSafeInteger(v)&&v>=0),'Corrupt coin state');
  room.coinReadyAt=data.coinReadyAt;
  ensure(data.chest&&Number.isFinite(data.chest.x)&&Number.isFinite(data.chest.y)&&Number.isSafeInteger(data.chest.readyAt),'Corrupt chest state');
  room.chest={...data.chest};
  room.period=data.period;
  room.ranking=new IncrementalLeaderboard(data.scores,data.names,publicNickname);
  room.scores=room.ranking.scores;room.names=room.ranking.names;
  room.winners=data.winners||[];room.version=data.version||0;
  room.claimIds=new Map((data.claimIds||[]).map(([uid,ids])=>[uid,new Map(ids)]));
  room.claimSequences=new Map(data.claimSequences||[]);
  ensure([...room.claimSequences.values()].every(n=>Number.isSafeInteger(n)&&n>=0),'Corrupt claim sequence');
  // Legacy states predate score audit; do not invent historical receipts.
  if(data.auditEvents!==undefined){
   ensure(Array.isArray(data.auditEvents)&&data.auditEvents.length<=AUDIT_WINDOW,'Corrupt audit window');
   ensure(Number.isSafeInteger(data.auditNextId)&&data.auditNextId>0,'Corrupt audit sequence');
   let last=0;
   for(const entry of data.auditEvents){
    ensure(entry&&Number.isSafeInteger(entry.id)&&entry.id>last&&entry.id<data.auditNextId,'Corrupt audit event order');
    validUid(entry.uid);
    ensure(entry.scope===room.scope&&typeof entry.period==='string'&&entry.period.length===10,'Corrupt audit scope');
    ensure((entry.kind==='coin'||entry.kind==='chest')&&Number.isSafeInteger(entry.amount)&&entry.amount>0,'Corrupt audit award');
    ensure(Number.isSafeInteger(entry.score)&&entry.score>=entry.amount,'Corrupt audit score');
    ensure(Number.isSafeInteger(entry.at)&&entry.at>=0,'Corrupt audit time');
    last=entry.id;
   }
   room.auditEvents=data.auditEvents.map(e=>({...e}));room.auditNextId=data.auditNextId;
  }
  return room;
 }
 save(){return {schema:1,scope:this.scope,seed:this.seed,period:this.period,
  coinReadyAt:this.coinReadyAt.slice(),chest:{...this.chest},scores:[...this.scores],names:[...this.names],
  winners:this.winners.slice(-100),claimIds:[...this.claimIds].map(([uid,v])=>[uid,[...v].slice(-32)]),
  claimSequences:[...this.claimSequences],version:this.version,
  auditEvents:this.auditEvents.map(e=>({...e})),auditNextId:this.auditNextId};}
 rollover(now){validNow(now);const period=periodFor(this.scope,now).periodId;
  if(period===this.period)return false;
  const top=this.leaders(1)[0]||null;
  this.winners.push({scope:this.scope,period:this.period,top,closedAt:now});
  this.winners=this.winners.slice(-100);this.period=period;this.scores.clear();this.claimIds.clear();this.version++;return true;
 }
 join(uid,now,label='Hunter'){validUid(uid);validNow(now);this.rollover(now);
  if(!this.players.has(uid))this.players.set(uid,{...this.map.spawn,lastAt:now});
  const firstJoin=!this.scores.has(uid);
  const newName=publicNickname(label);
  const nameChanged=firstJoin||this.names.get(uid)!==newName;
  // Add the name before first score entry so a new join enters top-20
  // only once (and with its final label).
  this.names.set(uid,newName);
  if(firstJoin)this.scores.set(uid,0);
  if(nameChanged)this.version++;
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
 // Staging-only V16 preview: replay exactly the local 50ms input frames.
 // Every batch is bounded by real elapsed server time plus a fixed 100ms
 // initial credit. Jitter cannot erase movement, and clients cannot mint
 // additional movement by replaying or fabricating elapsed timestamps.
 movePreview(uid,frames,seq,now,nonce){validNow(now);const p=this.requirePlayer(uid);
  ensure(typeof nonce==='string'&&nonce===p.previewNonce,'Stale preview movement session');
  ensure(Number.isSafeInteger(seq)&&seq>0,'Invalid preview move sequence');
  if(seq===p.previewSeq)return {...p.previewAck}; // Network retry: no double movement.
  ensure(seq===(p.previewSeq||0)+1,'Out-of-order preview movement');
  ensure(Array.isArray(frames)&&frames.length>0&&frames.length<=40,'Invalid preview movement batch');
  ensure(frames.every(f=>Array.isArray(f)&&f.length===2&&f.every(v=>Number.isInteger(v)&&v>=-100&&v<=100)),'Invalid preview frame');
  const from=p.previewBudgetAt??p.lastAt;
  ensure(now>=from,'Nonmonotonic preview movement');
  const credit=Math.min(5000,(p.previewCreditMs??100)+(now-from));
  const cost=frames.length*50;
  ensure(cost<=credit,'Preview movement exceeds elapsed server time');
  // Same two axis-separated 25ms collision steps as the 50ms mobile engine.
  for(const f of frames){
   let [ax,ay]=f;const norm=Math.hypot(ax,ay);
   if(norm>100){ax=ax*100/norm;ay=ay*100/norm;}
   const step=3.9*.05/100/2;
   for(let i=0;i<2;i++){
    if(walkable(this.map.tiles,p.x+ax*step,p.y))p.x+=ax*step;
    if(walkable(this.map.tiles,p.x,p.y+ay*step))p.y+=ay*step;
   }
  }
  p.previewCreditMs=credit-cost;p.previewBudgetAt=now;p.lastAt=now;
  p.previewSeq=seq;p.previewAck={x:p.x,y:p.y};
  return {...p.previewAck};
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
 collect(uid,requestId,now,claimSeq=null){validNow(now);validUid(uid);
  // Verify the previously persisted request before checking transient presence.
  // A DO can hibernate/restart between pickup and retry; authenticated replays
  // must return the original receipt without requiring a new player position.
  ensure(typeof requestId==='string'&&/^[A-Za-z0-9_-]{12,80}$/.test(requestId),'Invalid claim request ID');
  // Monotonic server-persisted client sequence prevents old claim retries
  // from granting coins after the 60-second respawn, even after DO restart.
  if(claimSeq!==null){
   ensure(Number.isSafeInteger(claimSeq)&&claimSeq>0,'Invalid claim sequence');
   const last=this.claimSequences.get(uid)||0;
   if(claimSeq<last)throw Error('Stale claim sequence');
   if(claimSeq===last){const prior=this.claimIds.get(uid)?.get(requestId);return prior??null;}
   ensure(claimSeq===last+1,'Out-of-order claim sequence');
  }
  const memory=this.claimIds.get(uid)||new Map();
  if(memory.has(requestId))return memory.get(requestId); // Only return an existing receipt.
  // A NEW pickup still requires an active joined player and a valid server
  // position. No rejoin means no new points, even if a coin has respawned.
  const p=this.requirePlayer(uid);
  this.rollover(now);this.chestRespawn(now);
  let candidate=null,distance=Infinity;
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
   // Score + receipt + audit share one persisted v16-state write. A failed
   // storage.put rolls back all three; rejected/replayed requests log nothing.
   this.auditEvents.push({id:this.auditNextId++,uid,scope:this.scope,
    period:this.period,kind:result.kind,coinId:result.coinId??null,
    amount:result.amount,score:total,requestId,claimSeq,at:now});
   if(this.auditEvents.length>AUDIT_WINDOW)this.auditEvents.shift();
  }
  // Remember misses to stop request replay from becoming a future free claim.
  memory.set(requestId,result);if(memory.size>32)memory.delete(memory.keys().next().value);
  if(claimSeq!==null)this.claimSequences.set(uid,claimSeq);
  this.claimIds.set(uid,memory);
  return result;
 }
 auditView(limit=40){
  ensure(Number.isInteger(limit)&&limit>=1&&limit<=50,'Invalid admin audit limit');
  return {scope:this.scope,window:AUDIT_WINDOW,nextId:this.auditNextId,
   earliestRetainedId:this.auditEvents[0]?.id??null,
   entries:this.auditEvents.slice(-limit).reverse().map(e=>({...e})),
   note:'Recent staging audit only; not complete public ledger'};
 }
 leaders(count=20){return this.ranking.leaders(count);}
 // Safe public season snapshot: no UID, email, receipts or admin history.
 seasonStatus(now){
  validNow(now);
  const schedule=periodFor(this.scope,now);
  const last=this.winners.at(-1)||null;
  const previousWinner=last?.scope===this.scope
   ?{periodId:last.period,closedAt:new Date(last.closedAt).toISOString(),
     winner:last.top?{name:publicNickname(last.top.name),score:last.top.score}:null}
   :null;
  return {periodId:schedule.periodId,startsAt:schedule.startsAt,
   resetsAt:schedule.resetsAt,timezone:schedule.timezone,previousWinner};
 }
 publicView(now){validNow(now);this.rollover(now);this.chestRespawn(now);
  // Expired coin cooldowns must advance the shared snapshot version, or
  // conditional polls would claim the world is unchanged after a respawn.
  let reappeared=false;
  for(let i=0;i<this.coinReadyAt.length;i++){
   const readyAt=this.coinReadyAt[i];
   if(readyAt>0&&readyAt<=now){this.coinReadyAt[i]=0;reappeared=true;}
  }
  if(reappeared)this.version++;
  return {version:this.version,scope:this.scope,mapVersion:WORLD_VERSION,seed:this.seed,period:this.period,
   coins:this.map.coins.map((c,i)=>({id:i,x:c.x,y:c.y,readyAt:this.coinReadyAt[i]})),
   chest:{...this.chest},leaders:this.leaders(),season:this.seasonStatus(now)};
 }
 privateView(uid,now){const p=this.requirePlayer(uid);return {uid,position:{x:p.x,y:p.y},score:this.scores.get(uid)||0,
  nextClaimSeq:(this.claimSequences.get(uid)||0)+1,world:this.publicView(now)};}
}
