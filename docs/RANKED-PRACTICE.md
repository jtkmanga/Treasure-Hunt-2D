# Ranked Practice — deterministic game/server parity (source-only)

## Scope

- The original public Pages `index.html` V1, `/login/` Google/Auth/App Check and the isolated 2D Staging Worker stay unchanged.
- New `/ranked-preview/` mobile Canvas game with digital touch controls and WASD/arrow keyboard movement.
- The page imports the **same** `run-engine.mjs` source used by the server, copied byte-for-byte into the static ZIP during GitHub Actions. No separate physics or map implementation.
- `createRunSession(level,seed)` and `advanceRunTick(session,frame)` implement the official step machine: 26×26 seeded terrain, 82 practice coins, collision, 200ms frames, 60s coin cooldown, 100-point one-time chest and max 900 frames/3-minute practice. `replayRun` simply applies these same exact steps, preventing old browser/server map mismatch.
- Practice's fixed published seed is a **demo only**, not a server-issued competition challenge. The UI explicitly says score is offline/unranked. It records input frames in memory; on finish it replays them **locally**, not on Cloudflare.
- Does not send any network request, Firebase token, payment or score from the preview game. No WebSocket, D1, or Cloudflare Workers charge from gameplay. Auth page is included in ZIP only to preserve existing manually deployed site, not used by the practice page.

## Known limits / next security gates

1. This is a deterministic compatibility demonstration, **not anti-bot proof**. A bot can generate valid frames. Do not use local score for prize payout.
2. Server must later issue unpredictable per-run seeds, use anti-replay D1 run IDs, rate-limited authenticated POST /runs/start and /runs/finish, signed Google + App Check + currently active Firebase account. This flow is intentionally not deployed.
3. Before real ranked competition, validate signed-in UI, non-overlapping session quotas, frame/timer consistency on Android background/foreground, daily Workers free quotas and D1 row budgets.
4. VIP entitlement, Lucky Box server-global four-hour lifecycle, shop ledger and paid Slip2Go are not ported to this preview; no real money.
5. Free weekly reset Sunday 00:00 and VIP daily 00:00 Thailand exist as period calculation, but no scores are online yet.

## How to test on phone

- Inspect CI passing tests and download GitHub Actions artifact `treasure-hunt-2d-ranked-practice-mobile`. It contains exactly eight static files including unchanged V1 `index.html` and unchanged current Login files.
- Upload the ZIP to the isolated Cloudflare Pages `treasure-hunt-2d-jtk` project through Create deployment when ready, or test using local static server from Codespaces.
- Open `https://treasure-hunt-2d-jtk.pages.dev/ranked-preview/`, pick a level and tap **เริ่มฝึก 3 นาที**. Use directional pad and **เก็บ** button. Finish reports whether browser's replay matched its tick-by-tick simulation; this says nothing about server-side identity or trusted scoring.
- The 3D GPT-VOXEL-3D repository, all original Workers, payments and secrets are untouched.

**Deployment policy:** This branch is a Draft PR and has no auto-deploy step. Never enable D1 score writes or Firebase Enforcement from this work alone.
