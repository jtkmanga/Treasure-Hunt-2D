# V16 read-only score journal integrity and PITR readiness

**Release stage:** Closed Beta staging; public ranked writes disabled; administrator audit reads disabled.

## What the validator verifies
- Counts saved SQL award events per Durable Object and checks event IDs are continuous between the earliest archived ID and latest archived ID. It does not claim that the archive contains earlier pre-migration awards.
- Checks the most recent archived event ID equals `v16-state.auditNextId - 1`. This detects an out-of-sync journal and game snapshot.
- Compares up to the newest 64 SQL events against the overlapping events in the 256-entry recent audit window (UID, season, request ID, award kind, amount, result score, trusted timestamp).
- Checks consecutive per-player award scores within the inspected window, and compares the most recent inspected award in the **current season** against the game's authoritative current score. It never compares scores from a prior week after the reset.
- Reports `ok`, `mismatch`, `not-started`, or `unavailable`; only generic error codes, totals and cursors are returned, not player UID, email, or raw receipts.

### Interpret the result carefully
- `ok` proves only the tested integrity properties for the archived event range and sampled recent award rows; it is **not** a full independent replay or proof that historical records were never deleted before the first surviving archived ID.
- `not-started` means the SQLite journal has not yet logged an award. Older scores may already exist from the previous Staging build; no backfill is fabricated.
- `mismatch` requires investigation and a backup before any repair. The endpoint **never** edits or resets scores.
- SQL aggregation and row comparison are administrator-only and rate-limited, not called by the players' world polling or gameplay loop.

## Access and privacy
- The result is returned through the existing `GET /api/v16/admin/audit?scope=free&room=preview` route after Firebase ID validation, App Check, Closed Beta allowlist, live account check, exact Admin UID secret and `ENABLE_V16_ADMIN_READS=true`.
- This route remains disabled in deployed Staging until secure administrator enrollment. No change to `ENABLE_V16_WRITES=false` or the V16.26 movement protocol.
- The Admin Audit panel will show a short integrity state and the count of archived entries. **No recovery bookmark is ever sent to browsers.**

## PITR and backup limitations
- In SQLite-backed Cloudflare Durable Objects, `getCurrentBookmark()` provides a **read-only** PITR bookmark. This diagnostic checks that a current bookmark can be read, but intentionally discards it.
- Cloudflare documents up to **30 days of point-in-time recovery** for SQLite-backed Durable Object state. This is not a separate offsite archive or a substitute for disaster recovery backups.
- No restore is triggered by this feature, and no test restore has been performed. A full launch gate must include a documented recovery rehearsal with isolated copies, exported encrypted backups, access logs, and measured storage limits/costs before handling large numbers of players.

## Manual acceptance before Public
1. Signed-in test player earns a new coin award in the isolated Staging preview; verify real UI score and no duplicated credit on retry.
2. Enroll Admin UID using a secret via approved secure operational procedure; temporarily allow **read-only** audit access, confirming non-admin remains HTTP 403.
3. Validate `integrity.status=ok`, inspect first/last stored award IDs and separate PITR capability; avoid exposing identifying fields in logs.
4. Restore the flag to false after testing, and confirm the real Free leaderboard remains unchanged.
5. Before opening 10K-capacity public service, implement independent periodic encrypted offsite backup, reconciliation job, recovery verification, fraud controls, and capacity/load testing.

**No claim of a production-ready backup or proven real authenticated SQL archive is made by this implementation.**
