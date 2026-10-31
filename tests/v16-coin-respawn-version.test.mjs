import test from 'node:test';
import assert from 'node:assert/strict';
import {V16Room,COIN_RESPAWN_MS} from '../src/v16-online/room.mjs';
const now=Date.parse('2026-10-31T00:00:00Z');

test('a picked coin reappears at exactly 60 seconds and bumps the world version',()=>{
 const room=new V16Room('free1',now,()=>0);
 room.join('alice',now,'Alice');
 const coin=room.map.coins[0];
 Object.assign(room.players.get('alice'),{x:coin.x,y:coin.y});
 const event=room.collect('alice','coin-claim-0001',now,1);
 assert.equal(event.amount,1);
 const before=room.publicView(now+COIN_RESPAWN_MS-1);
 assert.equal(before.coins[0].readyAt,now+COIN_RESPAWN_MS);
 const after=room.publicView(now+COIN_RESPAWN_MS);
 assert.equal(after.coins[0].readyAt,0);
 assert.equal(after.version,before.version+1);
 const repeated=room.publicView(now+COIN_RESPAWN_MS+1);
 assert.equal(repeated.version,after.version);
 const restored=V16Room.restore(room.save(),now+COIN_RESPAWN_MS+1000,()=>0);
 assert.equal(restored.publicView(now+COIN_RESPAWN_MS+1000).version,after.version);
 assert.equal(restored.publicView(now+COIN_RESPAWN_MS+1000).coins[0].readyAt,0);
});

test('simultaneously respawning coins advance version once and remain synchronized',()=>{
 const room=new V16Room('free1',now,()=>0);
 const original=room.publicView(now).version;
 room.coinReadyAt[0]=now+60_000;
 room.coinReadyAt[1]=now+60_000;
 const updated=room.publicView(now+60_000);
 assert.equal(updated.version,original+1);
 assert.equal(updated.coins[0].readyAt,0);
 assert.equal(updated.coins[1].readyAt,0);
 assert.equal(room.publicView(now+60_001).version,updated.version);
});
