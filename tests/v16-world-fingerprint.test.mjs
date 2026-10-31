import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {BETA_LOGIN_PAGE} from '../src/v16-online/beta-login-page.mjs';

const js=BETA_LOGIN_PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(js);
function getFunctions(){
 const start=js.indexOf('function comparableWorld(world){');
 const end=js.indexOf('function describeWorld(world){',start);
 assert.ok(start>0&&end>start,'World fingerprint functions included');
 const context={crypto:webcrypto,TextEncoder,Uint8Array};
 vm.createContext(context);
 vm.runInContext(js.slice(start,end)+';globalThis.fingerprint=worldFingerprint;',context);
 return context.fingerprint;
}
const world=()=>({
 scope:'free1',version:0,mapVersion:'v16-forest-100',seed:123456789,period:'2026-W44',
 coins:Array.from({length:200},(_,id)=>({id,x:(id+0.5)%100,y:Math.floor(id/2)+0.5,readyAt:0})),
 chest:{x:51.5,y:55.5,readyAt:0},
 leaders:[],
});
test('comparison code includes every coin and chest, not just first three sample points',async()=>{
 const fp=getFunctions(),a=world();
 const first=await fp(a);
 assert.match(first,/^[A-F0-9]{16}$/);
 assert.equal(first,await fp(structuredClone(a)));
 const changed=structuredClone(a);
 changed.coins[197].x+=1;
 assert.notEqual(first,await fp(changed));
 changed.coins[197].x-=1;
 changed.chest.readyAt=1234567890000;
 assert.notEqual(first,await fp(changed));
});
test('different version and leaderboard produce different fingerprint',async()=>{
 const fp=getFunctions(),a=world(),first=await fp(a);
 const b=structuredClone(a);b.version=1;assert.notEqual(first,await fp(b));
 const c=structuredClone(a);c.leaders=[{rank:1,name:'Hunter',score:1}];assert.notEqual(first,await fp(c));
});
test('private account identifiers do not affect shared world code',async()=>{
 const fp=getFunctions(),a=world();
 a.uid='player-alice';a.email='someone@example.test';a.authToken='NEVER_USE_THIS';
 const b=world();b.uid='player-bob';b.email='else@example.test';b.authToken='A_DIFFERENT_TOKEN';
 assert.equal(await fp(a),await fp(b));
});
test('world comparison UI activates only after authenticated read, not from unauthenticated page load',()=>{
 assert.match(BETA_LOGIN_PAGE,/id="worldFingerprint"/);
 assert.match(BETA_LOGIN_PAGE,/await showWorldFingerprint\(world\)/);
 assert.match(BETA_LOGIN_PAGE,/await showWorldFingerprint\(lastWorldSnapshot\)/);
 assert.match(BETA_LOGIN_PAGE,/if\(!betaVerified\|\|!ready/);
 assert.match(BETA_LOGIN_PAGE,/200 จุด Lucky Box/);
 assert.equal(js.includes('setInterval('),false);
 assert.doesNotThrow(()=>new vm.Script(js.replace(/^import\s+.+?;\s*$/gm,'')));
});
