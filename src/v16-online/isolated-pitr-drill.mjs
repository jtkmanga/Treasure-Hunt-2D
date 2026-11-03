// Stand-alone synthetic PITR drill, NEVER a real game/score Durable Object.
// Requires exact isolated DO name and short-lived Worker feature flag.
// Only synthetic SQL + KV state are restored; no player or admin data is read.
export const PITR_DRILL_ROOM='__treasure_hunt_2d_pitr_only_20261103_7b82cf__';
const KV='__v16_pitr_synthetic_state';
const COMPLETE='__v16_pitr_synthetic_passed';
const TABLE='v16_pitr_synthetic_probe';
const BASE_SCORE=123,CHANGED_SCORE=987;
const schema=`CREATE TABLE IF NOT EXISTS ${TABLE} (
 id INTEGER PRIMARY KEY,
 score INTEGER NOT NULL,
 marker TEXT NOT NULL
)`;
const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
function checkStorage(storage){
 return !!(storage&&storage.sql?.exec&&storage.kv?.get&&storage.kv?.put&&
  storage.transactionSync&&storage.getCurrentBookmark&&
  storage.onNextSessionRestoreBookmark);
}
function readSnapshot(storage){
 const record=[...storage.sql.exec(`SELECT score,marker FROM ${TABLE} WHERE id=1`)][0];
 const kv=storage.kv.get(KV);
 return {sqlScore:record?.score??null,sqlMarker:record?.marker??null,
  kvScore:kv?.score??null,kvMarker:kv?.marker??null};
}
function matches(read,score,marker){
 return read.sqlScore===score&&read.kvScore===score&&
  read.sqlMarker===marker&&read.kvMarker===marker;
}
export async function isolatedPitrDo(req,state){
 const path=new URL(req.url).pathname;
 if(state.id?.name!==PITR_DRILL_ROOM||req.headers.get('x-internal-pitr-drill')!=='1')
  return json({error:'Isolated recovery drill forbidden'},403);
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const storage=state.storage;
 if(!checkStorage(storage))return json({error:'PITR storage capability missing'},503);
 try{
  if(path==='/pitr/prepare'){
   if(storage.kv.get(COMPLETE)){
    const view=readSnapshot(storage);
    if(!matches(view,BASE_SCORE,'baseline'))
     return json({error:'Completed drill checksum mismatch'},503);
    return json({ok:true,alreadyCompleted:true,restored:view});
   }
   // A previously-used, unverified test object must never be silently reset.
   if(storage.kv.get(KV)!==undefined)
    return json({error:'Recovery drill already started; manual inspection required'},409);
   storage.transactionSync(()=>{
    storage.sql.exec(schema);
    const rows=[...storage.sql.exec(`SELECT COUNT(*) AS n FROM ${TABLE}`)];
    if(rows[0]?.n!==0)throw Error('Recovery drill SQL state not empty');
    storage.sql.exec(`INSERT INTO ${TABLE} (id,score,marker) VALUES (1,?,?)`,
      BASE_SCORE,'baseline');
    storage.kv.put(KV,{score:BASE_SCORE,marker:'baseline'});
   });
   const base=readSnapshot(storage);
   if(!matches(base,BASE_SCORE,'baseline'))return json({error:'Invalid initial checkpoint'},503);
   const bookmark=await storage.getCurrentBookmark();
   if(typeof bookmark!=='string'||bookmark.length<20||bookmark.length>200)
    return json({error:'Cloudflare did not issue a valid bookmark'},503);
   return json({ok:true,bookmark,baseline:base});
  }
  if(path==='/pitr/mutate'){
   const before=readSnapshot(storage);
   if(!matches(before,BASE_SCORE,'baseline'))return json({error:'Pre-mutation checksum mismatch'},409);
   storage.transactionSync(()=>{
    storage.sql.exec(`UPDATE ${TABLE} SET score=?,marker=? WHERE id=1`,
      CHANGED_SCORE,'mutated');
    storage.kv.put(KV,{score:CHANGED_SCORE,marker:'mutated'});
   });
   const modified=readSnapshot(storage);
   return matches(modified,CHANGED_SCORE,'mutated')?
    json({ok:true,mutated:modified}):json({error:'Mutation not persisted'},503);
  }
  if(path==='/pitr/restore'){
   const before=readSnapshot(storage);
   if(!matches(before,CHANGED_SCORE,'mutated'))return json({error:'Missing altered checkpoint'},409);
   let input;try{input=await req.json()}catch{return json({error:'Invalid restore command'},400)}
   const bookmark=input?.bookmark;
   if(typeof bookmark!=='string'||bookmark.length<20||bookmark.length>200||
    !/^[a-z0-9-]+$/i.test(bookmark))
    return json({error:'Invalid recovery bookmark'},400);
   await storage.onNextSessionRestoreBookmark(bookmark);
   // Cloudflare ends the active DO session; the next request creates
   // a new instance whose SQL and KV both reflect the chosen bookmark.
   state.abort('Synthetic PITR restore only', {retryAlarm:false});
   return json({error:'Unexpected continuation after abort'},503);
  }
  if(path==='/pitr/verify'){
   const view=readSnapshot(storage);
   return json({ok:matches(view,BASE_SCORE,'baseline'),view,
    hasCompletedMarker:!!storage.kv.get(COMPLETE)});
  }
  if(path==='/pitr/complete'){
   const view=readSnapshot(storage);
   if(!matches(view,BASE_SCORE,'baseline'))
    return json({error:'Cannot certify unsuccessful restore'},409);
   storage.kv.put(COMPLETE,{passed:true,verifiedAt:Date.now()});
   return json({ok:true,verified:view});
  }
  return json({error:'Unknown recovery drill action'},404);
 }catch(error){
  return json({error:'Synthetic recovery drill operation unavailable'},503);
 }
}
export async function runIsolatedPitrDrill(env){
 if(!env.ROOMS?.get||!env.ROOMS?.idFromName||!env.V16_RATE_LIMITER?.limit)
  return {status:503,result:{error:'Recovery drill dependencies missing'}};
 const throttled=await env.V16_RATE_LIMITER.limit({key:'synthetic-pitr-20261103'});
 if(!throttled?.success)
  return {status:429,result:{error:'Recovery drill rate limited'}};
 const stub=env.ROOMS.get(env.ROOMS.idFromName(PITR_DRILL_ROOM));
 const call=async(action,body)=>{
  const req=new Request('https://internal/pitr/'+action,{
   method:'POST',headers:{'x-internal-pitr-drill':'1',
    'x-internal-scope':'free1','content-type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body)
  });
  const res=await stub.fetch(req);
  const payload=await res.json();
  if(!res.ok||!payload.ok)throw Error('Synthetic recovery drill '+action+' failed');
  return payload;
 };
 try{
  const first=await call('prepare');
  if(first.alreadyCompleted)
   return {status:200,result:{ok:true,isolated:true,previouslyPassed:true,
    storageRestored:true,verified:first.restored,realPlayerDataTouched:false}};
  const altered=await call('mutate');
  if(!matches(altered.mutated,CHANGED_SCORE,'mutated'))
   throw Error('Synthetic modification not verified');
  // The restore call normally aborts its DO. A network error here is
  // expected; the independent verification below determines success.
  try{await call('restore',{bookmark:first.bookmark})}catch{}
  let passed;
  for(let i=0;i<12;i++){
   try{
    const result=await call('verify');
    if(result.ok){passed=result;break}
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,350));
  }
  if(!passed)throw Error('Isolated PITR verification never returned baseline');
  const completed=await call('complete');
  return {status:200,result:{ok:true,isolated:true,previouslyPassed:false,
   storageRestored:true,preRestoreVerified:matches(altered.mutated,CHANGED_SCORE,'mutated'),
   sqlAndKvRestored:matches(completed.verified,BASE_SCORE,'baseline'),
   verified:completed.verified,realPlayerDataTouched:false}};
 }catch{
  return {status:503,result:{error:'Synthetic PITR not verified; inspect only isolated test room'}};
 }
}
