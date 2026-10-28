# Staging infrastructure record — 2026-10-28

**Read-only and not publicly exposed.** This setup is separate from GPT-VOXEL-3D and from the live Treasure Hunt 2D Pages V1 site.

Cloudflare D1 database: `treasure-hunt-2d-staging` (APAC, read replication disabled), ID `389254ad-4f44-4076-b028-0ef5fa8e41cd`. Both migrations (`db/schema.sql` and `db/runs.sql`) succeeded and were read back. Two game tables, three game indexes and two scoring triggers exist; the application tables contain 0 runs and 0 scores.

Worker `treasure-hunt-2d-staging-api` was uploaded as an isolated read-only HTTP handler, with DB bound to the new D1 and CORS origin limited to the existing Pages site. The **workers.dev subdomain is disabled** (verified by Cloudflare); the Worker has no public URL. Firebase project ID `treasure-hunt-2d` is now bound as a public project identifier, confirmed by the owner's console screenshots. `/api/v1/me` is still unreachable publicly while the Worker subdomain remains disabled. Live user/token and revocation/App Check have not been verified. Score/run HTTP routes always return 403; no player score is accepted.

Cloudflare Free quotas still apply. The connected Cloudflare OAuth session cannot read Billing/subscriptions, so the actual billing status is not independently verified. The Worker stays disabled publicly to avoid unexpected traffic; do not enable load tests or paid products.

Next: test the newly configured isolated Firebase project and Google login on the 2D web origin; verify ID-token signing/disabled users/revocation and App Check, then safely test GET-only API/D1 on a restricted endpoint. After that align the deployed 2D client's map/seed/input timing with the server's replay implementation (currently mismatched), test scores and rate limits, and only then consider activating authenticated score writes in staging.

`docs/staging-readonly.json` is a non-secret record/configuration with `workers_dev:false`; do not use it to auto-deploy publicly. This repository has no secrets or Cloudflare deployment credentials. Current Pages is still the offline V1.
