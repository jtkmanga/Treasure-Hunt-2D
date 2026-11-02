# V16 SQLite score journal — staging scope, not full public launch

## Data invariants

- V16.26 signed-in coin and Lucky Box pickup still uses authoritative position, dedupe sequence and request ID. **No change to movement rules, rewards, reset schedule, public score write gate or existing Google/App Check policy.**
- `V16Room` retains a bounded 256-entry in-memory/serialized recent audit snapshot. **New** award events are also appended to the SQLite-backed Durable Object's `v16_award_journal` table.
- Each new award writes its SQL event row and `v16-state` snapshot in one synchronous storage transaction. Any write failure aborts both operations and the game sends 503. The Durable Object recovers last committed state before retrying.
- SQL table uses a per-room `event_id INTEGER PRIMARY KEY` plus a `UNIQUE(uid, request_id)` safeguard, recording room scope, season, coin/chest award, coin ID, amount, resulting score, claimed sequence and trusted server time.
- An immutable entry is **not overwritten or deleted by weekly/daily season resets**. The table retains history **from the first new journal write forward**; no claim is made that this reconstructs awards already evicted from the old bounded audit.
- Existing SQLite-backed DO namespace in Wrangler is used. No new D1, R2, Queue, or other externally billed service is created. **SQLite storage operations do consume the existing Cloudflare account's storage/operation quota, so cost measurement is still required.**

## Admin-only pagination

- Existing `GET /api/v16/admin/audit?scope=free&room=preview` (or `room=free`) adds `journal` data: latest 40 events plus optional `?beforeId=<event_id>` for earlier pages, without exposing data in public world/leaderboard.
- `journal.firstStoredId` identifies the first reliably archived award and `journal.nextBeforeId` the cursor for the next page.
- **No audit reads are enabled** until BOTH `ENABLE_V16_ADMIN_READS=true` and a separately stored valid `V16_ADMIN_UID` matching a signed Firebase user are present, with App Check, closed beta allowlist, live account/revocation and rate limiting intact. The Admin UI is read-only.
- Inadequate or missing SQLite capability must **fail closed** when a real production Durable Object requires journaling. Node regression mocks may omit SQLite to preserve compatibility but live test checks `durableJournalSupported:true`.

## Acceptance and next gaps

- Live Staging health and DO protocol report `fullJournal:sqlite-awards-v1`. The DO additionally reports `durableJournalSupported:true`.
- Real signed-in 2-phone post-release coin-award QA is still required. Live HTTP smoke **does not award a point** and cannot establish full end-to-end persistence of the SQL row by itself.
- Before public 10K launch: database capacity limits/cost, periodic encrypted backups/export, point-in-time restore rehearsal, migration/backfill policy, PII retention, admin access audit, ledger-vs-snapshot reconciliation, archive-read pagination throughput, and operational dashboards.
- `ENABLE_V16_WRITES=false` remains set. Ranking is still isolated Staging preview, **not live public Free Server**. VIP/payment production remains unchanged.
