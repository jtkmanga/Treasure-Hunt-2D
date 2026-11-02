// SQLite-backed Durable Object score journal.
// Never send raw journal records in a public player/world response.
const TABLE='v16_award_journal';
const DDL=`CREATE TABLE IF NOT EXISTS ${TABLE} (
 event_id INTEGER PRIMARY KEY,
 uid TEXT NOT NULL,
 scope TEXT NOT NULL,
 period TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('coin','chest')),
 coin_id INTEGER,
 amount INTEGER NOT NULL CHECK(amount > 0),
 score INTEGER NOT NULL,
 request_id TEXT NOT NULL,
 claim_seq INTEGER,
 awarded_at INTEGER NOT NULL,
 UNIQUE(uid, request_id)
)`;
const INSERT=`INSERT INTO ${TABLE}
(event_id,uid,scope,period,kind,coin_id,amount,score,request_id,claim_seq,awarded_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
const SELECT=`SELECT event_id AS id,uid,scope,period,kind,
coin_id AS coinId,amount,score,request_id AS requestId,
claim_seq AS claimSeq,awarded_at AS at FROM ${TABLE}`;
export function journalSupported(storage){
 return typeof storage?.transactionSync==='function'&&
  typeof storage?.sql?.exec==='function'&&typeof storage?.kv?.put==='function';
}
function validatedEvent(event,snapshot){
 if(!event||!Number.isSafeInteger(event.id)||event.id<1||
  !Number.isSafeInteger(snapshot.auditNextId)||event.id!==snapshot.auditNextId-1||
  !Number.isSafeInteger(event.amount)||event.amount<=0||
  !Number.isSafeInteger(event.score)||event.score<event.amount||
  typeof event.uid!=='string'||!event.uid||event.uid.length>128||
  typeof event.requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(event.requestId)||
  !['coin','chest'].includes(event.kind)||
  event.scope!==snapshot.scope||typeof event.period!=='string'||
  !Number.isSafeInteger(event.at)||event.at<0||
  (event.coinId!==null&&!(Number.isInteger(event.coinId)&&event.coinId>=0&&event.coinId<200))||
  (event.claimSeq!==null&&!Number.isSafeInteger(event.claimSeq)))
  throw Error('Invalid durable score journal event');
}
// The transaction never awaits. SQLite SQL insert and synchronous KV put
// are committed (or rolled back) as a single Durable Object transaction.
export async function persistGameState(storage,snapshot,event=null,{requireJournal=false}={}){
 if(!event){await storage.put('v16-state',snapshot);return;}
 validatedEvent(event,snapshot);
 if(!journalSupported(storage)){
  if(requireJournal)throw Error('Persistent score journal storage unavailable');
  // Used by legacy in-memory test doubles; not a production archive.
  await storage.put('v16-state',snapshot);return;
 }
 storage.transactionSync(()=>{
  storage.sql.exec(DDL);
  storage.sql.exec(INSERT,event.id,event.uid,event.scope,event.period,
   event.kind,event.coinId,event.amount,event.score,event.requestId,
   event.claimSeq,event.at);
  storage.kv.put('v16-state',snapshot);
 });
}
export function readJournalPage(storage,beforeId=null,limit=40){
 if(!journalSupported(storage))
  return {available:false,entries:[],nextBeforeId:null,firstStoredId:null,
   note:'SQLite journal unavailable'};
 if(beforeId!==null&&(!Number.isSafeInteger(beforeId)||beforeId<=0))
  throw Error('Invalid journal cursor');
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid journal page size');
 try{
  const where=beforeId!==null?' WHERE event_id < ?':'';
  const sql=SELECT+where+' ORDER BY event_id DESC LIMIT ?';
  const rows=[...storage.sql.exec(sql,...(beforeId!==null?[beforeId]:[]),limit+1)];
  const more=rows.length>limit;
  const entries=rows.slice(0,limit).map(r=>({...r}));
  const first=[...storage.sql.exec(`SELECT MIN(event_id) AS id FROM ${TABLE}`)];
  return {available:true,entries,firstStoredId:first[0]?.id??null,
   nextBeforeId:more&&entries.length?entries.at(-1).id:null,
   note:'Archived award events since first archive write; older awards not reconstructed'};
 }catch(err){
  // Brand-new DO has no SQL table until its first successful award.
  if(/no such table: v16_award_journal/i.test(String(err?.message||err)))
   return {available:true,entries:[],firstStoredId:null,nextBeforeId:null,
    note:'No archived awards yet; older award history was not reconstructed'};
  throw err;
 }
}
