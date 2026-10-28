# App Check mobile one-tap trial — source only (2026-10-28)

The owner registered Firebase App Check for the separate 2D Web App in Firebase Console using Fraud Defense / reCAPTCHA Enterprise. The status showed **Registered**. This is not proof that its SDK, site key, or Worker-side attestation has been tested. The existing Pages V1 is unchanged, and Google Login's previous identity-only Staging Worker continues to run (no App Check verification yet).

## What is implemented

- Mobile Login page provides an **optional public reCAPTCHA Enterprise Site Key** input alongside the existing Firebase Web Config. Both stay in page memory; the textarea/key input is cleared after setup and nothing is pushed to GitHub or sent to ChatGPT.
- If the site key is entered, Firebase App Check initializes **before Firebase Auth** using ReCaptchaEnterpriseProvider with **isTokenAutoRefreshEnabled:false**.
- The extra **ทดสอบ App Check หนึ่งครั้ง** button is enabled only when a user is signed in and App Check initialization succeeded. Only an explicit tap invokes `getToken(appCheck, false)`, which uses a valid cached token when available instead of always creating a new assessment.
- The page never displays, persists, logs, or forwards raw App Check tokens to the current API. It says **App Check Token obtained on device, not verified by Staging Worker**.
- Existing Google /api/v1/me sign-in verification still works as a separate test. Score writes, VIP/payments and Firebase App Check Enforcement remain off.

## Phone test steps after reviewing the source and uploading the tested ZIP manually

1. In Google Cloud Console (same `treasure-hunt-2d` project), open reCAPTCHA > Keys and copy only the **public Site Key / Key ID** you registered, not any secret. Do not send token, password, Service Account, or admin key to chat.
2. In Firebase Console, leave App Check **Enforcement OFF** for every service.
3. Download the GitHub Actions artifact from this branch (`treasure-hunt-2d-appcheck-on-demand.zip`). The ZIP includes exactly `index.html`, `login/index.html`, `login/login.mjs`, `src/client/firebase-login-core.mjs`, and `src/client/appcheck-prep.mjs`.
4. Upload the ZIP to the existing `treasure-hunt-2d-jtk` Pages Direct Upload project. The V1 game HTML is identical to the previous deployed version.
5. Open https://treasure-hunt-2d-jtk.pages.dev/login/ on Android Chrome or Samsung Browser. Paste the Firebase Web SDK config and the public Site Key **before** clicking `ใช้ Firebase Web Config ที่วาง`.
6. Sign in to Google and tap **ทดสอบ App Check หนึ่งครั้ง**. The expected status is `App Check Token ได้รับสำเร็จบนมือถือ • ยังไม่ได้ตรวจโดย Staging Worker`. Do not repeatedly tap; keep request volume low.
7. The separate **ตรวจสอบบัญชีกับ Staging API** button verifies only the Firebase ID token. An App Check success on device does not establish that the server checks it.

## Still blocked

- Worker-side hardening from Draft PR #8 is not deployed. It requires a securely configured 2D `FIREBASE_WEB_API_KEY` binding, server CORS support for `X-Firebase-AppCheck`, actual signed App Check token testing, and disabled/revoked account testing with a separate user.
- Account billing could not be read via Cloudflare connector. Firebase Spark is shown in prior console, but Google Cloud billing/project assessment usage should be monitored. reCAPTCHA Enterprise has a free allowance; it is not unlimited for continuous 1,000-player use.
- Do not enable Enforcement, production competitive score writes, or payments. No auto-refresh is turned on for the preview; this is intentionally not the final production behavior.

References:
- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/reference/js/app-check
- https://firebase.google.com/docs/app-check/custom-resource-backend
