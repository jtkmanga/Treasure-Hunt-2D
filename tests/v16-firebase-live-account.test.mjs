import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFirebaseLiveAccount} from '../src/v16-online/live-account.mjs';

const valid={uid:'aliceUid123',authTime:1_700_000_100,
 idToken:'A'.repeat(128),apiKey:'AIzaFakeTestKey012345678901234567890'};
function api(reply,{httpOk=true}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return {ok:httpOk,async json(){return reply}};
 };
 return {fetchImpl,calls};
}
test('Firebase account live lookup matches UID and authorized authTime',async()=>{
 const mock=api({users:[{localId:valid.uid,disabled:false,
  validSince:'1700000000',emailVerified:true}]});
 const result=await verifyFirebaseLiveAccount({...valid,fetchImpl:mock.fetchImpl});
 assert.deepEqual(result,{uid:valid.uid,disabled:false,revoked:false});
 assert.equal(mock.calls.length,1);
 assert.equal(mock.calls[0].options.method,'POST');
 assert.match(mock.calls[0].url,/^https:\/\/identitytoolkit.googleapis.com\/v1\/accounts:lookup\?key=/);
 assert.equal(JSON.parse(mock.calls[0].options.body).idToken,valid.idToken);
});
test('Firebase user disabled or ID token revoked is rejected',async()=>{
 for(const entry of [
  {localId:valid.uid,disabled:true,validSince:'1'},
  {localId:valid.uid,validSince:'1700000200',emailVerified:true},
  {localId:'differentUid123',disabled:false,validSince:'1'},
  {localId:valid.uid,disabled:false,validSince:'1',emailVerified:false},
 ]){
  const out=await verifyFirebaseLiveAccount({...valid,
   fetchImpl:api({users:[entry]}).fetchImpl});
  assert.equal(out.disabled||out.revoked,true);
 }
});
test('incomplete Firebase status, API failures and malformed account records fail closed',async()=>{
 for(const response of [
  {users:[]},{users:[{localId:valid.uid}]},
  {users:[{localId:valid.uid,validSince:'invalid'}]},
  {users:[{localId:valid.uid,validSince:'123',disabled:'false'}]},
  {users:[{localId:valid.uid,validSince:'123'},{localId:'another',validSince:'1'}]},
 ]){
  await assert.rejects(()=>verifyFirebaseLiveAccount({...valid,
    fetchImpl:api(response).fetchImpl}));
 }
 await assert.rejects(()=>verifyFirebaseLiveAccount({...valid,
  fetchImpl:api({}, {httpOk:false}).fetchImpl}));
 await assert.rejects(()=>verifyFirebaseLiveAccount({...valid,apiKey:''}));
 await assert.rejects(()=>verifyFirebaseLiveAccount({...valid,authTime:NaN}));
});
