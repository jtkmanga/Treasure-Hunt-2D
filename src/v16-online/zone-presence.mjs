// Ephemeral zone-based presence index for the 100x100 V16 map.
// No network calls, payment, score/coin writes, or persistent player IDs.
// In particular, this is NOT sharding: the canonical room remains one DO.
export const ZONE_WORLD_SIZE=100;
export const ZONE_CELL_SIZE=10;
export const ZONE_VISIBILITY_RADIUS=8;
export const ZONE_VISIBILITY_CAP=24;
export const ZONE_IDLE_TTL_MS=90_000;
function validPosition(x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y)||
  x<0||x>=ZONE_WORLD_SIZE||y<0||y>=ZONE_WORLD_SIZE)
  throw new Error('Invalid authoritative player position');
}
function validUid(uid){
 if(typeof uid!=='string'||uid.length===0||uid.length>128)
  throw new Error('Invalid server-verified UID');
}
function cellOf(x,y){
 return `${Math.floor(x/ZONE_CELL_SIZE)}:${Math.floor(y/ZONE_CELL_SIZE)}`;
}
export class ZonePresenceIndex{
 constructor(){
  this.entries=new Map(); // private UID -> {x,y,lastAt,cell,avatarId}
  this.cells=new Map(); // cell -> Set<UID>
  this.sweepIterator=null;
 }
 get size(){return this.entries.size}
 _detach(uid,cell){
  const members=this.cells.get(cell);
  if(!members)return;
  members.delete(uid);
  if(members.size===0)this.cells.delete(cell);
 }
 _remove(uid){
  const prior=this.entries.get(uid);
  if(!prior)return false;
  this._detach(uid,prior.cell);
  this.entries.delete(uid);
  return true;
 }
 delete(uid){return this._remove(uid)}
 clear(){this.entries.clear();this.cells.clear();this.sweepIterator=null}
 upsert(uid,player){
  validUid(uid);
  validPosition(player?.x,player?.y);
  if(!Number.isSafeInteger(player?.lastAt)||player.lastAt<0)
   throw new Error('Invalid server update time');
  const cell=cellOf(player.x,player.y),prior=this.entries.get(uid);
  if(prior&&player.lastAt<prior.lastAt)
   throw new Error('Stale authoritative presence update');
  if(prior&&prior.cell!==cell)this._detach(uid,prior.cell);
  const avatarId=prior?.avatarId||'avatar_'+crypto.randomUUID();
  const record={x:player.x,y:player.y,lastAt:player.lastAt,cell,avatarId};
  this.entries.set(uid,record);
  if(!this.cells.has(cell))this.cells.set(cell,new Set());
  this.cells.get(cell).add(uid);
  return avatarId;
 }
 // Bounded incremental cleanup avoids scanning every connected actor for
 // each movement/poll, while nearby() also prunes stale records on its cells.
 sweep(now,budget=16){
  if(!Number.isSafeInteger(now)||now<0||!Number.isInteger(budget)||budget<0||budget>256)
   throw new Error('Invalid sweep parameters');
  let visited=0,removed=0;
  while(visited<budget&&this.entries.size){
   if(!this.sweepIterator)this.sweepIterator=this.entries.keys();
   const next=this.sweepIterator.next();
   if(next.done){this.sweepIterator=null;break}
   visited++;
   const entry=this.entries.get(next.value);
   if(entry&&now-entry.lastAt>=ZONE_IDLE_TTL_MS){
    if(this._remove(next.value))removed++;
   }
  }
  return {visited,removed};
 }
 // Caller position comes exclusively from the authoritative V16Room.
 // This method never reveals Firebase UID, email, token, total population,
 // or any actor outside the requested radius. No arbitrary client coords.
 nearby(uid,now,{radius=ZONE_VISIBILITY_RADIUS,limit=ZONE_VISIBILITY_CAP}={}){
  validUid(uid);
  if(!Number.isSafeInteger(now)||now<0)
   throw new Error('Invalid presence clock');
  if(!Number.isFinite(radius)||radius<0||radius>ZONE_VISIBILITY_RADIUS||
   !Number.isInteger(limit)||limit<1||limit>ZONE_VISIBILITY_CAP)
   throw new Error('Invalid nearby view bounds');
  this.sweep(now,16);
  const viewer=this.entries.get(uid);
  if(!viewer||now-viewer.lastAt>=ZONE_IDLE_TTL_MS)
   return {players:[],radius,limit,viewerActive:false};
  const cx=Math.floor(viewer.x/ZONE_CELL_SIZE),cy=Math.floor(viewer.y/ZONE_CELL_SIZE);
  const cellsRadius=Math.ceil(radius/ZONE_CELL_SIZE);
  const candidates=[],r2=radius*radius;
  const compare=(a,b)=>a.distance2-b.distance2||
   a.record.avatarId.localeCompare(b.record.avatarId);
  function addBounded(candidate){
   if(candidates.length===limit&&compare(candidate,candidates.at(-1))>=0)return;
   let lo=0,hi=candidates.length;
   while(lo<hi){
    const mid=(lo+hi)>>1;
    if(compare(candidate,candidates[mid])<0)hi=mid;
    else lo=mid+1;
   }
   candidates.splice(lo,0,candidate);
   if(candidates.length>limit)candidates.pop();
  }
  for(let dy=-cellsRadius;dy<=cellsRadius;dy++){
   for(let dx=-cellsRadius;dx<=cellsRadius;dx++){
    const cell=this.cells.get(`${cx+dx}:${cy+dy}`);
    if(!cell)continue;
    for(const otherUid of cell){
     if(otherUid===uid)continue;
     const other=this.entries.get(otherUid);
     if(!other)continue;
     if(now-other.lastAt>=ZONE_IDLE_TTL_MS){
      this._remove(otherUid);continue;
     }
     const x=other.x-viewer.x,y=other.y-viewer.y;
     const distance2=x*x+y*y;
     if(distance2<=r2)addBounded({otherUid,record:other,distance2});
    }
   }
  }
  return {players:candidates.map(({otherUid,record})=>({
   id:record.avatarId,uidForServerOnly:otherUid,
   x:Math.round(record.x*100)/100,y:Math.round(record.y*100)/100
  })),radius,limit,viewerActive:true};
 }
 checkInvariants(){
  for(const [uid,record] of this.entries){
   if(!this.cells.get(record.cell)?.has(uid)||cellOf(record.x,record.y)!==record.cell)
    return false;
  }
  for(const [cell,members] of this.cells)
   for(const uid of members)
    if(this.entries.get(uid)?.cell!==cell)return false;
  return true;
 }
}
