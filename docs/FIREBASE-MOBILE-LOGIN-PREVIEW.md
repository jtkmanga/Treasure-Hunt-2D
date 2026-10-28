# Google Login mobile preview — Firebase configured by owner

The owner showed Firebase screenshots verifying:
- Firebase project ID `treasure-hunt-2d` (separate from GPT-VOXEL-3D)
- A Web App with messaging sender ID `439998873632`
- Google provider **Enabled**
- Authorized domains includes `treasure-hunt-2d-jtk.pages.dev`
- Firebase Spark free tier shown in console

The API key is not fully visible in screenshots; do **not** guess it or enter an incomplete key. The mobile test page therefore supports pasting the **public web Firebase configuration** directly from Firebase Console. It parses the snippet as text without executing it. Values live only in the web page's memory, are not logged or sent to our server, and are cleared from the textarea after successful SDK setup.

## How to prepare a test ZIP
GitHub Actions workflow `Package 2D login preview ZIP for manual Pages upload` packages the existing V1 `index.html` unchanged, plus `login/index.html`, `login/login.mjs`, and `src/client/firebase-login-core.mjs`. No private backend code, credentials or firebase-config.json are included.

Download the Actions artifact as a ZIP, and manually upload it to the existing `treasure-hunt-2d-jtk` Pages Direct Upload project. This replaces the static deployment with the same V1 game page and adds `/login/` preview. There is no GitHub auto-deploy or Cloudflare billing action.

In the Firebase Console, Project settings → General → Your apps → Web App → SDK setup and configuration → Config; use the copy icon to copy the full `firebaseConfig` code. Then open `https://treasure-hunt-2d-jtk.pages.dev/login/`, paste the public **Web SDK config**, tap the **use config** button and then Google Login. The app checks the project ID and sender ID, signs in using the popup, and displays sign-in only. Use a real Android Chrome/Samsung Browser to confirm popup behavior.

The staging API domain is *still disabled* and the check-against-Worker button is intentionally unavailable. No scores, purchases, VIP, or payment endpoints were activated.

If the mobile sign-in fails, capture only the safe error UI (no tokens or service credentials). For browser privacy, avoid pasting Firebase private service-account JSON (different from public web config).
