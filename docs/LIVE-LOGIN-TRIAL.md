# Controlled live Google Login Staging trial — 2026-10-28

The owner approved opening a limited Google identity-verification Staging API after mobile Firebase sign-in passed.

A Cloudflare Worker named `treasure-hunt-2d-staging-api` was updated with the `staging-verification.mjs` gated entrypoint and only the `handler.mjs`, `firebase-auth.mjs`, `periods.mjs` support modules. Its **native LOGIN_RATE_LIMITER** binding is configured for about **6 requests per 60 seconds per IP per Cloudflare location** (not a strict global cap). Firebase project ID is `treasure-hunt-2d`, Pages origin is pinned to `https://treasure-hunt-2d-jtk.pages.dev`. D1 was NOT bound to the verification-only Worker, and its route checks accept only GET /api/v1/me. A valid signed Firebase ID token is needed; no score, runs, leaderboard, VIP, payment or admin routes are enabled.

Cloudflare reports `workers.dev` enabled and previews disabled. **Real mobile end-to-end token verification has not yet passed**; the user must test the button after manually uploading the ZIP. A free Workers subscription could not be independently read through this Cloudflare OAuth connection; usage and billing must be monitored.

## Test with the mobile Pages site
1. Download the artifact from the `Package limited login verification preview` GitHub Actions workflow. It contains exactly the previous V1 `index.html` plus `/login/` and the Firebase client module. This test-only change pins `STAGING_API_ORIGIN` to the new 2D Worker; no web config, API key, ID token or secrets are included.
2. Upload the ZIP by **Create new deployment** inside the existing Cloudflare Pages project `treasure-hunt-2d-jtk`.
3. Open `https://treasure-hunt-2d-jtk.pages.dev/login/`. If Firebase setup is missing after reloading, copy the public `firebaseConfig` snippet from Firebase Project Settings and paste it again in this session. Do not send the config, ID token or private keys to chat or GitHub.
4. If the Google account state shows successful Firebase login, tap **ตรวจสอบบัญชีกับ Staging API** once. Expected: `บัญชีได้รับการยืนยันโดย Staging`. If it fails, provide only a screenshot of the safe status error. Do not send tokens.
5. If Cloudflare shows abnormal request counts or error spikes, disable the Worker subdomain; keep the original Pages game V1 unchanged.

Caution: the endpoint still does not verify revoked/disabled Firebase accounts or App Check, and must NOT authorize competition score writes or monetary rewards. HTTP Origin and per-IP throttling do not alone stop a determined scripted attacker; no hard spending guarantee is possible while publicly enabled.

No GitHub branch merge, production 3D deploy, database write or payment action in this change.
