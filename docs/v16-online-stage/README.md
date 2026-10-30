# Treasure Hunt 2D — V16 online foundation (staging only)

This package preserves the approved V16 Calm Motion view (not the retired V8 artwork). The `src/island-map-v14.mjs` and `src/forest-map-v17.mjs` modules were extracted byte-for-byte in logic from the approved V16 HTML, to ensure server/client map consistency.

**What is implemented:** Cloudflare Worker + Durable Object staging scaffold, canonical 100×100 V16 forest, 200 shared coin sites, coin pickup +1 (60s cooldown), shared Lucky Box (4h cooldown) with exact 100/500/1000/5000/10000 prize odds, one-winner claims, server-computed analog movement and collisions, no player avatars disclosed, Free weekly and VIP daily period bookkeeping with winner snapshots. The Worker checks Firebase ID and App Check signatures and requires a separately trusted disabled/revocation status service and rate limiter. Tests exercise two competing players, replay prevention, expiry and fail-closed writes. **Shop and VIP real payments remain disabled.**

**What is NOT complete:** This package is not deployed, no browser has been connected to these APIs, no confirmed persistent production leaderboard, no D1 aggregation, and no mobile/load test of the online server. The code is an initial prototype and requires security, concurrency, durable alarm/backup, billing, and load review before production. There is currently no proof of 10,000 users.

## Safe rollout

1. Review and merge an isolated PR only after tests pass.
2. Set up an isolated staging Worker and SQLite-backed DO (new class), review Cloudflare Workers/Durable Objects free-tier and billing limits first.
3. Bind `ROOMS`, `ACCOUNT_STATUS`, and `V16_RATE_LIMITER`; configure approved `ALLOWED_ORIGIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_NUMBER`, and `FIREBASE_APP_ID`. `ENABLE_V16_WRITES` must remain `false` until all verification gates pass.
4. Test real Firebase Google sign-in, enforced App Check, disabled/revoked account rejection, two browser claims, DO eviction/restart persistence and season resets.
5. Implement secure VIP membership verification and real 20/10 THB x2 entitlement checks; no paid checkout until Slip2Go verified and idempotent.
6. Stress test staging without promising 10k performance; one DO per Free/VIP cannot guarantee 10k requests per second. Design sharding or event aggregation as needed.

*Public leaderboard must never display emails; no cross-server score sharing.*
