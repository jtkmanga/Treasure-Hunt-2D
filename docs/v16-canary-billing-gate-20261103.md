# Cloudflare Zone Canary — account billing verification gate (3 November 2026)

## Current account audit result

The connected Cloudflare OAuth session can read the running `treasure-hunt-2d-v16-world-staging` script's active deployment and bindings. The current active Staging version observed at preflight is `266ff6e8-3f64-4d6c-8cb6-0a6e454413f5`, serving 100% of Staging traffic, with `ENABLE_V16_WRITES=false`. Admin/PITR secrets and the existing `ROOMS` Durable Object binding remain configured; **none of these settings have been changed**.

However the same connection is rejected (HTTP **403 Authentication error**) for:

- `GET /accounts/{account_id}/subscriptions`
- `GET /accounts/{account_id}/billing/spend-policies`
- `GET /accounts/{account_id}/billable/usage`
- `GET /accounts/{account_id}/billing/usage`

Therefore **actual plan, month-to-date billing, budget alerts and spend policies are UNVERIFIED**, not zero. Cloudflare billing read permissions cannot be assumed from Worker deployment permissions. Do not print any account details, tokens or payment methods in PR logs.

## Current published Cloudflare product terms (verify again before rollout)

Official documentation:
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) — updated in October 2026, subject to change
- [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Spend policy usage_block and notification actions](https://developers.cloudflare.com/api/resources/billing/subresources/spend_policies/)
- [Budget alerts and Billable Usage dashboard](https://developers.cloudflare.com/changelog/post/2026-04-13-billable-usage-dashboard-and-budget-alerts/)

The Free plan includes a daily Durable Objects requests allowance; after free-tier limits are exceeded, operations can fail. On Paid plans Durable Objects requests, active compute duration and SQLite storage are metered, with monthly included allowances and possible overages. **A successful unit test does not prove the canary costs $0.** An activated standalone Worker also has Worker request usage, and billing is at the account/product level, not solely one isolated script.

Cloudflare's newer spend policies support product IDs `workers` and `durable_objects`. A `notification` policy only notifies; an enabled `usage_block` policy blocks **the account product**, which could also interrupt the existing game. It must not be added, lowered or changed silently for a test. Project-local run caps below are independent of, and cannot replace, billing limits.

## Owner's manual verification (mobile friendly)

1. Sign into [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Manage Account → Billing**. Review the active Workers plan, month-to-date **Billable Usage** and any existing budget alerts/spend policies for both `Workers` and `Durable Objects`.
2. If this information is sensitive, only share screenshots with account identifiers, invoices, email, payment cards and keys hidden. A high-level plan name, whether a budget alert/spend policy already exists, and whether current usage is within the user's acceptable budget are sufficient.
3. Choose a test budget **separately** from normal production usage. Do not configure a new `usage_block` for the whole Workers or Durable Objects product without explicitly accepting that it could stop the running game.
4. Only after account plan, usage and budget review should a separately approved operator deploy `wrangler.v16-zone-canary.jsonc`, create a fresh isolated `CANARY_RUN_TOKEN`, and explicitly enable **both** `CANARY_BILLING_REVIEWED=true` and `CANARY_ENABLED=true` on this separate Worker. Do not copy Staging Firebase/Admin secrets.
5. Test a single bounded 2-actor invocation. Read Cloudflare actual per-product usage; only then consider 5 → 10 actors. Disable both flags immediately afterward.

## Defenses already implemented in the branch (still un-deployed)

- Existing accepted V16.26 game Worker, 200 coins, Lucky Box, scoreboard resets and VIP/payment paths remain unchanged.
- `CANARY_ENABLED=false` by default; independently `CANARY_BILLING_REVIEWED=false`. Neither flag can be bypassed by a valid operator token.
- Fixed project-local coordinator DO, max **3 test invocations per UTC day** and **75 reserved zone requests per invocation**; failed requests still reserve budget.
- At most **4 concurrent outbound zone DO calls**, deliberately below Cloudflare's documented **6 simultaneous outgoing connections per Worker request**. In the worst nine-neighbor-cell case, requests are sent in consecutive batches of up to four; no new batch starts after a failure.
- No unknown hostnames or real player IDs are accepted; `POST /run` requires a fresh secret token and strict 256-byte payload limit; no automatic retry of uncertain mutating DO calls.
- New Worker and SQLite DO namespaces would be independent if ultimately deployed; no current game bindings or data would be shared.

## Status

**Billing audit BLOCKED by missing permission. Canary code/CI may proceed, but no Cloudflare deployment or live test may be claimed.** Recheck Cloudflare plan/usage/approval before actual invocation. All 10K simulated actors remain offline, not verified live concurrent people.
