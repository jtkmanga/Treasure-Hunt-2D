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


## Closed Beta authentication / safe Cloudflare update (31 Oct 2026)
- Existing 2D staging Worker publicly exposed settings establish Firebase project ID `treasure-hunt-2d`, project number `439998873632` and web app ID `1:439998873632:web:4b694f8159d9d9e0163c45`. These are project identifiers, **not secrets**, and are now in the isolated V16 Wrangler config.
- The existing 2D staging API has a `FIREBASE_WEB_API_KEY` **secret binding**. Its value was NOT retrieved or copied. The new V16 Worker needs its **own** `FIREBASE_WEB_API_KEY` secret for live account lookup; do not put keys in GitHub source or conversation.
- `src/v16-online/beta-access.mjs` requires a secret `V16_BETA_UIDS` with 1–10 unique Firebase UID strings, separated by commas. Empty, duplicate, invalid, over-limit, or wildcard entries fail closed. Authenticated Google accounts must be email-verified and UID-invited to read shared world or write scores. `V16_BETA_UIDS` is **NOT configured yet**.
- `src/v16-online/live-account.mjs` calls the official Firebase Authentication `accounts:lookup` endpoint using the already-verified player's Firebase ID token and project Web API key. It compares `localId`, `disabled`, `validSince` vs verified `auth_time`, and `emailVerified`. A missing or untrusted provider response denies access. This requires the API key to be set in the new V16 Worker. The project allows an existing trusted ACCOUNT_STATUS binding as an alternative.
- Worker read and write routes both require Firebase signature verification, Firebase App Check, UID invite, active account status and a rate-limit binding before reaching any Durable Object. VIP remains hard disabled until verified entitlement exists.
- Configured Cloudflare native `V16_RATE_LIMITER` at 360 requests per 60 seconds per key, with separate `world:UID` and `write:UID` keys. **Cloudflare native limits are approximate per data center**; not a substitute for strict financial transaction controls.
- Updated the isolated Staging Worker `treasure-hunt-2d-v16-world-staging` with 9 source modules, existing DO class, and native rate limiting. Migration tag advanced from v1 to v2 with no new/removed Durable Object class. Verified Cloudflare settings: `ROOMS` and `V16_RATE_LIMITER` bound; real Firebase project settings present; `ENABLE_V16_READS=false` and `ENABLE_V16_WRITES=false` remain enforced. No 3D or public Pages changes; no payment changes.
- Tests added: `tests/v16-beta-access.test.mjs`, `tests/v16-firebase-live-account.test.mjs`, and expanded `tests/v16-staging-live-smoke.test.mjs`. Unit tests use simulated Firebase responses. Live smoke only proves health/rejection; **real Google logins and App Check tokens have NOT been exercised yet**.

