# Isolated Cloudflare Durable Objects canary — operator runbook

## Why this is separate

This Worker (`treasure-hunt-2d-zone-canary-isolated`) is **not** the existing Free/VIP/Staging Worker. It uses its own `V16PresenceZone` and `V16CanaryCoordinator` SQLite-backed Durable Object classes, created under its own new Worker deployment, and intentionally has **no** binding to the existing player world, score journal, Google/Firebase credentials, Admin or payment secrets.

The requested project goal remains **10,000+ Free users online**. This canary is a small **real Cloudflare inter-DO communication measurement**, not a 10,000-user load test. Even a successful canary does not prove that the authoritative game DO or signed-in admission can scale.

## Safety gates before a live run

1. Run PR CI (`npm test` and `V16 Isolated Cloudflare Zone Canary Preflight`). Wrangler `--dry-run` **does not deploy or create billable DOs**.
2. Review Cloudflare account's current **Workers + Durable Objects plan and included usage** before creating any service. Durable Objects can incur request/duration/SQLite storage charges on Paid plans beyond included allowances. The code **cannot guarantee a zero-dollar test**.
3. Confirm the existing live Staging Worker still has `ENABLE_V16_WRITES=false`, working Google/App Check, and no new `ZONE_ROOMS` binding or canary migration. No Staging production secrets should ever be copied to the isolated Worker.
4. The connected Cloudflare OAuth identity currently cannot read account Subscription, Billable Usage or Spend Policies (all HTTP 403 / missing Billing Read). Therefore account-specific cost approval **has not passed**. The owner's Dashboard billing review is required; see `docs/v16-canary-billing-gate-20261103.md`.
5. Only after an authorized cost/rollback review, deploy the standalone `wrangler.v16-zone-canary.jsonc` under its **distinct** name. It starts with **both** `CANARY_ENABLED=false` and `CANARY_BILLING_REVIEWED=false`.
6. Set a **fresh high-entropy 48+-character** operator secret under `CANARY_RUN_TOKEN` using Cloudflare's secret store. Never include it in repo, GitHub logs, chat screenshots or browser URL. Do not connect it to a real user Firebase UID or Admin account.
7. Only after the owner explicitly confirms the plan/spend policy, enable `CANARY_BILLING_REVIEWED=true`, then for an approved short maintenance window set `CANARY_ENABLED=true` on the **isolated** Worker and invoke exactly one protected `POST /run` with JSON `{"actors":2,"reads":1}`. Then consider `{"actors":5,"reads":2}` and `{"actors":10,"reads":5}` **only if** the previous step passed and budget/cost monitoring is normal. An operator must intentionally initiate each step.
8. Disable **both** `CANARY_ENABLED` and `CANARY_BILLING_REVIEWED` again immediately after the approved tests. Remove the operator token when no longer needed; keep the named Worker and DOs separate for audit or delete the isolated test resources if no longer required.

## Hard ceilings enforced by server-side Durable Object

- At most **10 synthetic actors** and **5 nearby read rounds** in a single request.
- At most **75 reserved zone-DO subrequests per test** and **3 test runs/day**, with a **300 per-day reserved zone-DO call** upper limit (coordinator calls/Worker requests and Cloudflare's underlying billing units may be additional).
- The daily budget and number of runs are persisted in a dedicated coordinator DO **before** initiating any shard calls. The budget cannot reset merely because an instance restarts; a failed/partial request still consumes its reserved budget.
- Each shard call has a bounded deadline (**750 ms**); fail closed without repeated writes or fabricated player positions. Aborting a request does not guarantee a billed in-flight Cloudflare subrequest is canceled, and no automatic retry is issued.
- At most **four** outbound zone requests run simultaneously in the canary, below Cloudflare's six connection limit per Worker request. Subsequent batches start only if the current batch succeeds. The worst-case nine-zone visibility remains represented in the *reserved* request budget.
- Destination zone names are derived only from hardcoded synthetic coordinates and must match the fixed namespace pattern; no UID, coordinates, hostname, arbitrary shard ID, or script name can be passed in the operator request.
- Endpoint `GET /health` is read-only and invokes no DO. `POST /run` requires `CANARY_ENABLED=true`, a fresh secret Bearer token, exact bounded payload and private coordinator binding. No CORS shortcut or public browser control is implemented.
- Zone DO data is ephemeral **synthetic** presence only. This service never touches V16.26 movement, coin pickups, the single canonical 200 coins, Lucky Box, score resets, VIP or payments.

## What the test measures

Each synthetic actor is projected from one named zone DO into another by `upsert-old → upsert-new → remove-old`. Bounded nearby fan-out then reads only fixed neighboring DOs. The returned report includes number of initiated DO calls, successful vs rejected vs timed-out operations, peak parallelism, and p50/p95/p99 response duration as observed by the coordinator Worker.

A successful on-platform test is the **first opportunity** to gather genuine Cloudflare DO-to-DO latency. Billing amounts must be read from Cloudflare's account analytics separately: request count and p99 alone do not establish price. The canary does not validate real mobile controls, Google/App Check authentication, or 10K concurrency.

## Fail or rollback conditions

Stop immediately if any stage reports failure, 429/5xx, nonzero timeouts, unexpectedly large fan-out, or the account analytics exceed the preapproved operating budget. Set `CANARY_ENABLED=false` and do not retry the same uncertain movement automatically. For a failed upload or unexpected binding, do **not** deploy over the existing game: roll back or delete only `treasure-hunt-2d-zone-canary-isolated`.

**Project status:** PR development-only until explicit deployment and usage approval; no live canary has run merely because the test suite passes.
