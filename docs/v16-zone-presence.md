# Treasure Hunt 2D — V16 local spatial presence index

## Scope and safety

This milestone **does not** shard the authoritative server, move coins, modify the score journal, change the 4-hour Lucky Box timer, or deploy gameplay. It builds an **ephemeral 10-by-10 grid of 10×10-tile cells** inside one `V16Room` for efficient nearby-player discovery in the 100×100 forest.

- `src/v16-online/zone-presence.mjs`: one private position record for every currently active verified Firebase UID, and a Set of UIDs for each occupied cell. Only the server updates this index from a verified `join` or an accepted authoritative `move` / V16.26 batched `preview-move`. Requests never supply target coordinates to the nearby handler.
- `GET /api/v16/preview/nearby?scope=free`: new **read-only** Staging preview route. Requires the same verified Google Firebase JWT, App Check, Closed Beta UID invitation, active account check and per-UID rate limit as existing preview requests. No separate admin permissions. No write to coins, rankings, or the SQL journal.
- The internal DO handler rejects a missing signed UID, unauthorized preview marker, or non-GET method; callers must first join the same preview room. VIP remains gated and cannot use the Free preview. No public unverified proximity endpoint.
- Query radius is a fixed maximum **8 tiles**, and a result contains at most **24 nearest players**, with a randomly created ephemeral avatar ID, safe public nickname and rounded x/y. Firebase UID, raw email, score, JWT and global population are not serializable in this response. Nicknames are sanitized with the existing public nickname rules.
- A player joining uses the current canonical position. On movement across a cell, the player is removed from the previous Set before entering the next. Stale actors expire after 90 seconds of inactivity, using bounded incremental sweeps plus local cell cleanup; no expensive global scan on each query.
- The spatial index and avatar IDs are **never persisted**. Durable Object restart reconstructs only the canonical scores/coin state and requires a fresh join to make players visible again. Storage reconciliation rebuilds the index from the surviving transient positions.

## Invariants and tests

- A single **200-coin** canonical map remains in the existing DO; Lucky Box spawn and global cooldown are untouched. No split-world duplicate coins can be created by the index.
- Test 1: close players across a cell boundary remain visible; distant players are excluded, and no raw UID appears in JSON.
- Test 2: crossing cells preserves the ephemeral avatar ID and does not create a ghost in the old zone.
- Test 3: stale and inactive sessions disappear; expired entries can rejoin without retaining their old presence.
- Test 4: **10,000 synthetic actors in one zone** still return at most 24 actors, including the closest; bounded sorting avoids building an unbounded output.
- Test 5: malformed positions, out-of-bounds queries, stale updates, radius/limit manipulation fail closed.
- Test 6: real V16Room joins, moves and restarts preserve coin/score logic and rebuild ephemeral presence properly.
- Test 7: signed-preview-like API harness verifies anonymous 401, unjoined 409, valid room and two clients, hidden raw UIDs and unrelated scope denial.
- New standalone `node scripts/v16-zone-capacity.mjs 10000` measures local proximity p50/p95/p99 for 1,000 synthetic reads and 10K cross-zone movement updates. GitHub Actions records machine-readable JSON. No network or Cloudflare use.

## Not a 10K live-user proof

This first iteration uses **one existing V16WorldRoom Durable Object** for Free preview and simply speeds up local proximity lookup. It does not distribute clients among separate Durable Objects or broadcast their avatar movement to mobile clients. The mobile preview UI remains unchanged until a separate cross-device visual acceptance stage is approved. A 10,000-actor in-process simulation does **not** prove 10,000 real authenticated online sessions. Next architecture milestones remain:

1. isolate network/zone presence in separately keyed DOs with authenticated routing, directional updates and replay/sequence protections;
2. preserve global authoritative coin pickup and Lucky Box with a durable single-winner protocol (no duplicate reward when zones change);
3. enforce player-admission and rate limits without weakening Firebase/App Check;
4. test a canary ramp of real online 100 → 1,000 → 10,000 with measured CPU, memory, p95/p99, WebSocket/HTTP fan-out, 429/5xx, cost, anti-cheat and reset behavior.

**Deploy/merge state:** Development branch only, PR draft. Admin/PITR and real payment remain on hold. Production Free/VIP scoring unchanged.