### To activate a 2–10 player Closed Beta later
1. On the new V16 staging Worker, configure `FIREBASE_WEB_API_KEY` as a Cloudflare Secret (using the *same Firebase project's* Web API key); do not disclose it in chat or commit it to the repo.
2. Configure `V16_BETA_UIDS` as a Cloudflare Secret with the specific invited players' Firebase UIDs from Firebase Authentication > Users, max 10; this is **not** an email list. Do not set `*` or paste it into GitHub.
3. Keep the feature flags off while testing actual Google ID token + Firebase App Check + live Firebase account lookup using a trusted staging client. Rejected disabled, revoked, unverified or non-invited accounts must stay rejected.
4. Review Firebase App Check quotas and rate-limits, measure Free plan usage, and confirm client can refresh token on mobile before enabling reads. Enable writes only after two physical mobile/browser test accounts can safely join and claim once in the same DO.
5. Run a controlled pilot, inspect cost/quota metrics, then decide whether Free-only beta can expand. No 10K public claims until measured; VIP and Slip2Go payment remain offline.


## Live mobile beta-login diagnostic (31 Oct 2026)
- Public entry point: `https://treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev/beta-login` (served by staging Worker; distinct from the V16 game).
- The page runs pinned Firebase Web SDK modules for Google popup sign-in and Firebase App Check reCAPTCHA Enterprise. It accepts **public client identifiers** in two local-only input fields: Firebase Web API Key and matching reCAPTCHA Enterprise Site Key. These fields are cleared after SDK initialization; do not paste any admin/service-account credentials or secrets. No ID Token, App Check token, UID or email appears in a URL or server log by design.
- The web app must use the same project `treasure-hunt-2d` and Web App ID `1:439998873632:web:4b694f8159d9d9e0163c45`. In Firebase Authentication > Settings > Authorized domains, add **`treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev`** if missing, and ensure this host is allowed by the matching reCAPTCHA Enterprise key's domain restrictions and any Google Cloud API-key referer restrictions. Adding this domain is an explicit Firebase console setting and was NOT performed automatically.
- New API `GET /api/v16/auth-check?scope=free` requires Firebase Google ID JWT, App Check token, beta UID allowlist, Cloudflare native rate limiter and live Firebase revocation lookup. It returns only boolean milestones (googleVerified, appCheckVerified, accountActive, betaInvited) after full successful validation; it **never** calls Durable Object, changes score or enables world reads/writes. It responds 401 to unauthenticated requests even when world read/write feature flags are OFF.
- No secrets were retrieved or copied from the Cloudflare account. During updating the existing isolated Staging Worker, the API metadata explicitly set `keep_bindings: ['secret_text']` to preserve `FIREBASE_WEB_API_KEY` and `V16_BETA_UIDS` already saved by the user. Verified after deployment both remain secret bindings; both `ENABLE_V16_READS=false` and `ENABLE_V16_WRITES=false`; existing DO and limiter preserved. Migration tag v2 -> v3 with no class changes.
- `tests/v16-beta-login-page.test.mjs` validates read-only authentication, invited Google provider, app check, account status, score flags OFF, denied anonymous/VIP/CORS/rate limit, and no DO side effects. Live `tests/v16-staging-live-smoke.test.mjs` verifies deployed HTML status and unauthenticated 401 on auth-check. GitHub Actions workflow `V16 live staging closed-gates smoke test` run `41158681568` completed successfully.
- A live successful Google sign-in **has not yet been verified on a user's phone**. Mobile popup blockers / unauthorized Firebase domains / reCAPTCHA domain restrictions may require changes. Test while keeping API world flags OFF. Do NOT activate public scores or real payments based only on this diagnostic result.


## 2026-10-31 — Mobile Google Popup recovery
- User screenshot confirmed V16 Staging Worker already appears in Firebase Authentication → Settings → Authorized domains; the login screen showed cleared key input fields and an enabled Google login button, but no signed-in user. That screenshot **does not prove** which Firebase OAuth failure occurred.
- Updated `src/v16-online/beta-login-page.mjs` to render Firebase initialization status and Google popup errors **immediately adjacent to the Google button**, rather than only in the third section below the mobile viewport. Popup-specific diagnostics include blocked, closed, unauthorized-domain, network, operation-not-allowed, and invalid-api-key results.
- Added a user-initiated `signInWithRedirect` fallback with `getRedirectResult` and session-only storage of **public** Firebase Web API Key and public reCAPTCHA Enterprise Site Key. The browser clears the visible fields after initialization. Firebase warns that redirects on non-Firebase-hosted sites can fail on modern browsers with third-party storage restrictions; a reverse proxy / Firebase Hosting custom domain may be required if popup and redirect both fail (https://firebase.google.com/docs/auth/web/redirect-best-practices).
- Added `tests/v16-beta-login-mobile.test.mjs` to validate actionable status display, redirect callback wiring, absence of localStorage, and browser-side module JavaScript parsing.
- Updated only the isolated Staging Worker (migration tag v3 → v4 with no DO class changes) with `keep_bindings:['secret_text']`. Cloudflare verified the bindings `FIREBASE_WEB_API_KEY`, `V16_BETA_UIDS`, `ROOMS`, and `V16_RATE_LIMITER` still exist; both read/write feature flags remain `false`. No payments, production, or gameplay edits.
- Live HTTP smoke test workflow run `41159806246` passed. The expanded tests verified `/beta-login` actually serves the new popup error/redirect markup, and the auth-check route stays protected. Full GitHub Actions 19/19 passed at commit `6b01b21e6fd585eeba6af376c9b896e0e050695e`.
- A successful Google OAuth login on the user's Android browser is **not yet confirmed**. Next user step: reload `/beta-login`, press Google, inspect the immediate message. If blocked/closed, try the alternate redirect button or allow popups, then return the exact error message (no token/key).
