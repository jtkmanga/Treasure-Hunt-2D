# Fix Cloudflare App Check JWKS HTTP 503 — 2026-10-29

## Confirmed root cause (real Worker runtime)

The Android test reached Google Login and obtained App Check Token on device but Cloudflare server returned 503 (JWKS fetch failed). A temporary, limited Staging-only public-JWKS probe reproduced `FETCH_THROWN` in the Cloudflare Worker. It reported:

> TypeError: Invalid redirect value; must be one of follow or manual (error is unsupported at the edge).

This was due to `fetch(..., {redirect:"error"})` in the Worker Firebase App Check JWKS verifier — NOT the Firebase public JWKS URL or reCAPTCHA Enterprise Site Key.

Replacing unsupported `redirect:"error"` with `redirect:"manual"` (and keeping `if (!response.ok) throw`, which fails closed on HTTP 3xx) fixed the Worker probe. The GitHub Runner, through the live Staging Worker, confirmed:
`{"ok":true,"code":"JWKS_FETCH_AND_RSA_IMPORT_OK","keyCount":5}`.

## Permanent fix

- Use `redirect:"manual"` in Worker outbound requests to Google's App Check public JWKS and the future disabled/revoked account lookup API.
- Keep public-key JSON checks, RSA signature verification, issuer/audience/subject and expiry checks unchanged.
- The temporary unauthenticated public-key runtime probe is **NOT** shipped in this branch or final Worker deployment. It was restricted to exact Pages Origin and native IP limiter while diagnosing.
- Continue to fail closed on HTTP 3xx/4xx/5xx. No redirection to arbitrary hosts, no tokens logged or returned.
- No changes to App Check Firebase Enforcement, Google Login flow, score-write permissions, D1 bindings, payments or VIP.

## Live verification remaining

Unit tests and public JWKS fetch/import now pass. A full end-to-end App Check signature with a genuine Android token is not yet verified, so the owner should retap `ยืนยัน App Check กับ Staging API` on the current Pages login after the cleaned Staging Worker is deployed. Do NOT share raw tokens.

No reCAPTCHA Site Key rotation, additional Billing, or Cloudflare Worker plan upgrade is necessary for this fix.
