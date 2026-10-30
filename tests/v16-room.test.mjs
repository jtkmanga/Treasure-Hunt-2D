import test from 'node:test';
import assert from 'node:assert/strict';
import {V16Room,rewardFromSlot,COIN_RESPAWN_MS,CHEST_RESPAWN_MS} from '../src/v16-online/room.mjs';
const t=Date.parse('2026-10-30T10:00:00Z');
function newRoom(scope='free1'){return new V16Room(scope,t,()=>999)}
test('V16 exact map is 100x100, 200 coins and deterministic per server',()=>{
 const a=newRoom(),b=newRoom('vip1');assert.equal(a.map.tiles.length,100);assert.equal(a.map.coins.length,200);
 assert.deepEqual(a.map.tiles,b.map.tiles);assert.equal(a.map.spawn.x,49.5);
 assert.equal(a.map.chest.x,56.5);
});
test('chest odds exactly sum to requested probabilities',()=>{
 const count=new Map();for(let i=0;i<1000;i++){const p=rewardFromSlot(i);count.set(p,(count.get(p)||0)+1)}
 assert.deepEqual([...count],[[100,500],[500,300],[1000,190],[5000,9],[10000,1]]);
});
test('two users collide on one coin and cannot both score; persisted cooldown and duplicate claim',()=>{
 const r=newRoom();r.join('alice',t,'Alice');r.join('bob',t,'Bob');const c=r.map.coins[0];
 for(const uid of ['alice','bob'])Object.assign(r.players.get(uid),{x:c.x,y:c.y});
 const id1='coinclaim00001',id2='coinclaim00002';
 const a=r.collect('alice',id1,t);assert.equal(a.amount,1);assert.equal(a.score,1);
 assert.equal(r.collect('bob',id2,t),null);
 assert.deepEqual(r.collect('alice',id1,t+1000),a);
 const b=V16Room.restore(r.save(),t,()=>999);
 b.join('bob',t+1000);Object.assign(b.players.get('bob'),{x:c.x,y:c.y});
 assert.equal(b.collect('bob','coinclaim00003',t+1000),null);
 assert.equal(b.collect('bob','coinclaim00004',t+COIN_RESPAWN_MS)?.amount,1);
 assert.equal(b.scores.get('alice'),1);assert.equal(b.scores.get('bob'),1);
});
test('Lucky Box awarded exactly once with 4h cooldown, never at active players',()=>{
 const r=newRoom();r.join('alice',t);r.join('bob',t);
 for(const uid of ['alice','bob'])Object.assign(r.players.get(uid),{x:r.chest.x,y:r.chest.y});
 const a=r.collect('alice','chestclaim0001',t);assert.equal(a.amount,10000);
 assert.equal(r.collect('bob','chestclaim0002',t),null);
 assert.equal(r.chest.readyAt,t+CHEST_RESPAWN_MS);
 r.publicView(t+CHEST_RESPAWN_MS);
 assert.equal(r.chest.readyAt,0);
 for(const p of r.players.values())if(t+CHEST_RESPAWN_MS-p.lastAt<90_000)assert.ok(Math.hypot(p.x-r.chest.x,p.y-r.chest.y)>6);
});
test('No teleport via client position or forged analog, no online player avatar list',()=>{
 const r=newRoom();r.join('alice',t);assert.throws(()=>r.move('alice',[101,0],t+200));
 const a=r.move('alice',[100,0],t+200);assert.ok(a.x-r.map.spawn.x<0.8);
 assert.equal(r.collect('alice','nonnearcoin0001',t+200),null);
 const world=r.publicView(t);assert.ok(!('players' in world));assert.equal(world.coins.length,200);
});
test('weekly Free reset, daily VIP reset and winner capture',()=>{
 const fri=Date.parse('2026-10-30T16:59:59Z');const sat=fri+1000;const sun=Date.parse('2026-10-31T17:00:00Z');
 const free=new V16Room('free1',fri);const vip=new V16Room('vip1',fri);
 for(const r of [free,vip]){r.join('player',fri,'Hunter');r.scores.set('player',99)}
 free.rollover(sat);vip.rollover(sat);
 assert.equal(free.scores.get('player'),99);assert.equal(vip.scores.get('player'),undefined);
 assert.equal(vip.winners.at(-1).top.score,99);
 free.rollover(sun);assert.equal(free.scores.size,0);assert.equal(free.winners.at(-1).top.score,99);
});
