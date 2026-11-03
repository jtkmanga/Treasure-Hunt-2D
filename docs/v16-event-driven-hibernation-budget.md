# Treasure Hunt 2D — Event-driven movement + WebSocket Hibernation prototype

**Status:** separate GitHub development branch only. NO real game deploy, no public WebSocket listener, no Firebase/Closed Beta changes, no Paid upgrade, no changes to Free/VIP score, 200 coins, Lucky Box or Admin/PITR.

## Goal

One Free Server **world** for up to 10,000 simultaneous signed-in users remains the product goal, but this is **not a proven 10,000-person online test**. We want to reduce expensive messages while preserving responsive mobile movement and server-authoritative anti-cheat.

## What this prototype contains

1. `src/v16-online/event-mobile-input.mjs`: purely local on-device direction event coalescing. It sends `start`, `change`, and `stop` when input changes, collapses rapid analog updates into the latest direction, and sends a moving `heartbeat` every ~3 seconds while a player is moving. **At idle it emits zero application heartbeat frames**. It has no timers or global browser side effects. This file is not wired into the accepted V16.26 mobile controls yet.
2. `src/v16-online/event-input.mjs`: server-only authoritative event movement prototype. Clients cannot specify coordinates, UIDs, server timestamps, coin claims, velocity over 100%, or the room name. Strict monotonic sequences and bounded event rates suppress replay/spam. It integrates through the **existing collision-checked `V16Room.move`** in increments no larger than 200ms. A delayed 60s message may earn at most 4s of movement, then requires a position re-sync rather than granting a teleport. No event grants coins or mutates scores.
3. `src/v16-online/hibernating-event-probe.mjs`: **synthetic-only** Durable Object WebSocket Hibernation class. Uses `state.acceptWebSocket`, `webSocketMessage`, `webSocketClose`, serialized per-socket attachments and optional ping auto-response. It accepts **only test actors** and returns acknowledgments explicitly marked `authoritative:false` — **not real player positions** or rewards. It never broadcasts to all sockets or writes score/coin state.
4. `src/v16-event-probe/worker.mjs` with `wrangler.v16-event-probe.jsonc`: separate operator-only probe Worker, default **`EVENT_PROBE_ENABLED=false`** and **`EVENT_PROBE_BILLING_REVIEWED=false`**. Requires a high-entropy operator token from a private header and a separate internal secret before a synthetic WebSocket handshake reaches a dedicated `EVENT_PROBE_ROOMS` Durable Object. No binding to current `ROOMS`, `ZONE_ROOMS`, Google/Firebase, Admin, payments, or actual player worlds. **Do not deploy this as a public game WebSocket**. Browser WebSocket clients cannot supply those custom headers by default.
5. `scripts/v16-realtime-budget-model.mjs`: incoming-message-only sensitivity model comparing 0/5/10/100% continuous movement with idle connections emitting no app messages, plus a 5% case with 60-second idle keepalives. It uses Cloudflare's 20 incoming WebSocket messages per billed DO request conversion. Every report explicitly says **full bill unknown and $10 ceiling not proven**.
6. Extensive Node tests prove no idle client frames, coalesced analog changes, monotonic authenticated server sessions, no duplicates, no fake coordinates, bounded 4s elapsed credits, collision safety, Hibernation attachment protocol, gateway flag and operator token rejection, and zero real game score mutations.

## Source of truth stays central

The existing Free Server's canonical world must retain global coin positions/cooldowns, the unique Lucky Box and atomic score ledger. Event-driven movement should eventually be integrated **behind verified Google Firebase Auth, App Check, beta admission and a one-use short-lived WebSocket ticket**, not the synthetic operator-token canary. Any eventual nearby-player broadcasts must go only to 24 nearby actors, with an upper limit on packets and a way to correct missed moves. The current prototype deliberately does **not** claim true multiplayer voice/screen or 10K concurrency.

## Cost implications — conservative warning

Official Cloudflare docs:
- [Durable Objects WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) — idling DOs may hibernate and stop active duration billing.
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) — incoming WS messages are rounded to 1 billed DO request per 20 incoming messages; active duration, storage and other usage still apply.

The budget model evaluates **30 days of 10,000 concurrent sessions**, 3s moving heartbeats, and optional idle traffic. A fully idle socket does not need to send an app heartbeat, but **connection count is not proof that active duration and server traffic cost zero**. Server-validated gameplay and outbound regional broadcasts require extra CPU/requests/storage that the model does **not** include. For an active server with significant continuous movement, $5–10/month may be economically impossible without sacrificing update frequency, capping simultaneous activity or accepting actual scaling and cost measurements.

## Release gates before any game integration

1. GitHub `npm test` and a dedicated isolated Wrangler `--dry-run` must pass. No production deploy/merge. PR remains draft until reviewed.
2. Design and test a **one-time, expiry-bound WebSocket upgrade ticket** minted only after Google Login + App Check + active-user checks. The synthetic operator token is **not** a substitute for gameplay authentication.
3. Bind each signed user to one authoritative movement session, persistent anti-replay epoch, and on-demand server position checks before awarding global coins. Test slow networks, mobile background/foreground, reconnect, 24-neighbor visibility and no ghost avatars.
4. During actual cloud canary approval, compare **active vs idle** DO Duration, incoming messages, CPU, storage/billing and eventual outgoing fan-out; stop at the owner's hard budget. The Cloudflare account's Billing API is unavailable to this connector, and a billing screenshot alone has not established an account-level spending ceiling.
5. Test **real** concurrent signed traffic progressively 100 → 1,000 → 10,000 with measured 429/5xx, frame accuracy and costs. Only then consider a public Free Server capacity statement.

## Owner action (mobile)

**No purchase, secret sharing or Cloudflare setting is required now.** Keep Workers Free for the code-only milestone. The new branch and GitHub Actions can run without creating billable Durable Objects. Do not use `Confirm upgrade` and do not enable Public writes or Admin/PITR. When asked to review real mobile gameplay later, only test the provided Staging URL and report joystick smoothness or lag — *not* production.
