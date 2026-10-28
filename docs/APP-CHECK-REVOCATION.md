# Next step: App Check + revoked/disabled user verification (not deployed)

## Why

The user's Android screenshots confirm that the original Firebase ID-token verification works. The existing Cloudflare worker `treasure-hunt-2d-staging-api` still runs the identity-only gateway from PR #6/#7. **This branch does not replace that working gateway.**

An ID token signature proves that a token was issued by Firebase. It does not establish that the user is *currently enabled* or that a refresh token/session was not revoked. An attested app token adds another protection layer, but does not prove that a human actually played the game.

## Added: hardened optional gateway

- `src/online/firebase-hardening.mjs` verifies Firebase App Check RSA signature against Google's JWKS, checks JWT RS256, JWT type, issuer, audience, expiry, project number and exact registered 2D web app ID.
- It then uses the documented Firebase Identity Toolkit `accounts:lookup` REST API with the **user's own validated ID token** and the project's Firebase Web API key, and checks matching UID, `disabled`, `validSince` and `authTime`. Missing status, network failures and invalid data fail closed.
- `src/online/hardened-staging.mjs` wraps existing read-only, Origin-scoped, rate-limited `GET /api/v1/me`. The current gateway's score/shop/VIP/payment/admin routes remain unavailable.
- New tests cover legitimate signatures, forged signatures, wrong project/app, stale or revoked users, missing App Check, disabled account, fail-closed networking, and no access to scoring.
- No new D1 write or resource; does not require service-account private keys.

## Prerequisites before activation

1. In **Firebase Console → Security → App Check**, register the new 2D **Web app** with a **reCAPTCHA Enterprise score-based web site key** for `treasure-hunt-2d-jtk.pages.dev`. Check Google Cloud's no-cost quota and do NOT attach Billing or upgrade the Firebase Spark project without approval. The site key is public; the service-account private key is NOT.
2. Add App Check to the 2D web login SDK with `initializeAppCheck(app, {provider:new ReCaptchaEnterpriseProvider(PUBLIC_SITE_KEY),isTokenAutoRefreshEnabled:true})`. Call `getToken(appCheck)` on verify, and pass the token through `X-Firebase-AppCheck` over HTTPS. An example is provided in `src/client/appcheck-prep.mjs`, but it is not activated in V1.
3. Store the actual 2D Firebase Web API key as a Cloudflare Worker **secret binding** named `FIREBASE_WEB_API_KEY` (even though this key is public, do not log it or commit it). Exact 2D app ID and project number are known from owner's screenshot and validated in the hardened wrapper.
4. Update Staging preflight CORS allowed headers to include `X-Firebase-AppCheck` before switching the gateway; test on actual mobile Chrome and Samsung Browser. **Do not enable App Check enforcement in Firebase Auth** until client rollout succeeds and metrics look healthy.
5. Test valid user, disabled user, revoked token, invalid App Check token and rate limits using the private Staging Worker. Revoke/disabled tests require a separate consenting test account; never disable the owner's Admin account.
6. Only after end-to-end tests should we consider replacing the current identity-only handler with `hardened-staging.mjs` in Staging. No user profile or competitive score/paid reward should become writable in this step.

## Risks and cost

- The Identity Toolkit status lookup adds **one Google API request per authorized identity check** and may be billable/rate-limited under Google's service limits. The App Check provider may also generate **reCAPTCHA Enterprise assessments**; check no-cost quota before using it widely.
- Cloudflare native rate limiting is approximate, not a hard global cap. This gate must stay small and read-only with no WebSocket, no 3D production data, no payment, and no score-write endpoints.
- Docs: https://firebase.google.com/docs/app-check/custom-resource-backend and https://firebase.google.com/docs/reference/rest/auth

**Current live result:** Signed Firebase Google Login ✓. App Check and live user status checks **NOT configured or live**.
