# Forest V8 implementation status — 2026-10-30

## Implemented on feature branch (NOT in production)
- /forest-v8/ standalone mobile practice: only one 100×100 forest, no 3-minute timer, V7 original sprites retained, Free/VIP practice selector, minimap caching, 200 reachable coin sites and 1-minute respawn, one local Lucky Box and four-hour respawn.
- Lucky Box prize window with 100 / 500 / 1000 / 5000 / 10000 coins at exact 50% / 30% / 19% / 0.9% / 0.1% distribution. This preview is local and does not credit actual online accounts.
- Score equals map-coin count (+1/pickup) plus chest rewards, with no extra score currencies. The live shop UI lists coin ×2 for 20 THB and speed ×2 for 10 THB, both 24 hours, but intentionally disables checkout.
- Server-side pure rules test module in src/online/forest-contest-core.mjs (not exposed via HTTP) with validated movement, per-server state, contested claims, VIP entitlement gate, verified-purchase contract, 24h expiry, daily/weekly seasons.
- New db/forest-v8.sql is a **staged** migration only (not applied), including score-event dedupe, payment transaction uniqueness, booster entitlements and winner snapshots.
- CI test suite and safe static ZIP packaging in .github/workflows/forest-v8-preview.yml; old /ranked-preview V7 remains unchanged for regression tests.

## NOT implemented / NOT validated
1. No authoritative shared coin/chest state across browsers yet; this requires a stateful Durable Object per server with persistence and coordination plus sharding for larger scale.
2. No public score-writing API, authenticated Firebase/App Check score receipt, leaderboard subscription/polling, or tested production reset scheduler. Current API deliberately stays read-only.
3. No live payment verification; QR/Slip2Go secret/key, bank receiver matching and backend authorization not configured for new V8 shop; never mark paid merely from client proof.
4. No D1 migration applied or paid entitlements persisted online.
5. No online multiplayer/10K capacity proof, full mobile browser visual QA, or launch authorization.

## Cloudflare read-only account inspection 2026-10-30
- Existing Worker: treasure-hunt-2d-staging-api
- Existing D1 database: treasure-hunt-2d-staging
- The staging Worker settings inspected had no DB or Durable Object binding.
- No Treasure Hunt 2D Durable Object namespace was listed in the account.
- Do not create paid resources, change production, turn on real payment or deploy protected endpoints without authorization and security/cost review.

## Safe next phases
1. Manually test the V8 ZIP on mobile (landscape joystick, 100×100 minimap, coins, chest); compare FPS to V7.
2. Add a D1 binding and migration to an isolated staging worker with backup; create scoped per-server Durable Object state and authenticated endpoints using verified Google ID tokens, enforced Firebase App Check, revoked/disabled-account checks, rate limiting and server-side positions.
3. Add atomic (one-pickup-one-owner) storage, replay-safe score events, periodic leaderboard snapshots/queries, season winner records and reset schedules. Plan zone sharding before large load.
4. Implement provider-verified Slip2Go order lifecycle including amount/receiver/time and unique transaction constraints; activate boosts only after confirmed bank transfer and store expiry. Roll out canary before public release.
5. Run 2-client concurrency, mobile visual, cold restart/persistence, payment, and load/10K tests; inspect Cloudflare bills/quotas before widening.

Official Slip2Go references:
- https://slip2go.com/guide/rest-api/base64
- https://slip2go.com/guide/response
