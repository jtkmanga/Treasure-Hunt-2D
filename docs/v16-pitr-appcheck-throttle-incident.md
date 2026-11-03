# V16 PITR Admin: App Check 403/throttled incident (3 Nov 2026)

## Evidence

- Android Staging Admin Audit continued to show **9 stored / 9 compared** with consistent scores, including latest score 1517.
- Owner tried the synthetic-only recovery button and received `appCheck/throttled` with an almost 24-hour wait after a previous attestation HTTP 403. The client-side Firebase SDK error **does not prove the SQL restore failed**.
- Another attempt displayed a generic message “recovery not verified.” This was ambiguous: the old UI asked for confirmation **before** obtaining an App Check token, and hid the HTTP/response details.
- A **read-only Cloudflare SQL query** of the fixed synthetic DO `__treasure_hunt_2d_pitr_only_20261103_7b82cf__` found `v16_pitr_synthetic_probe` with one SQL row `score=123,marker=baseline`. This is compatible with *either* initial state or restoration; alone it cannot prove that Key-Value was restored or a successful completion marker was recorded.
- An attempt to inspect Cloudflare's private `_cf_KV` table via SQL was rejected with `SQLITE_AUTH`; no private KV contents were exposed.
- Security response: temporary Cloudflare secret `ENABLE_V16_RECOVERY_DRILL` reset to `false` on Staging. Existing Admin read, enrollment lock, Firebase/App Check, Free Production write flag and movement V16.26 remained unchanged.

## UI and diagnostic improvements

- Obtain Google ID and App Check token **before** displaying the manual PITR confirmation. If Firebase rejects issuance, show “Restore command was not sent”; never falsely label this a restore failure.
- On an `appCheck/throttled` or `appCheck/initial-throttle` error, show actionable Thai explanation and disable retry for the current page session. Do not bypass Firebase verification, lower security thresholds or silently resubmit after a cooldown.
- After POST, if server refuses or response is lost, show **uncertain outcome** and HTTP/error reason instead of claiming that data is damaged or silently retrying a potentially destructive call.
- Add private, read-only synthetic SQL+KV inspection to the existing authenticated Admin Audit response: `not-started`, `baseline-unverified`, `changed-unverified`, `completed` or `state-mismatch`. A baseline SQL+KV value alone **never** counts as a proven restore.
- No new public endpoint for Restore or synthetic state. The existing fixed-name DO guard and signed/pinned Admin-only POST remain.

## Firebase App Check root-cause follow-up (outside GitHub/Cloudflare API access)

Check the active Firebase project's **Security → App Check → web app** configuration and its reCAPTCHA Enterprise site key matches the site key entered in the Beta screen. In the Google Cloud project's reCAPTCHA Enterprise settings, verify the **website/score-based key** lists the exact Staging hostname `treasure-hunt-2d-v16-world-staging.hjinffv5426.workers.dev` and Enterprise API is enabled. Check attestation request metrics and risk score configuration. Compare the timestamp of the first HTTP 403 and the `exchangeRecaptchaEnterpriseToken` response without exposing tokens or API secrets.

A cooldown may last about 24 hours following 403. Do not repeatedly retry, use debug tokens in public builds, or disable App Check enforcement to work around it.

## Acceptance still pending

- Firebase attestation successfully issues a valid token again; verify the owner can read private Admin Audit.
- Inspect the synthetic DO state via the signed Admin Audit; if incomplete, use a fresh isolated test object for the next **explicitly approved** restore rehearsal rather than silently reusing a half-finished object.
- Only re-enable the one-time Staging PITR flag after access is confirmed and separate gates pass, then have owner explicitly tap again. Keep Free/VIP/Production state untouched.
- Score restoration is **not yet confirmed**; independent offsite backup and recovery test remain separate launch gates.
