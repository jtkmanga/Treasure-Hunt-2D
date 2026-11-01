# V16 Score Audit — Staging Gate 2

## What is implemented

- Each verified **successful** server-authoritative coin or Lucky Box collection adds one private audit entry to the same persisted `v16-state` as the score, pickup cooldown, and request replay receipt.
- The event contains monotonic per-room ID, Firebase UID, room ID, season, award type, coin ID if applicable, amount, resulting score, request ID, claim sequence, and trusted server timestamp. Each room holds the latest **256** events; an authenticated administrator may request up to the latest **50** (UI shows 40).
- Duplicate receipt retries, missed pickups, and denied movement do not create a second audit event. Failed `v16-state` storage writes roll back the award and audit together.
- Old room snapshots without audit keys restore safely **without fabricated historical events**. The initial audit therefore cannot reconstruct scores earned before this deployment.
- The existing Free weekly and VIP daily Bangkok reset/previous-winner logic is unchanged. Audit IDs remain monotonic across resets and avoid reusing old event identifiers.
- Player world and leaderboard responses never include audit entries, UIDs, claim IDs, or private admin audit state.

## Access controls

- The **only** API returning private entries is `GET /api/v16/admin/audit?scope=free&room=preview` (or `room=free`). It uses existing Google Firebase ID verification, App Check, beta UID allowlist, Firebase account-enabled/revocation check and native rate limiter.
- Additionally it requires **both** `ENABLE_V16_ADMIN_READS=true` and `V16_ADMIN_UID` secret matching the verified Firebase UID. Missing/invalid config fails closed (HTTP 403). The Admin Audit section on `/beta-login` stays hidden when the server rejects the role.
- **Current Staging:** `ENABLE_V16_ADMIN_READS=false`. No admin UID is installed by this PR. No one is granted audit access automatically. Do not commit UID, personal email or API secrets.
- Admin view is read only. No score editing, reset, user bans, VIP or payment actions are provided by this milestone.

## Launch blockers

- The window retains 256 recent events **only**. Public ranked competition needs an immutable, complete journal in separate durable storage, periodic archival/checkpoints, retention policy, encrypted backups, hash/sequence integrity validation, and measured storage costs.
- Need secure administrator enrollment/revocation, privacy policy for UID/account correlation, audit access logs, and full permission review before switching flags.
- Free public writes remain gated: `ENABLE_V16_WRITES=false`. Beta room and coin pilot remain separate from the actual Free league.
- No change to V16.26 joystick, reconciliation, Lucky Box odds, real public ranked scores, or payments.
- Validate new staging Worker *and* Durable Object code by verifying `scoreAudit:private-audit-v1` on /api/v16/health and /api/v16/preview/protocol after immediate DO deployment, and rerun live smoke.
