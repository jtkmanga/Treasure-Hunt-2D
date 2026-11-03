// Bounded exact top-20 ranking index. Ranking data is ephemeral: it is rebuilt
// from the canonical persisted scores/names after a Durable Object restart.
// Score/name Maps remain Map-compatible for existing game, audit and test code.
const TOP_COUNT=20;
class WatchedMap extends Map {
 constructor(entries,onChange){
  super();
  this.onChange=onChange;
  for(const [key,value] of entries||[])super.set(key,value);
 }
 set(key,value){
  const present=super.has(key),previous=super.get(key);
  super.set(key,value);
  if(!present||!Object.is(previous,value))
   this.onChange({key,previous,value,present,deleted:false});
  return this;
 }
 delete(key){
  if(!super.has(key))return false;
  const previous=super.get(key);
  super.delete(key);
  this.onChange({key,previous,deleted:true});
  return true;
 }
 clear(){
  if(super.size===0)return;
  super.clear();
  this.onChange({reset:true});
 }
}
/**
 * Exact output equivalence with stable Array#sort from the previous
 * room.leaders(): score descending, raw current name ascending (localeCompare),
 * then original score-Map insertion order for identical score + name.
 * The maximum visible list is only 20 entries. Updates to a top-listed score
 * that *decreases*, or a top-listed name that becomes worse, rebuild the small
 * top-N from canonical Maps to allow promotion of the previously 21st player.
 * All other award/join/poll paths never sort the full user population.
 */
export class IncrementalLeaderboard {
 constructor(scoreEntries=[],nameEntries=[],publicNickname=name=>name){
  this.order=new Map();
  this.nextOrder=0;
  this.top=[];
  this.publicNickname=publicNickname;
  this.names=new WatchedMap(nameEntries,event=>this._nameChanged(event));
  this.scores=new WatchedMap(scoreEntries,event=>this._scoreChanged(event));
  this._rebuild();
 }
 _compare(a,b){
  const points=this.scores.get(b)-this.scores.get(a);
  if(points)return points;
  const labelA=this.names.get(a)||a,labelB=this.names.get(b)||b;
  return labelA.localeCompare(labelB)||(this.order.get(a)-this.order.get(b));
 }
 _insert(uid){
  if(!this.scores.has(uid))return;
  const oldIndex=this.top.indexOf(uid);
  if(oldIndex>=0)this.top.splice(oldIndex,1);
  if(this.top.length>=TOP_COUNT&&this._compare(uid,this.top.at(-1))>=0)return;
  let low=0,high=this.top.length;
  while(low<high){
   const mid=(low+high)>>1;
   if(this._compare(uid,this.top[mid])<0)high=mid;
   else low=mid+1;
  }
  this.top.splice(low,0,uid);
  if(this.top.length>TOP_COUNT)this.top.pop();
 }
 _rebuild(){
  this.top=[];
  this.order.clear();this.nextOrder=0;
  for(const uid of this.scores.keys()){
   this.order.set(uid,this.nextOrder++);
   this._insert(uid);
  }
 }
 _scoreChanged(event){
  if(event.reset){this.top=[];this.order.clear();this.nextOrder=0;return}
  if(event.deleted){
   const inTop=this.top.includes(event.key);
   this.order.delete(event.key);
   if(inTop)this._rebuild();
   return;
  }
  if(!event.present)this.order.set(event.key,this.nextOrder++);
  // A member falling down the ranking may free a slot for an outside player.
  if(event.present&&event.value<event.previous&&this.top.includes(event.key))
   this._rebuild();
  else this._insert(event.key);
 }
 _nameChanged(event){
  if(event.reset){this._rebuild();return}
  const uid=event.key;
  if(!this.scores.has(uid))return;
  const wasTop=this.top.includes(uid);
  if(wasTop){
   const before=event.previous||uid,after=event.deleted?uid:event.value||uid;
   if(after.localeCompare(before)>0){this._rebuild();return}
  }
  this._insert(uid);
 }
 leaders(count=TOP_COUNT){
  // Preserve legacy API behavior for non-default counts, including negative
  // slice counts, without storing an unbounded sorted list in every DO.
  if(!Number.isInteger(count)||count<0||count>TOP_COUNT)
   return [...this.scores.entries()]
    .sort(([a,x],[b,y])=>y-x||(this.names.get(a)||a).localeCompare(this.names.get(b)||b))
    .slice(0,count).map(([uid,score],i)=>({
     rank:i+1,name:this.publicNickname(this.names.get(uid)),score
    }));
  return this.top.slice(0,count).map((uid,i)=>({
   rank:i+1,name:this.publicNickname(this.names.get(uid)),
   score:this.scores.get(uid)
  }));
 }
}
