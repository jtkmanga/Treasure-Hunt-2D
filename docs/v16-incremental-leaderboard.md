# V16 leaderboard optimization — exact incremental Top 20

## Why this matters

Previously `V16Room.join()` returned a private snapshot, which called `publicView()`, which invoked `leaders()` with a new full `[...scores].sort(...)` operation for **every join and world read**. For an increasing player population this repeated global sort is a CPU hotspot. The optimized index keeps an exact sorted **top 20** and updates it incrementally.

## Behavior preserved

- Same canonical per-season `scores` and `names` Maps. All score, claim, audit, Lucky Box, 200-coin, coin respawn, anti-replay, winner history, seasonal reset and V16.26 movement rules stay unchanged.
- Same ranking priority: higher points first; equal points sorted by original name using `localeCompare`; equal scores and equal names follow original score-Map insertion order, matching JavaScript stable sort.
- Public labels still run through `publicNickname`, so a raw UID/email can never enter the public leaderboard. Raw nicknames still drive the historical comparator exactly as before.
- Joining a new player adds their name **before** score 0, so an index insertion uses the final display label once. Subsequent player score increases, idempotent claim retries, name changes, deliberate score decreases and delete/clear events update the rank.
- If a top-20 score is decreased/deleted or a top-listed name becomes worse, the index rebuilds from all canonical scores to let the old rank 21 enter. This is a rare, deliberate O(players×20) recovery rather than silently returning a stale leaderboard. No full scan on normal joins, coins, or snapshots.
- `leaders(1)` is served from the same ranked index for winner snapshots; `leaders(20)` for public snapshots. Arbitrary other counts outside 0–20 use the **legacy full sort fallback**, preserving the exact public API.
- The index is **not persisted**. Existing `schema:1` room snapshots and Durable Object state are unchanged; after hibernation/restart it rebuilds from the saved ordered score/name entries.

## Verification

- New `tests/v16-incremental-leaderboard.test.mjs` compares every result against the historical full-sort reference for arbitrary edits, identical scores/names, rename promotions/demotions, score decreases, deletion, 10,000 synthetic entries, old snapshot restoration, weekly Free and daily VIP winner resets.
- `npm test` continues to cover award idempotency, score audit, mobile movement, App Check and all prior gates.
- The independent GitHub Actions capacity runner now performs an **offline 10,000-player simulation on this PR** without browsers, Cloudflare network traffic, paid load, tokens or production writes. The report includes join/movement/world p50/p95/p99 timing, heap, snapshot size and one-winner coin collision. `verifiedRealConcurrentPlayers=0` remains explicit.

## Remaining work before Public

This code-level ranking optimization does not remove the one-DO serialization bottleneck, closed-beta 10-UID limit, full canonical score Map persistence costs, player presence scaling, account admission security, or Cloudflare Worker CPU/memory and billable request limits. Real concurrency still needs staged authenticated testing with safeguards and metrics before a 10K-live capacity claim.

**Do not deploy or merge into the running Staging/Production Worker during this PR.** Admin/PITR work remains parked as requested.
