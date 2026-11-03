# V16 synthetic PITR drill — isolated staging only

## Purpose and threat model

Validate a **real Cloudflare Durable Object PITR restore** of SQLite and Key-Value data without restoring any players' scores, VIP payments, Free rankings, or the live Staging preview.

- Dedicated, immutable synthetic object name: `__treasure_hunt_2d_pitr_only_20261103_7b82cf__` inside existing Staging namespace. No user-supplied room name is ever accepted.
- No new Worker, SQL database, D1, R2, Queue, or other paid service is created. This single isolated DO may incur a small amount of standard DO usage.
- The DO's runtime verifies `state.id.name` **equals the exact isolated room name** and an internal Worker-only marker on every synthetic operation.
- No game room's `v16-state`, Admin role, or `v16_award_journal` is accessed by the drill.

## Signed administrator launch gate

- Strictly `POST /api/v16/admin/pitr-drill?scope=free`; no public GET or unauthenticated endpoint.
- Requires **both** `ENABLE_V16_ADMIN_READS=true` and separately enabled `ENABLE_V16_RECOVERY_DRILL=true` plus signed Firebase Google JWT, a verified Google provider/email matching the Cloudflare admin secret, App Check, beta invitation, non-disabled and non-revoked account status, rate limit, and a previously **pinned Admin Firebase UID** in the private role Durable Object.
- The existing beta page only shows `ทดสอบกู้คืนห้องจำลอง` when an authenticated Admin Audit response explicitly reports `syntheticDrillAvailable:true`. A **human confirmation dialog** is required; the test never runs automatically.
- New Admin enrollment remains disabled, and `ENABLE_V16_WRITES=false` never changes.
- Keep `ENABLE_V16_RECOVERY_DRILL=false` except during the approved single test window; reset it to `false` after owner acceptance.

## Test steps (only within the named synthetic object)

1. Create a small SQL table `v16_pitr_synthetic_probe` and an isolated KV marker with score **123 / baseline** inside a transaction.
2. Record the current PITR bookmark (held inside the Worker invocation only; **never returned to the browser**).
3. Change **both** the SQL row and KV marker to score **987 / mutated**, then reread and verify both changes persisted.
4. Call Cloudflare's `onNextSessionRestoreBookmark(bookmark)` and `state.abort()` on **this one synthetic DO**.
5. Retry the fresh DO session to check **both** SQL and KV returned to score **123 / baseline**.
6. Write a synthetic completion marker after the successful recovery check, so a repeat button press can verify prior completion without triggering a second restore.

## Interpreting results

- A successful returned response explicitly confirms both SQL and KV recovery and that the requester cannot select a real player room.
- If the API is unavailable, restore fails, or the DO restarts into an unverified state, return an error; no "passed" claim.
- A success is a narrowly scoped **PITR recovery rehearsal** using synthetic data. It is **not** an independent offsite backup, a restore of the live game database, or proof of 30-day recovery for all objects.
- Do not log or disclose raw bookmarks, Google tokens, owner email or any player UID.

## Acceptance gates

- `npm test`, Wrangler staging build, live HTTP guard tests, and Worker/DO version match must pass before deploying.
- Test route remains disabled by default in the staging config. Enable `ENABLE_V16_RECOVERY_DRILL=true` on Staging only after code has passed CI and there are no conflicting bindings; owner triggers test while signed in.
- After owner reports success, set flag back to false and verify the Admin Audit, V16.26 movement, player scores, and Public write gate are unchanged.
- Production Free launch still requires independent encrypted backups/export and monitored recovery plan.
