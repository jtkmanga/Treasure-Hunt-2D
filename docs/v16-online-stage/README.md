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

## Continued implementation (2026-10-31)

- `tests/v16-two-browser-api.test.mjs` simulates two independent browser adapters sending signed-staging requests through `handleV16Request` into the **same** serializable Durable Object. A contested map coin and the single Lucky Box grant **one award only**; both clients receive the same shared coin/chest snapshot. The test validates origin, auth, VIP restrictions and disabled write flags. **Simulation only:** no public DNS, real Firebase tokens, real DO, or phone browser was exercised.
- `src/v16-online/worker.mjs` now protects failed DO writes: if persisting an accepted coin/chest claim or leaderboard/season change fails, it reconciles the last durable state and returns HTTP 503 rather than confirming phantom points. If durable state cannot be read, the instance fails closed rather than accepting further mutations.
- `tests/v16-storage-failover.test.mjs` simulates storage write/read outages. A failed claim remains uncredited and may be safely retried using the same request ID and monotonic sequence. Failed midnight reset and public-world rollover recover their persisted winner snapshot before retrying.
- Existing `V16OnlineClient` keeps pending claim request IDs during uncertain network failures; live V16 game remains **unchanged** and offline until an authenticated staging integration is tested.
- GitHub Actions: 17/17 workflows passed for commit `f06973dfa964a22fd86c8485a1598dba8fba12ff`. These results cover code-level tests, not live 10K load or payments.

## Cloudflare staging preflight — blocking checks

1. Verify the Cloudflare account's Workers/Durable Objects billing plan and cost controls with authorized Billing Read or the account owner dashboard. The connected Cloudflare OAuth account returns **HTTP 403 for Billing Read**, so a zero-charge deployment **cannot** currently be guaranteed.
2. Create an **isolated** staging Worker and SQLite-backed Durable Object only after reviewing plan/quotas. Keep `ENABLE_V16_READS=false` and `ENABLE_V16_WRITES=false` until identity and abuse checks pass. Do not reuse or overwrite the existing 3D Worker or the public Pages deployment.
3. Wire verified Firebase ID token validation, Firebase App Check enforcement, a real disabled/revoked-account status service, scoped per-UID rate limiting, a restricted CORS origin and VIP entitlement validation. Test fail-closed handling when each service is unavailable.
4. Test two physical browsers end-to-end, then use staged multi-client load tests to measure DO throughput and compute/storage/network costs. A single DO per server and unrestricted per-player polling are **not** proven to scale to 10,000 concurrent players.
5. Move eventual ranked score ledger into a durable database/event log before opening public competition, and independently verify Slip2Go payment confirmations for 20/10 THB boosts; public payments remain OFF.

Never merge/roll out this staging foundation as a production game without these checks.

## Live Free-plan Staging milestone (2026-10-31)

The account owner supplied a Cloudflare Billing > Subscriptions screenshot that shows **Workers Free — Active** with **no payment method on file**. Current official Cloudflare pricing documentation confirms SQLite-backed Durable Objects are supported on Workers Free, where requests/storage/compute have hard daily/total limits; the service rejects over-quota operations rather than billing paid overages. See https://developers.cloudflare.com/durable-objects/platform/pricing/ and https://developers.cloudflare.com/workers/platform/pricing/.

- Using Cloudflare's authenticated API, deployed an **isolated new** Worker `treasure-hunt-2d-v16-world-staging`, copying the seven GitHub source modules from this feature branch, with SQLite-backed DO class `V16WorldRoom` and binding `ROOMS`.
- Both `ENABLE_V16_READS=false` and `ENABLE_V16_WRITES=false` in deployed bindings; only `ALLOWED_ORIGIN=https://treasure-hunt-2d-jtk.pages.dev` configured. No account status, Firebase, App Check enforcement configuration, VIP verifier, or paid checkout is active; write operations remain closed.
- The new workers.dev subdomain is enabled for this **separate staging Worker only**. Source deployment version at initial upload: `4a4314b4-9e54-48f9-96ca-2b69da626390`.
- **Live safety verification:** GitHub Actions workflow `V16 live staging closed-gates smoke test` run `41156651978` succeeded. It checked health HTTP 200, anonymous world GET HTTP 403, anonymous score POST HTTP 403, and untrusted-origin HTTP 403. This does **not** establish verified multiplayer, account login or production readiness.
- GitHub-source gameplay modules and V16-approved HTML remain untouched in production. Staging DO is isolated from the previously deployed 3D game and existing 2D Pages project.

**Next:** configure *real* Firebase Google ID/App Check, account-status/revocation verifier, rate limiting and beta access controls. Test two actual phone browsers with writes enabled only for verified beta accounts; preserve the disabled-by-default production posture. Monitor quota usage. Do not promote to public or enable real payments until validation is complete.
