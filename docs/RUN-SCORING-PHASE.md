# P4 — deterministic ranked run score verification (offline source only)

This is an additive commit atop Draft PR #1. **Not deployed**, not linked to public HTTP routes, Google Login, Cloudflare D1 or VIP payment.

## What it does

1. A trusted server-side caller (future verified Google-login gate) requests a ranked Free run. The D1 service generates UUIDv4 and an unpredictable 32-bit seed, records a signed-in UID, period, start and expiry. This code does not accept client-supplied UID, run ID or score.
2. A browser can later submit a finite array of per-200ms control frames: [horizontal -1/0/1, vertical -1/0/1, collect 0/1]. Maximum 900 frames / 3 minutes. The endpoint will eventually be activated only after access and abuse controls.
3. The Worker reconstructs the map deterministically and replays each movement with four collision substeps, applying nearby coin collection (60-second cooldown) and one chest pick-up. It calculates points exclusively on the server.
4. Submission duration cannot exceed verified server elapsed time; the run must be active/unexpired and in its original Free period. Ranked VIP is intentionally blocked until a secure entitlement check exists.
5. One atomic SQLite UPDATE changes the state from active to finished. A DB trigger credits the leaderboard only during that unique transition; duplicates and racing completion requests receive no extra score.
6. A per-UID/per-Free-period DB trigger caps ranked starts at 10. Unlimited local/unranked levels can continue separately and do not use these API calls.
7. No D1 resource or Worker has been created/deployed. No changes to the live Pages site or the old GPT-VOXEL-3D game.

## Testing and cost

- npm test (Node 22, built-in SQLite test adapter): deterministic world, strict input limits, coin/chest score replay, impossible elapsed time, UID mismatch, one-time atomic scoring, simultaneous duplicate completion, per-period run limit and rollback.
- Expected future ranked run API budget: ~2 API calls/player/run, not one request per movement. The maximum 10 ranked starts per UID/period is a budget boundary and can be revisited after measuring active player counts and fairness.
- No claim of Cloudflare live load, Android verification, free-tier compatibility or production readiness. D1/Workers CPU and browser uploads have not been benchmarked.

## Security limitations and next gates

**Replaying inputs is stronger than trusting browser-supplied points, but still does not prove a human played.** A malicious client can generate a legal-looking movement sequence. Before any public competitive scores/prizes/payments: add rate limits, Firebase active-user/disabled-account/revocation checks, App Check, authenticated run endpoints, server-issued time-bound challenges, player-behavior anomaly checks, prizes/manual review, end-to-end mobile tests and quotas/cost instrumentation.

To integrate later: copy db/schema.sql followed by db/runs.sql into a **new isolated Treasure Hunt D1**, configure Google project separately, and wire startVerifiedRun/finishVerifiedRun into authenticated HTTP routes only after the checks above pass. Do not modify GPT-VOXEL-3D's production database or payment setup.
