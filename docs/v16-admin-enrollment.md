# V16 private Admin enrollment — Staging, read-only only

## Authentication path

1. Owner signs into existing Closed Beta with Google Firebase, signs an App Check request, and passes closed beta invitation, account-enabled and revocation checks.
2. A trusted Cloudflare **secret** `V16_ADMIN_EMAIL` contains the previously designated administrator's Gmail address. It is not committed to GitHub or sent in any API response.
3. The backend verifies signed Firebase ID token with `email_verified=true`, `sign_in_provider=google.com`, and an exact case-insensitive email match against the secret. It rejects forged browser names, unsigned email claims, unverified/disabled/revoked accounts, other Google accounts, and missing App Check.
4. With explicit `ENABLE_V16_ADMIN_ENROLL=true` staging flag, the qualified account may request `GET /api/v16/admin/status?scope=free`. If not yet enrolled, the beta page shows a **manual** button; the page does not auto-enroll on sign-in.
5. On explicit `POST /api/v16/admin/enroll?scope=free`, an isolated Durable Object `v16-private-admin-enrollment-v1` stores a single immutable Firebase UID under `v16-admin-enrollment-uid-v1`. The first valid UID wins; retries by the same UID return success but never assign a second role. A conflicting account is denied even if the email setting changes.
6. Read-only Audit `GET /api/v16/admin/audit?scope=free&room=preview` still needs `ENABLE_V16_ADMIN_READS=true` and either the pre-existing legacy trusted `V16_ADMIN_UID` secret or the new **two-step rule**: valid owner email and a matching pinned Firebase UID. Role verification is performed on every audit request. The legacy UID route remains to avoid breaking the previous setup, but is not configured in new Staging.
7. The Admin UI never stores Firebase ID tokens, enrollment email, UID, journal rows, or private recovery bookmarks permanently on the device, and hides its audit/enrollment panels when the signed-in account changes.

## Default denial, operations and revocation

- Source control defaults: `ENABLE_V16_ADMIN_READS=false`, `ENABLE_V16_ADMIN_ENROLL=false`. No hardcoded owner email or actual UID.
- To enable for the single intended administrator, set `V16_ADMIN_EMAIL` as a Cloudflare Worker secret, allow `ENABLE_V16_ADMIN_ENROLL=true` and `ENABLE_V16_ADMIN_READS=true` **on Staging only**, then have the owner sign in and explicitly tap the enrollment button.
- **After the owner has enrolled and successfully viewed their Audit, set only `ENABLE_V16_ADMIN_ENROLL=false`**, leaving `ENABLE_V16_ADMIN_READS=true` and `V16_ADMIN_EMAIL` unchanged. The locked Firebase UID in the role Durable Object remains valid for read-only Audit; anonymous/new enrollment remains 403. Owner read-only Admin status remains available for signed-in checks.
- Test after locking: `GET /admin/status` with no token returns 401; `POST /admin/enroll` even with no token returns 403; `GET /admin/audit` without token returns 401. For the actual owner, signed-in `admin/status` returns `admin:true, canEnroll:false`, and Audit remains readable. No secret values or raw Audit should be placed in CI logs.
- If ever in doubt, disable `ENABLE_V16_ADMIN_READS` immediately. Also disable enrollment if Google access is compromised. To reassign to a new UID, do not bypass the pin: use a documented, authorized security recovery procedure, preserve the old Audit evidence, and require fresh owner approval. **There is no public reassignment API.**
- The enrolled Admin can **only read** the existing score-journal, integrity, and non-destructive PITR readiness. No score edits, score resets, VIP subscription changes, payments, or Production write flags are offered.

## Acceptance

- Run `npm test` and staging Wrangler compile. Tests must prove default disabled, wrong email, non-Google provider, email unverified, anonymous request, second account, enrollment race/idempotency, and revocation by changing allowlist.
- Live HTTP smoke verifies deployed Worker and DO marker `adminEnrollment:pinned-google-uid-v1`, public unauthenticated requests remain 403, and the existing Google/App Check gates.
- After a controlled Staging deployment, confirm the owner can sign in to the correct Firebase Google account, tap the Admin enrollment button, inspect read-only journal and compare integrity report. Manually confirm another account cannot read it.
- Staging score writes remain `ENABLE_V16_WRITES=false`. This does **not** open the Free public competition or satisfy the 10K load gate.

## Security limitations

The owner email is a privilege binding: protect access to the Google account and Firebase project, and do not leave enrollment enabled indefinitely after registration. This is **not** a production-grade admin management console; additional access logs, incident response, configurable roles, backup/export and recovery rehearsal remain.
