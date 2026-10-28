# Staging App Check server-side validation, read-only

The Android test obtained a Firebase App Check token. This change adds a separate `GET /api/v1/appcheck-verify` diagnostic to the existing Google Login staging Worker, while preserving `GET /api/v1/me`.

Both a signed Firebase ID token (Authorization) and signed Firebase App Check token (X-Firebase-AppCheck) must verify. The backend pins the exact 2D Firebase project and Web App IDs, validates the App Check token with the official Firebase JWKS, and uses the same exact Pages Origin check and native Cloudflare rate limiter as existing /me. The response reports `appCheckVerified:true` but `accountStatusVerified:false` because checking disabled/revoked users is a separate gate still outstanding.

All scores, purchases, VIP, admin and database writes remain disabled; the worker has no D1 database binding.

IMPORTANT: a screenshot of a successfully fetched App Check token does not prove server verification. Wait for passing GitHub CI and limited mobile testing before considering this gate complete. Do not enable App Check Enforcement, force-refresh, WebSocket, or paid services. The request budget remains approximately 6 verifications/60s/IP/colo, not a guaranteed account spend cap.
