import test from 'node:test';
import assert from 'node:assert/strict';
import {journalSupported,persistGameState,readJournalPage} from '../src/v16-online/durable-score-journal.mjs';
import {V16Room} from '../src/v16-online/room.mjs';
import {V16WorldRoom} from '../src/v16-online/worker.mjs';

const START=Date.parse('2026-11-02T04:00:00.000Z');
function sqlHarness(){
 const saved=new Map(),journal=new Map();
 let table=false,failInsert=false,failSnapshot=false;
 const clone=x=>structuredClone(x);
 const storage={
  get:async key=>saved.get(key),
  put:async(key,value)=>{saved.set(key,clone(value))},
  kv:{put(key,value){if(failSnapshot){failSnapshot=false;throw Error('simulated snapshot failure')}saved.set(key,clone(value))}},
  sql:{exec(query,...params){
   if(query.startsWith('CREATE TABLE IF NOT EXISTS')){table=true;return [];}
   if(query.startsWith('INSERT INTO')){
    if(failInsert){failInsert=false;throw Error('simulated archive failure')}
    if(!table)throw Error('no such table: v16_award_journal');
    const [id,uid,scope,period,kind,coinId,amount,score,requestId,claimSeq,at]=params;
    if(journal.has(id)||[...journal.values()].some(v=>v.uid===uid&&v.requestId===requestId))
     throw Error('UNIQUE constraint failed');
    journal.set(id,{id,uid,scope,period,kind,coinId,amount,score,requestId,claimSeq,at});
    return [];
   }
   if(query.startsWith('SELECT MIN(event_id)')){
    if(!table)throw Error('no such table: v16_award_journal');
    return [{id:journal.size?Math.min(...journal.keys()):null}];
   }
   if(query.startsWith('SELECT event_id AS id')){
    if(!table)throw Error('no such table: v16_award_journal');
    const before=query.includes(' WHERE event_id < ?')?params[0]:null;
    const limit=params.at(-1);
    return [...journal.values()].filter(r=>before===null||r.id<before)
     .sort((a,b)=>b.id-a.id).slice(0,limit).map(clone);
   }
   throw Error('Unexpected SQL '+query.slice(0,100));
  }},
  transactionSync(callback){
   const beforeSaved=clone([...saved]),beforeJournal=clone([...journal]),beforeTable=table;
   try{return callback()}
   catch(e){saved.clear();for(const [k,v] of beforeSaved)saved.set(k,v);
    journal.clear();for(const [k,v] of beforeJournal)journal.set(k,v);
    table=beforeTable;throw e;}
  }
 };
 return {storage,saved,journal,failInsert:()=>{failInsert=true},failSnapshot:()=>{failSnapshot=true}};
}
function addCoin(room,uid,id,at){
 const p=room.requirePlayer(uid),c=room.map.coins[0];
 p.x=c.x;p.y=c.y;p.lastAt=at;
 const before=room.auditNextId;
 const receipt=room.collect(uid,id,at,room.claimSequences.get(uid)+1||1);
 assert.equal(receipt.kind,'coin');
 assert.equal(room.auditNextId,before+1);
 return room.auditEvents.at(-1);
}
test('SQLite-backed award journal grows past 256 events without losing earliest awards',async()=>{
 const h=sqlHarness(),r=new V16Room('free1',START,()=>0);
 r.join('alice',START,'HunterA');
 assert.equal(journalSupported(h.storage),true);
 assert.deepEqual(readJournalPage(h.storage).entries,[]);
 for(let i=0;i<260;i++){
  const at=START+1000+i*61_000;
  const award=addCoin(r,'alice','archive-claim-'+String(i).padStart(6,'0'),at);
  await persistGameState(h.storage,r.save(),award,{requireJournal:true});
 }
 assert.equal(r.auditView().entries.length,40);
 assert.equal(r.auditView().earliestRetainedId,5,'fast local 256 event cache is bounded');
 assert.equal(h.journal.size,260,'SQLite retains all 260 events');
 const last=readJournalPage(h.storage,null,40);
 assert.equal(last.entries[0].id,260);
 assert.equal(last.firstStoredId,1);
 assert.equal(last.nextBeforeId,221);
 const older=readJournalPage(h.storage,last.nextBeforeId,40);
 assert.equal(older.entries[0].id,220);
 assert.equal(older.entries.at(-1).id,181);
 let cursor=older.nextBeforeId,total=80;
 while(cursor!==null){const page=readJournalPage(h.storage,cursor,40);total+=page.entries.length;cursor=page.nextBeforeId;}
 assert.equal(total,260,'pagination enumerates complete new journal');
 const restore=V16Room.restore(h.saved.get('v16-state'),START+16_000_000,()=>0);
 assert.equal(restore.auditNextId,261,'room ID stays monotonic after restart');
 assert.equal(readJournalPage(h.storage,null,1).entries[0].id,260);
});
test('SQL duplicate ID or request ID aborts snapshot write atomically',async()=>{
 const h=sqlHarness(),r=new V16Room('free1',START,()=>0);
 r.join('alice',START,'HunterA');
 const a=addCoin(r,'alice','journal-dupe-0001',START+1000);
 await persistGameState(h.storage,r.save(),a,{requireJournal:true});
 const before=cloneSafe(h.saved.get('v16-state'));
 await assert.rejects(
  persistGameState(h.storage,{...r.save(),version:999},a,{requireJournal:true}),
  /UNIQUE constraint/);
 assert.deepEqual(h.saved.get('v16-state'),before);
 assert.equal(h.journal.size,1);
});
function cloneSafe(v){return structuredClone(v)}
test('a failed archive insertion or failed snapshot put leaves neither score nor new archive event',async()=>{
 const h=sqlHarness(),r=new V16Room('free1',START,()=>0);
 r.join('alice',START,'HunterA');
 const first=addCoin(r,'alice','journal-failure-0001',START+1000);
 h.failInsert();
 await assert.rejects(persistGameState(h.storage,r.save(),first,{requireJournal:true}),/archive failure/);
 assert.equal(h.saved.has('v16-state'),false);
 assert.equal(h.journal.size,0);
 // Commit the first award, then inject a storage failure on the next valid one.
 await persistGameState(h.storage,r.save(),first,{requireJournal:true});
 const good=cloneSafe(h.saved.get('v16-state'));
 const second=addCoin(r,'alice','journal-failure-0002',START+62_000);
 h.failSnapshot();
 await assert.rejects(persistGameState(h.storage,r.save(),second,{requireJournal:true}),/snapshot failure/);
 assert.deepEqual(h.saved.get('v16-state'),good);
 assert.equal(h.journal.size,1,'SQL insert rolled back with KV put');
});
test('non-SQL fallback is allowed for unit harness only; production strict mode fails closed',async()=>{
 const storage={async put(){},async get(){return null}};
 assert.equal(journalSupported(storage),false);
 await assert.rejects(persistGameState(storage,{auditNextId:2,scope:'free1'},
  {id:1,uid:'alice',requestId:'journal-event-0001',scope:'free1',period:'2026-11-01',kind:'coin',
   coinId:1,amount:1,score:1,claimSeq:1,at:START},{requireJournal:true}),/unavailable/);
});
test('Durable Object sends 503 and rolls back score if strict journal storage is missing',async()=>{
 const saved=new Map(),init=[];
 const state={storage:{
  async get(k){return saved.get(k)},async put(k,v){saved.set(k,structuredClone(v))}
 },blockConcurrencyWhile(cb){init.push(cb())}};
 const room=new V16WorldRoom(state,{ROOMS:{}});
 await Promise.all(init);
 const request=(action,body)=>new Request('https://internal/'+action,{method:'POST',
  headers:{'x-internal-scope':'free1','x-internal-uid':'alice','content-type':'application/json'},
  body:JSON.stringify(body)});
 assert.equal((await room.fetch(request('join',{name:'HunterA'}))).status,200);
 const p=room.room.requirePlayer('alice'),c=room.room.map.coins[0];p.x=c.x;p.y=c.y;
 const r=await room.fetch(request('collect',{requestId:'journal-required-01',claimSeq:1}));
 assert.equal(r.status,503);
 assert.equal(room.room.scores.get('alice'),0);
 assert.equal(saved.get('v16-state').auditEvents.length,0);
});
