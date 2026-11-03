# Treasure Hunt 2D — cross-Durable-Object zone prototype (OFF by default)

## Architecture milestone

This branch declares an **additional SQLite-backed Durable Object class** `V16PresenceZone` plus a dedicated `ZONE_ROOMS` binding; each named zone (e.g., `v16-preview-zone-v1-x4y5`) is a distinct Durable Object identity in that namespace. **No actual Cloudflare shard objects have been created or billed by this branch**, because it has not been deployed.

`V16WorldRoom` stays the **only source of truth** for movements, joining, global 200 coins, Lucky Box cooldown, score, season winner, claims and claim audit. The new shards cannot issue or modify coins, scores, winner snapshots, payment, or SQL journal. They only hold **ephemeral proximity metadata**.

### New optional authenticated calls

Both routes are available **only** to the signed-in Free Closed Beta in Staging, and only if `ENABLE_V16_ZONE_SHARDS=true` **and** `ZONE_ROOMS` binding exists. The default is `false`.

- `POST /api/v16/preview/shard-sync?scope=free` with exactly `{}` as body: updates the shard from the **server's own accepted position, preview nonce and movement sequence**. The server rejects client-supplied coordinates, UID, nickname or zone name. Clients never choose a shard. Only the authoritative V16 world DO can send this internal request.
- `GET /api/v16/preview/shard-nearby?scope=free`: reads a bounded set of neighboring shard DOs and filters every candidate against the **current canonical position and preview sequence**. The final response contains at most 24 opaque avatar IDs, public sanitized nicknames and coordinates within an 8-tile radius. No Firebase UIDs, credentials or exact global population are returned.

The existing `/preview/join`, `/preview/move`, `/preview/world`, `/preview/collect`, Admin Audit, Free VIP score paths and mobile HTML are **not changed**. This prototype requires explicit separate calls and does not alter accepted V16.26 movement or add extra latency to regular gameplay.

### Cross-zone safety

- Stable internal UID is known only to the authoritative world and zone DOs. Each zone's ID is derived from **validated server coordinates** and checked again by the DO's named identity.
- Shards accept calls only via the worker's private binding with an internal marker; no direct public route to zone mutation exists.
- Each player has a temporary alias reused across cell transfers. Upserts include an authoritative session nonce, movement sequence and accepted server timestamp.
- **New-zone upsert before old-zone removal** reduces handoff gaps. Old zone removal records a temporary tombstone to suppress delayed replay; same or older timestamps/sequences cannot overwrite a newer session.
- On a failed remove, the sync returns an error without advancing the router's confirmed current-zone mapping. A repeated request repairs the old zone. Queries cross-check each shard candidate with the main world DO's current accepted position, session and sequence and therefore do not reveal stale ghosts as current players.
- Shard data expires after 90 seconds and is not written to persistent storage. After a shard DO restarts it may be empty until a client explicitly syncs again. A production approach would require robust recovery/heartbeats, retries and fan-out monitoring.

### What this does NOT demonstrate

- This is a **multi-DO code/configuration prototype and offline protocol test**, **not** a deployed cross-DO game or 10,000 actual concurrent users.
- All client-authenticated requests still pass through a **single authoritative V16WorldRoom**; it remains a potential CPU/network bottleneck. Each nearby read can fan out to multiple zone DOs, causing billable DO requests once enabled.
- Existing 10-person Closed Beta admission remains unchanged, as do Firebase Google Login, App Check, score anti-cheat, Shop, VIP, and Payment.
- Zone presence does **not** replace the atomic canonical collect/coin claim handler. Any future distributed coin claims must route exclusively back to that handler and preserve its persisted idempotency and score ledger.
- No production rollout, staging deploy, automatic client migration, or hidden feature enablement is authorized by this branch. All new DOs require a deliberate new class migration (`v2-zone-presence`) and cost/load review before deploying.

## Verification

- `node --test tests/v16-cross-do-shards.test.mjs` covers separate named shards, no public access, wrong cell, old replay and tombstones, cross-zone interrupted handoff with retry, stale-session suppression, no UID exposure, authenticated Worker routing and absence of score writes.
- Full `npm test`, existing no-Chromium capacity probe and a Wrangler **dry-run only** are required.
- After green tests, next phase can build an **isolated canary worker**, with no existing game world migration, to measure server-to-server latency, DO startup/restart and shard fan-out costs. Do not flip the Staging flag or deploy the new migration on the existing game without a separately verified rollback plan.
