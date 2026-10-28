# Treasure Hunt 2D — Online foundation (Read-only, NOT deployed)

This branch adds a Worker HTTP API foundation, strictly separate from GPT-VOXEL-3D. The live Pages V1 remains unchanged.

## Implemented

- Verified Firebase Google RS256 ID token (audience, issuer, expiry, signature), adapted from the original worker code. Uses FIREBASE_PROJECT_ID supplied at deployment; not a static/shared secret.
- GET /api/v1/health: public read-only status. GET /api/v1/rules: Free Sunday 00:00 and VIP daily 00:00 Thailand time, using competition period IDs instead of resetting individual score records.
- GET /api/v1/leaderboard?scope=free1|vip1: D1 read-only query, parameterized by period ID, sorted top 20; no private emails/UIDs in response. Requires an isolated D1 binding.
- GET /api/v1/me: valid Bearer ID token required. CORS allows only a configured Pages origin.
- Score endpoints (/api/v1/score, /api/v1/runs/start and /api/v1/runs/finish) always return HTTP 403. No score writes, rewards, payments or entitlements.

## Remaining safeguards / requirements

- A separate Treasure Hunt 2D Firebase project and a new isolated D1 database must be provisioned later. Do not copy 3D private credentials, tokens or PII. The sample config under docs/ has placeholders and is intentionally NOT deployable by default.
- Firebase disabled-user/revocation lookup and App Check enforcement are not implemented. Until then the /me endpoint must remain a read-only identity check, not an authorization gate for credits or VIP.
- A browser-controlled score, movement trace or hash cannot be trusted by itself. Before enabling competitive score writes, implement server-verifiable gameplay rules, rate limits, atomic/idempotent reward ledger, monitoring and human-reviewed anti-cheat gates.
- Test Google login in real Android browser and Staging, then test daily Workers Free and D1 quotas; 1,000 users online 24/7 cannot be assumed free.
- This branch does NOT deploy Workers, create D1, alter Cloudflare billing, touch current Pages, publish payment services or merge into main.

## Local checks

Run npm test. It performs existing offline prototype smoke checks and new online endpoint tests. CI only runs tests; no deploy step.
