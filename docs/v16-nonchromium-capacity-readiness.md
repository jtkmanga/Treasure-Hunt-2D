# Treasure Hunt 2D — V16 non-Chromium load readiness

## Scope

This milestone **does not** change the deployed game, Admin, Google Login, App Check, VIP/payment, or public scoreboard. It introduces a safe, offline benchmark for the server-authoritative `V16Room` implementation. The test has **no network calls, browsers, bots hitting Cloudflare, synthetic Google tokens, secrets or paid Workers deployments**.

Its first purpose is to measure whether a **single-room in-process simulation** with up to 10,000 synthetic participants can construct snapshots, process V16.26 move batches and enforce one-winner coin contention without crashing. That is only a **preliminary capacity gate**, not evidence of 10,000 real simultaneous players.

## How to run using a phone

- Open the repository's **Actions** tab and find `V16 Offline Capacity Probe (No Chromium / No Network)`. If the workflow is on the repository's default branch, tap `Run workflow` and select `100`, `1000`, or `10000` synthetic actors.
- The workflow saves JSON latency, timings and heap/snapshot sizes for seven days as an artifact and adds a quick job summary to the GitHub run. No Cloudflare traffic or credit-card charges are initiated. GitHub Actions usage/minutes and artifacts may count against your GitHub plan allowances.
- On pull requests, the workflow first runs the fast `100`-actor simulation automatically; the 10K run is **opt-in** and is not performed during CI by default.
- `workflow_dispatch` normally must exist on GitHub's **default branch** to appear under Actions. This PR is deliberately kept separate and unmerged while development is reviewed; it may not yet appear as a manual button.
- If running Node locally, `npm run capacity:local` or `npm run capacity:10k`. The second benchmark can take significantly longer; it should not be launched from a phone browser.
- The separate `npm test` suite also runs quick capacity-harness correctness tests with a small synthetic population.

## Report interpretation

- `simulatedPlayers`: players joined in an isolated JavaScript object, not logged-in people.
- `latencyMs.join/move/world`: per-method timing within Node, **not** end-to-end network response time or mobile FPS.
- `memoryKiB`: V8 heap and serialized `v16-state` size, **not** billed Cloudflare memory/storage cost.
- `oneCoinClaimPerContention`: verifies one coin in a collision fixture is only credited once; player positions are set by the test harness and **are not a demonstration of real anti-cheat**.
- `verifiedRealConcurrentPlayers=0`, `networkRequests=0`, `productionReadyConclusion=false` intentionally avoid false capacity claims.

## Critical architectural blockers identified

1. **Closed Beta is not a 10K admission system.** `src/v16-online/beta-access.mjs` explicitly permits only 1–10 UID entries and a maximum configuration length of 2,048 characters. This cannot support a live 10K authenticated test. Do not expand the allowlist by weakening Google Login/App Check. A production-ready server-side session/admission/anti-abuse system must be designed.
2. **One globally authoritative room.** The current V16 Staging Worker routes all Free preview players to a single named `V16WorldRoom`. Client requests are serialized at the room level; a synthetic 10K actor benchmark does not prove it can serve 10K concurrent authenticated HTTP requests within Durable Object CPU, memory, and request limits.
3. **Full leaderboard construction on join and every world snapshot.** `V16Room.join()` calls `privateView()`, which calls `publicView()`, which calculates and sorts the entire score table. At 10K players, repeated sorts may dominate CPU. Measure and then optimize with a cached top-N ranking, preserving the weekly reset and global coin consistency.
4. **Dynamic data is centralized.** To scale horizontally without creating extra coins, route movement/presence through bounded zones while keeping the canonical 200 coins, Lucky Box and ranking in authoritative shared state. Zone broadcast and ownership need explicit race/security tests.
5. **Cost and admission security are unknown.** Need a separately approved production-like load generator using real signed test credentials with App Check-compatible architecture, progressive 100→1K→10K ramp, request/CPU/storage billing measurements, p95/p99 HTTP latency, 429/5xx rates, disconnects, Durable Object backpressure and anti-cheat recovery. Never assert 10K production readiness based solely on an in-process benchmark.

## Release safety

- No `ENABLE_V16_WRITES` changes. Existing beta and Free/VIP remain isolated; no real coins or scores are changed.
- Do **not** fire 10K simultaneous unauthenticated requests at the public staging URL. It would only demonstrate 401s/429s, not verified game concurrency, and might consume paid resources.
- Keep Admin/PITR work on hold as requested. The capacity milestone is a code-only, standalone development branch.
