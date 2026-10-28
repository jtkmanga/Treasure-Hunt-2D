# Treasure Hunt 2D — Development roadmap

## V1: Offline prototype (included)
- Responsive self-contained HTML5 Canvas mobile top-down game
- 3 maps, virtual joystick, collision, local coin pick-up/respawn, local 4-hour chest demo
- Example shop, example leaderboard, example VIP price (no real purchases)
- Node smoke test with mocked Canvas/DOM

## V2: Safe HTTP-based online competition (not implemented)
1. Google Firebase Authentication ID-token verification with App Check as appropriate. Verify Firebase-project isolation between 3D and 2D.
2. Begin run via POST /api/runs/start. Server issues random run ID, versioned level seed, challenge policy, expiry, nonce and server timestamp.
3. End run via POST /api/runs/finish. Verify authorized identity, replay limits and plausible game actions. Reject duplicate completion using transactional deduplication. Never accept client score as authoritative.
4. Separate immutable currency ledger from seasonal leaderboard score. Set score period IDs for Free (Sun midnight TH) and VIP (daily midnight TH); save winner snapshots.
5. Global Lucky Box per competition scope: single server-owned event cycle, 4h cooldown after verified claim, atomic first-wins receipt, no double award.
6. Read-only cached leaderboard and account profile endpoints; strict per-user request budgets. Make polling optional/manual, not every frame.
7. Shop catalog with server-authoritative price, inventory, spending and idempotency.
8. VIP identity/entitlement, Slip2Go payment receipt verification and admin roles ported selectively from verified code, after security review and tests. Do not copy keys or attach 2D API to the existing production payment system.
9. Rate limit, replay audit, cheating risk scoring, review suspicious winners before prize payouts. Full anti-cheat guarantee cannot be made in a client-side game.
10. Isolated Staging and mobile tests before any deployment. Compare cost against Workers Free + D1 quotas at realistic daily and 24/7 activity. Do not claim 1K concurrent free until measured.

## Deployment
- Repository root index.html is suitable for static hosting (e.g. Cloudflare Static Assets or Pages) after explicit owner approval.
- Never auto-deploy or overwrite the live GPT-VOXEL-3D production game.
- No VPS/WebSocket/billable services required for V1.

## Reuse map from legacy project (planning only)
- src/worker/firebase-auth.mjs: verify identity
- src/worker/score-reset.mjs: Thai score reset calculations
- src/worker/economy.mjs: ideas for atomic reward receipts/claims; cannot drop in without refactoring Durable Objects
- src/shared/catalog.mjs: prices & product catalog
- src/worker/admin.mjs + vip-store.mjs: policy patterns; rework HTTP/storage access and review payment paths
- Do **not** import 3D movement, GameRoom/ZoneRoom WebSockets, secrets or payment credentials.
