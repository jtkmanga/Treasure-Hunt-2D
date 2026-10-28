# Mobile Google Login staging preview (not deployed)

## Status and safety

This is a self-contained **source-only** sign-in preview. The currently deployed Pages V1 game is unchanged. The login preview is not in the deployed ZIP and cannot credit score, open VIP access or charge money.

The new login page is login/index.html, with an optional public Firebase web config fetched from ../firebase-config.json (not committed). If config is absent or fails validation, the Google Login button stays disabled. The API verify button stays disabled until a dedicated staging Worker is explicitly enabled; the Worker is currently PRIVATE. Do not redirect ID tokens to any GPT-VOXEL-3D endpoints.

The Firebase web config contains client identifiers (including a web API key), not private service-account keys. Still, restrict APIs, authorized domains and App Check before production. NEVER upload Admin SDK service account JSON, OAuth client secret, Slip2Go credentials or Cloudflare API tokens to this PUBLIC repository.

## Set up a NEW Firebase project using only a phone

1. Open https://console.firebase.google.com/ and choose **Add project**. Suggested display name: Treasure Hunt 2D. Turn off Google Analytics unless required. The project ID must be distinct from the old GPT-VOXEL-3D project's ID.
2. Under **Build → Authentication → Sign-in method**, enable **Google** and save a project support email.
3. Under **Project settings → General → Your apps**, choose **Web** (</>), register a web app named Treasure Hunt 2D Web, and copy the **web client config** only (apiKey, authDomain, projectId, appId, messagingSenderId). Do not provide passwords or private keys.
4. Under **Authentication → Settings → Authorized domains**, add **treasure-hunt-2d-jtk.pages.dev** and ensure the default project authDomain is authorized. Popup Google sign-in works best from browsers that permit popups; avoid default cross-site redirect flow on browsers blocking third-party storage.
5. Once configured and reviewed, add the web config as firebase-config.json in the **future test-only static deployment**, not the old game's files. A template (invalid on purpose) is in docs/firebase-web-config.example.json. Verify projectId matches the new project and authDomain.
6. Open the *test-only* login/index.html page and test Google sign-in/sign-out on Chrome and Samsung Browser, including blocked popups and unauthorized domains. The test page intentionally does not open the online game.
7. After the staging Worker is safely enabled, set a trusted STAGING_API_ORIGIN in login/login.mjs. Bind the same 2D Firebase project ID to the staging Worker in Cloudflare (public project identifier only). Test GET /api/v1/me with Firebase-issued ID tokens and verify 401 on invalid/expired tokens.

## Important remaining gates

- Validate disabled accounts/revoked sessions and use App Check / anti-abuse controls before accepting scores or purchases.
- Rate limits, independent Firebase project restrictions and 2D/3D data isolation review.
- Connect frontend movement with server-replay engine (currently different map seeds and tick timing), and load-test Workers/D1 within free-tier allowances.
- Do not merge/deploy the backend, open the Worker URL, or enable score writes simply because Firebase sign-in succeeds.

### Documentation

- https://firebase.google.com/docs/web/setup
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/redirect-best-practices

All current work is GitHub-only, with no Cloudflare deploy or billing changes.
