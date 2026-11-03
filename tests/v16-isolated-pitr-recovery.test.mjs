import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatedPitrDo,runIsolatedPitrDrill,PITR_DRILL_ROOM} from '../src/v16-online/isolated-pitr-drill.mjs';
import {handleV16Request} from '../src/v16-online/worker.mjs';

function syntheticStorage(){
 let store={table:false,row:null,kv:new Map()};
 let pending=null,abortCalls=0,restoreCalls=0;
 const clone=()=>({table:store.table,row:store.row?{...store.row}:null,
  kv:new Map([...store.kv.entries()].map(([k,v])=>[k,structuredClone(v)]))});
 const bookmarks=new Map();
 const kv={
  get(k){return store.kv.get(k)},
  put(k,v){store.kv.set(k,structuredClone(v))}
 };
 const sql={exec(query,...params){
  if(query.startsWith('CREATE TABLE IF NOT EXISTS')){store.table=true;return []}
  if(!store.table)throw Error('no such table: v16_pitr_synthetic_probe');
  if(query.startsWith('SELECT COUNT(*) AS n'))return [{n:store.row?1:0}];
  if(query.startsWith('SELECT score,marker'))return store.row?[{...store.row}]:[];
  if(query.startsWith('INSERT INTO')){
   if(store.row)throw Error('duplicate synthetic row');
   store.row={score:params[0],marker:params[1]};return [];
  }
  if(query.startsWith('UPDATE')){
   if(!store.row)throw Error('Missing synthetic row');
   store.row={score:params[0],marker:params[1]};return [];
  }
  throw Error('Unexpected synthetic SQL query '+query.slice(0,90));
 }};
 const storage={
  kv,sql,
  transactionSync(fn){const before=clone();try{return fn()}catch(e){store=before;throw e}},
  async getCurrentBookmark(){
   const bookmark='0123456789abcdef-0123456789abcdef';
   bookmarks.set(bookmark,clone());return bookmark;
  },
  async onNextSessionRestoreBookmark(bookmark){
   if(!bookmarks.has(bookmark))throw Error('Invalid synthetic bookmark');
   pending=bookmarks.get(bookmark);restoreCalls++;
   return 'opaque-undo-bookmark';
  }
 };
 const state={storage,id:{name:PITR_DRILL_ROOM},abort(){
  abortCalls++;
  if(!pending)throw Error('No pending checkpoint restore');
  store={table:pending.table,row:pending.row?{...pending.row}:null,
   kv:new Map([...pending.kv.entries()].map(([k,v])=>[k,structuredClone(v)]))};
  pending=null;
  throw Error('Simulated DO restart after PITR');
 }};
 return {state,storage,getSnapshot:clone,getAbortCalls:()=>abortCalls,
  getRestoreCalls:()=>restoreCalls};
}
function envFor(lab){
 const invoked=[];
 return {ENABLE_V16_RECOVERY_DRILL:'true',ALLOWED_ORIGIN:'https://example.test',
  V16_RATE_LIMITER:{limit:async()=>({success:true})},
  ROOMS:{idFromName(name){invoked.push(name);return name},
   get(name){if(name!==PITR_DRILL_ROOM)throw Error('Unexpected Durable Object selected');
    return {fetch:req=>isolatedPitrDo(req,lab.state)};}},invoked};
}
test('synthetic isolated PITR restores SQL and KV together and creates a durable completed marker',async()=>{
 const lab=syntheticStorage(),env=envFor(lab);
 const res=await runIsolatedPitrDrill(env);
 assert.equal(res.status,200);
 assert.equal(res.result.ok,true);
 assert.equal(res.result.sqlAndKvRestored,true);
 assert.equal(res.result.preRestoreVerified,true);
 assert.equal(res.result.realPlayerDataTouched,false);
 assert.equal(lab.getRestoreCalls(),1);
 assert.equal(lab.getAbortCalls(),1);
 assert.deepEqual(lab.getSnapshot().row,{score:123,marker:'baseline'});
 assert.deepEqual(lab.getSnapshot().kv.get('__v16_pitr_synthetic_state'),
  {score:123,marker:'baseline'});
 assert.equal(lab.getSnapshot().kv.get('__v16_pitr_synthetic_passed').passed,true);
 assert.ok(env.invoked.every(n=>n===PITR_DRILL_ROOM));
 assert.ok(!JSON.stringify(res.result).includes('0123456789abcdef'),'bookmark must not leak');
 const repeat=await runIsolatedPitrDrill(env);
 assert.equal(repeat.status,200);
 assert.equal(repeat.result.previouslyPassed,true);
 assert.equal(lab.getRestoreCalls(),1,'repeat must not trigger second restore');
});
test('recovery drill refuses any non-synthetic DO name and unsupported methods',async()=>{
 const lab=syntheticStorage();
 lab.state.id.name='free1-forest-game-preview-v1';
 const denied=await isolatedPitrDo(new Request('https://internal/pitr/prepare',{
  method:'POST',headers:{'x-internal-pitr-drill':'1'}}),lab.state);
 assert.equal(denied.status,403);
 assert.equal(lab.getRestoreCalls(),0);
 assert.equal(lab.getSnapshot().table,false);
 lab.state.id.name=PITR_DRILL_ROOM;
 const missing=await isolatedPitrDo(new Request('https://internal/pitr/prepare',{
  method:'POST'}),lab.state);
 assert.equal(missing.status,403);
 const method=await isolatedPitrDo(new Request('https://internal/pitr/prepare',{
  method:'GET',headers:{'x-internal-pitr-drill':'1'}}),lab.state);
 assert.equal(method.status,405);
});
test('existing public game, Free, VIP and Admin routes never trigger synthetic restore',async()=>{
 const lab=syntheticStorage(),env=envFor(lab);
 env.ENABLE_V16_RECOVERY_DRILL='false';
 const disabled=await handleV16Request(new Request('https://example.test/api/v16/recovery-drill'),env);
 assert.equal(disabled.status,403);
 assert.equal(lab.getRestoreCalls(),0);
 assert.equal(env.invoked.length,0);
 const wrongMethod=await handleV16Request(new Request('https://example.test/api/v16/recovery-drill',{method:'POST'}),env);
 assert.equal(wrongMethod.status,405);
 assert.equal(lab.getRestoreCalls(),0);
 env.ENABLE_V16_RECOVERY_DRILL='true';
 const enabled=await handleV16Request(new Request('https://example.test/api/v16/recovery-drill'),env);
 assert.equal(enabled.status,200);
 assert.equal((await enabled.json()).storageRestored,true);
 assert.equal(lab.getRestoreCalls(),1);
});
