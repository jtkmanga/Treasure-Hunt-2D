# Private-only Google Login verification staging gateway

The existing mobile test proves Firebase Google sign-in works. The button to verify with Cloudflare Staging stays disabled because the Workers.dev URL and STAGING_API_ORIGIN are both disabled. This PR prepares a narrow gate, not an active public service.

The gate permits only GET /api/v1/me and OPTIONS preflight; all score, leaderboard, run, VIP, payment, and admin routes return 404. It requires an exact matching 2D Pages Origin and a valid Google-issued Firebase ID token (signature and claims handled by existing code). Before calling Google's certificate endpoint, it requires a native Cloudflare rate limiting binding and an IP. Missing or failed binding yields 503; exceeded limit yields 429. Rate limiting is approximate per Cloudflare location, and is NOT a hard monthly spending cap.

The gate does NOT check revoked or disabled Firebase users or App Check and cannot authorize any score or payment. A valid signed token alone is not proof of active account state.

To proceed after explicit approval: first confirm Workers Free plan, configure the rate limit binding with six checks per 60 seconds per client IP, deploy only this new entrypoint to 2D Staging, and enable the separate Staging Workers.dev URL only for a controlled supervised test. Then set a reviewed 2D Staging endpoint into the login preview, rebuild the Pages ZIP and test from mobile. Stop immediately if requests are unexpected. The existing public Pages game is unchanged and the original GPT-VOXEL-3D is untouched.

No score write routes or Cloudflare changes are included in this PR.
