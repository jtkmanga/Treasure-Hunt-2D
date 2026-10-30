import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {V16OnlineClient} from '../src/v16-online/client.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const ok=x=>new Response(JSON.stringify({ok:true,...x}),{headers:{'content-type':'application/json'}});
test('V16 client uses verified token callbacks, HTTPS and Free/VIP isolation',async()=>{
 assert.throws(()=>new V16OnlineClient({baseUrl:'http://test',idToken:()=>'',appCheckToken:()=>''}),/HTTPS/);
 const calls=[],fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/join'))return ok({result:{nextClaimSeq:1,world:{version:5,coins:[]}}});
  if(url.includes('/world'))return ok({unchanged:true,version:5});
  if(url.includes('/move'))return ok({result:{x:3,y:4}});
  throw Error('Unexpected request');
 };
 const client=new V16OnlineClient({baseUrl:'https://staging.example/',scope:'free',
  idToken:async()=> 'firebase-auth-token',appCheckToken:async()=> 'app-check-token',fetchImpl});
 const state=await client.join('Explorer');assert.equal(state.nextClaimSeq,1);
 assert.deepEqual(await client.move(100,-100),{x:3,y:4});
 assert.deepEqual(await client.world(),{version:5,coins:[]});
 assert.match(calls[2].url,/since=5/);
 assert.ok(calls.every(x=>x.url.includes('scope=free')));
 assert.equal(calls[0].options.headers.authorization,'Bearer firebase-auth-token');
 assert.equal(calls[0].options.headers['x-firebase-appcheck'],'app-check-token');
 assert.throws(()=>client.move(200,0),/Invalid analog/);
});
test('V16 pickup retries the same requestId and sequence on transient network error',async()=>{
 let failFirst=true;const claims=[];
 const fetchImpl=async(url,options)=>{
  if(url.includes('/join'))return ok({result:{nextClaimSeq:7,world:{version:2}}});
  if(url.includes('/collect')){
   const body=JSON.parse(options.body);claims.push(body);
   if(failFirst){failFirst=false;throw Error('Lost connection');}
   return ok({result:{kind:'coin',amount:1,score:10,requestId:body.requestId}});
  }
  throw Error('Unexpected route');
 };
 const client=new V16OnlineClient({baseUrl:'https://staging.example',scope:'vip',
  idToken:async()=> 'id',appCheckToken:async()=> 'app',fetchImpl});
 await client.join('VIP');
 await assert.rejects(()=>client.collect(),/Lost connection/);
 const result=await client.collect();assert.equal(result.amount,1);
 assert.deepEqual(claims[0],claims[1]);
 assert.equal(claims[0].claimSeq,7);
 assert.equal(client.nextClaimSeq,8);
 assert.equal(client.pendingClaim,null);
 assert.ok(/^claim-[a-f0-9]{32}$/.test(claims[0].requestId));
});
