import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { handleV16Request, V16WorldRoom } from '../src/v16-online/worker.mjs';
import { V16OnlineClient } from '../src/v16-online/client.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

// Simulates TWO independent browser sessions talking to ONE authoritative DO
// through the actual Worker router and its Firebase/App Check/account gates.
// No real accounts, banking services, external network, or Cloudflare costs.
function stagingLab() {
  const storage = new Map();
  let ready;
  const state = {
    storage: {
      async get(key) { return storage.get(key); },
      async put(key, value) { storage.set(key, structuredClone(value)); },
    },
    blockConcurrencyWhile(callback) { ready = callback(); },
  };
  const room = new V16WorldRoom(state, {});
  const visits = [];
  const env = {
    ENABLE_V16_READS: 'true',
    ENABLE_V16_WRITES: 'true',
    ALLOWED_ORIGIN: 'https://preview.test',
    FIREBASE_PROJECT_ID: 'treasure-hunt-2d',
    FIREBASE_PROJECT_NUMBER: '123456789',
    FIREBASE_APP_ID: '1:123456789:web:preview',
    ROOMS: { idFromName: name => name, get: () => room },
    ACCOUNT_STATUS: {
      async fetch(_url, opts) {
        const { uid } = JSON.parse(opts.body);
        return Response.json({ uid, disabled: false, revoked: false });
      },
    },
    V16_RATE_LIMITER: { async limit() { return { success: true }; } },
  };
  const testing = {
    verifyId: async token => ({ uid: token.startsWith('A') ? 'alice' : 'bob' }),
    verifyApp: async token => {
      if (token !== 'valid-appcheck') throw Error('Invalid App Check');
      return { appId: env.FIREBASE_APP_ID };
    },
  };
  const makeClient = (letter, scope = 'free') => new V16OnlineClient({
    baseUrl: 'https://preview.test',
    scope,
    idToken: async () => letter.repeat(110),
    appCheckToken: async () => 'valid-appcheck',
    fetchImpl: async (url, opts = {}) => {
      visits.push({ url, method: opts.method ?? 'GET' });
      const headers = new Headers(opts.headers);
      headers.set('origin', 'https://preview.test');
      return handleV16Request(new Request(url, { ...opts, headers }), env, testing);
    },
  });
  return { room, ready: () => ready, makeClient, visits, env, testing };
}

test('two authenticated browsers see the same Free world and only one wins a coin', async () => {
  const lab = stagingLab();
  await lab.ready();
  const a = lab.makeClient('A'), b = lab.makeClient('B');
  const [first, second] = await Promise.all([a.join('Alice'), b.join('Bob')]);
  assert.equal(first.world.mapVersion, 'v16-forest-100');
  assert.deepEqual(first.world.coins, second.world.coins);
  assert.equal(first.world.coins.length, 200);
  const target = lab.room.room.map.coins[0];
  // Test-only fixture: drive both players to the same legal pickup position.
  Object.assign(lab.room.room.players.get('alice'), { x: target.x, y: target.y });
  Object.assign(lab.room.room.players.get('bob'), { x: target.x, y: target.y });
  const [x, y] = await Promise.all([a.collect(), b.collect()]);
  assert.equal([x, y].filter(v => v?.kind === 'coin').length, 1);
  assert.equal(lab.room.room.scores.get('alice') + lab.room.room.scores.get('bob'), 1);
  const [aWorld, bWorld] = await Promise.all([a.world(), b.world()]);
  assert.deepEqual(aWorld.coins, bWorld.coins);
  assert.equal(aWorld.coins[0].readyAt > Date.now(), true);
  assert.equal(aWorld.leaders.reduce((sum, l) => sum + l.score, 0), 1);
  assert.equal(aWorld.leaders.some(l => 'email' in l), false);
});

test('two authenticated browsers compete for one Lucky Box; no duplicated prize', async () => {
  const lab = stagingLab();
  await lab.ready();
  const a = lab.makeClient('A'), b = lab.makeClient('B');
  await Promise.all([a.join('Alice'), b.join('Bob')]);
  const { x, y } = lab.room.room.chest;
  Object.assign(lab.room.room.players.get('alice'), { x, y });
  Object.assign(lab.room.room.players.get('bob'), { x, y });
  const [awardA, awardB] = await Promise.all([a.collect(), b.collect()]);
  const prizes = [awardA, awardB].filter(value => value?.kind === 'chest');
  assert.equal(prizes.length, 1);
  assert.ok([100, 500, 1000, 5000, 10000].includes(prizes[0].amount));
  const view = await b.world();
  assert.equal(view.chest.readyAt > Date.now(), true);
  assert.equal(view.leaders.reduce((sum, x) => sum + x.score, 0), prizes[0].amount);
});

test('unauthorized origin, missing sign-in and VIP access remain denied', async () => {
  const lab = stagingLab();
  await lab.ready();
  const blockedOrigin = await handleV16Request(new Request('https://preview.test/api/v16/world', {
    headers: { origin: 'https://malicious.example' },
  }), lab.env, lab.testing);
  assert.equal(blockedOrigin.status, 403);
  const missingLogin = await handleV16Request(new Request('https://preview.test/api/v16/join', {
    method: 'POST', body: JSON.stringify({ name: 'No auth' }),
  }), lab.env, lab.testing);
  assert.equal(missingLogin.status, 401);
  const vip = lab.makeClient('A', 'vip');
  await assert.rejects(() => vip.join(), /VIP verification pending/);
  assert.equal(lab.room.room === null, true);
});

test('real write gates default closed and do not instantiate world', async () => {
  const lab = stagingLab();
  await lab.ready();
  const before = await handleV16Request(new Request('https://preview.test/api/v16/join', {
    method: 'POST', body: '{}',
  }), { ...lab.env, ENABLE_V16_WRITES: 'false' });
  assert.equal(before.status, 403);
  assert.equal(lab.room.room, null);
});
