# Google signed-in account active/revocation Staging gate (source-only)

Owner confirmed that on Android the public Cloudflare 2D Staging Worker has cryptographically verified the Firebase App Check token. The last UI message expressly said account revocation/disabled checks are not yet enabled.

This source-only feature prepares a NEW read-only `GET /api/v1/account-status` endpoint, preserving the existing `GET /api/v1/me` and `GET /api/v1/appcheck-verify`.

**Pipeline:** exact 2D Pages Origin → GET and native rate limiter → signed Google ID JWT → signed App Check JWT → identity UID match → request to Firebase Identity Toolkit `POST /v1/accounts:lookup` with the *same verified user's ID token*, read-only → reject if account disabled, `validSince` exceeds signed `authTime`, missing account or UID mismatch. Result is `accountStatusVerified:true` ONLY after all stages pass.

The original ID-token verifier already validates JWT `auth_time`. This read-only gate intentionally re-verifies its JWT signature before account-status lookup because the existing attestation response does not expose authTime. It performs one additional Identity Toolkit lookup per permitted verification. It never caches active status (to avoid stale revocation decisions), and never logs or displays raw credentials. It cannot award coins, scores, VIP membership or process payments.

**Activation blockers:** `FIREBASE_WEB_API_KEY` is not configured on the current Staging Worker. Obtain the public Web API key from the *independent 2D Firebase Project settings → Your apps → SDK setup → Config*. The owner should add it as Cloudflare Worker **Secret** under `treasure-hunt-2d-staging-api` using mobile Dashboard; do not send it in chat or commit it. Some web API keys are configured with HTTP referrer restrictions and may reject requests from Workers; if so, create a separate Google API key scoped to Identity Toolkit API and limit usage before testing.

**Not deployed:** This branch does not alter Cloudflare Worker, Pages, Firebase Auth rules, App Check enforcement, quotas, billing or D1. Do not deploy until after review and separately controlled real mobile test. Never disable/revoke the owner's main admin account to test. Use a disposable consenting test account for negative live checks.

Docs: https://firebase.google.com/docs/reference/rest/auth and https://firebase.google.com/docs/auth/admin/manage-sessions .
