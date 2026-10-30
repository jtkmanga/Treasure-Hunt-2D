# Treasure Hunt 2D — approved game rules (2026-10-30)

## Scope
- Exactly two servers: Free and VIP. No additional server type.
- Exactly one map type: forest. Expand from the user-reported 36×36 to **100×100 tiles**.
- No round timer, countdown to end play, level completion, or time-limited stage.
- Preserve the mobile-friendly visual style, smooth camera/joystick, and gameplay of the currently working release. Do not replace its art/rendering with the older GitHub offline prototype.

## Coins and leaderboard
- Use the original map-coin behavior: at most 200 active coins per server, globally shared positions, pickup removes a coin for everyone, each picked coin respawns after 60 seconds; no coin respawn countdown UI.
- **One score currency only**: every map coin adds **1 coin** to the player's competitive leaderboard score (no separate 10-point multiplier, store wallet, bonus coin types or secondary score).
- Lucky Box reward coins contribute to the same leaderboard score, in real time, only once per accepted claim.
- Free and VIP scores, item pickup pools and Lucky Box state remain separate.
- Preserve Free reset Sunday at 00:00 Asia/Bangkok, VIP reset daily at 00:00 Asia/Bangkok. Persist winner snapshot before resetting; synchronize online leaderboard updates and idempotent resets.
- Server is authoritative for position/proximity, item state, reward draw, score mutation, purchase inventory and movement boosts; UI cannot assign score or claim outcomes.

## Lucky Box
- Exactly one available chest per server, on the forest map, never spawn on top of a player.
- Spawn location and claim status are shared for all players of that server.
- After a successful pickup, open a reward-reveal window for the winning player.
- Weighted rewards (sum 100%):
  - 100 coins: 50%
  - 500 coins: 30%
  - 1000 coins: 19%
  - 5000 coins: 0.9%
  - 10000 coins: 0.1%
- The reward must be sampled with secure server randomness and persisted atomically with a unique claim ID; animation only reveals the preselected reward. Never spin client-side to determine a real result.
- On collection, start the original four-hour globally synchronized respawn countdown (visible to everyone).
- For concurrency, a single chest can be awarded to exactly one player.

## Shop in gameplay
- Add a clearly visible in-game shop icon/button with a mobile modal. Initially two purchaseable items:
  - **Coin collection ×2**: for each valid map coin pickup award 2 coins rather than 1, not multiplier on chest rewards.
  - **Run speed ×2**: 2× movement speed while active, server-validated.
- Avoid introducing extra coin types or point currencies.
- **Approved real-money prices and duration:** Coin collection ×2 = **20 THB / 24 hours**; Run speed ×2 = **10 THB / 24 hours**. Show amounts in THB on the store cards, not in in-game coins.
- Start the 24-hour period only after the server verifies a successful payment and activates the entitlement. Store `activatedAt` and `expiresAt = activatedAt + 86,400,000 ms` as authoritative UTC timestamps. Display remaining duration in the UI. Expire automatically even when a player is offline.
- For repeat purchases while an item is active, use **duration extension** (append another 24 hours to the existing expiry), never stack to ×4. Each purchase has its own unique payment transaction ID.
- Validate Thai QR/Slip2Go payments on the backend with amount, recipient, transaction ID and replay prevention, and tie each payment to a specific user, product and order. Never activate from client-side success or an uploaded slip alone. Do not enable paid checkout before production verification passes.
- UI may display locked preview cards pending backend integration; do not claim a purchase succeeded without persistent server confirmation.
- Explicit fairness note: leaderboard is boosted by paid/purchased power-ups. Show current effects and rules to all competitors.

## Deployment integrity
The repository README as inspected 2026-10-30 says current main is an **offline prototype** with 26×26 tiles, 3 map styles and 3-minute rounds, whereas the user's screenshot of a visually polished 36×36 build appears to be from a different/newer deployed code version. Before touching gameplay files, locate and import the exact source of that deployed version, then create a feature PR against it. Do not overwrite the polished working build with older index.html.

## Acceptance tests
1. Exactly Free and VIP on selector; forest only; exactly 100×100; unlimited play time.
2. Mobile joystick, collision, camera/minimap, and rendering remain smooth.
3. Two clients share coins/chest positions; concurrent pickup grants one winner; coin respawns at +60 seconds.
4. Chest reward distribution test using >=100k server-side simulated draws; no client-influenced reward, no double credit; global +4h countdown.
5. One score per player/season: map coin +1 (+2 when booster active); chest reward adds its face value; live board updated; reset isolated by server.
6. Shop is accessible during play; X2 movement and pickup multiplier validated on backend and tested for expiration.
7. No real-money payment or public rollout before secure integration tests.
