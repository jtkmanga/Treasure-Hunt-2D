# V16 cross-Durable-Object transport budget and failure-injection tests

## Scope

This milestone extends the isolated, **disabled-by-default** cross-Durable-Object zone prototype from PR #36. There is still no staging or production deploy, no extra paid Cloudflare namespace, no player WebSocket traffic, no login changes, and no modification of authoritative coins, Lucky Box, scores, or player movement protocol V16.26.

### Deadline-aware internal transport

`src/v16-online/zone-transport.mjs` wraps the private `ZONE_ROOMS` binding, not an external URL and not a browser-provided destination. It accepts only deterministic, strictly validated zone names and three internal actions: `/zone/upsert`, `/zone/remove`, `/zone/nearby`.

- Default per-request deadline: **750 ms**, configurable in bounded tests from **50 to 5,000 ms**.
- Nearby fan-out: **at most 9** named zones within an 8-tile viewing radius, with a maximum of **24** sanitized player avatars returned.
- A timer and abort signal bound each shard request. **No automatic retry** is issued after a timeout, because an update may already have been accepted by the destination. A later explicit, idempotent synchronization repairs an uncertain cross-zone move.
- Any rejected, malformed or failed DO result yields a categorized, sanitized error. Internal UID, Google token, email, raw shard response, endpoint hostname and payment data are never placed in the public-facing error.
- A slow/unreachable neighbor makes that proximity request **fail closed**; it does not pretend stale records represent live players. The canonical world remains unmodified.
- Aggregate in-process metrics: total requests, successful, deadline/rejected/transport failures, peak in-flight requests, action counts, p50/p95/p99 duration from the last 2,048 completed internal calls. No user identifiers are stored in these metrics.
- To protect worst-case hotspots, each shard retains **only its nearest 24 candidates during scans**, rather than sorting a huge array of players clustered at one location.

### Testing

`tests/v16-zone-transport.test.mjs` and expanded `tests/v16-cross-do-shards.test.mjs` test that:
- responses from a slow shard exceed the injected 60 ms deadline and return a timeout category, not a falsely successful player list;
- the canonical room's 200 coins, score and movement remain unchanged;
- a destination zone update can succeed while old-zone removal times out; the transition remains unconfirmed, and the next explicit sync removes stale zone membership safely;
- malformed DO responses, HTTP 503 and unhandled fetch errors stay sanitized and are counted correctly;
- shard count, read fan-out, payload size, read radius and public result size remain bounded;
- no external URL targets, Firebase UID exposure, or automatic retry are introduced.

`scripts/v16-cross-do-cost-probe.mjs` measures an offline in-process 100/1K/10K actor model: initial zone projection, movement across cell borders, several hundred nearby reads, the number of simulated DO subrequests and peak fan-out, with local p50/p95/p99. GitHub Actions saves a JSON report and readable summary.

## Deployment and load-test limitations

All calls in this benchmark are **mocked in-process**. They are **not** billable Cloudflare DO subrequests or measured real internet/Cloudflare latency. `networkRequests=0`, `actualCloudflareDORuns=0` and `verifiedRealConcurrentPlayers=0` are enforced. A first online canary must still be isolated from the existing live staging world and separately assess Worker/DO CPU limits, system billing, Google/App Check admission, cost and rollback.

Most importantly, the **single central authoritative V16WorldRoom** is not horizontally scaled by this work. Moving physics/coin validation into distributed shards would need a separate safe design; otherwise coins could be duplicated or V16.26 movement regress.

**Admin/PITR stays paused as requested. The new code/feature flag remain unmerged and undeployed.**
