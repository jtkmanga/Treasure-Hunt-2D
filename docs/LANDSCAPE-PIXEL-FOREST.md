# Pixel Forest landscape UI — mobile-only visual upgrade

User approved an original concept image with rich top-down 16-bit-style pixel forest, landscape full-screen play, mini-map, HUD at top, gold collect button, and left analog movement control.

## Working browser implementation

- The existing `/ranked-preview/` is now a **landscape-only fullscreen game** using CSS fixed viewport and safe-area padding, with Android/Chrome best-effort Fullscreen + Orientation Lock on a real user gesture; portrait shows a rotate-phone panel. Browser limitations mean landscape rotation cannot be forced on every device; rotate manually if necessary.
- Score / collected coins / 03:00 timer / stage / pause and mini-map appear on top of the game scene, rather than as separate sections below.
- New original self-contained low-resolution pixel sprites and tile textures in `ranked-preview/pixel-art.mjs`: lush grass, dirt paths, forest trees, water, rocks, mushrooms, wildflowers, 16-bit-looking hero, coins and glowing chest. Sprites are rendered locally; no external images, remote resources, tracking or WebSocket.
- Virtual joystick handles pointer movements and maps them to the same signed -1 / 0 / 1 frame inputs consumed by `advanceRunTick()`. Collect button raises one input event; WASD/arrows/space also work.
- 900 × 200ms game frames, 60s coin cooldown and +10/+100 score stay in `run-engine.mjs` unchanged. UI timer pauses when the user opens the menu, switches away, locks screen, or loses focus; gameplay resumes by tapping the button. The simulated score replay at round end is local only.
- 3 maps remain selectable from pause/start menu. The minimap uses the real 26×26 generated terrain.
- The game currently uses locally drawn pixel art based on the approved concept's art direction, not pixel-for-pixel extraction of the image. Source textures are original code-generated artwork, not embedded fixed screenshot.

## Safety and deployment

- **No paid server or new VPS**, and no Firebase or D1 requests by this visual demo. The main game's public page, `/login/` Firebase auth and Cloudflare 2D Staging Worker are unchanged.
- ZIP includes 9 static files: original V1 `index.html`, original Login + Firebase client files, new `/ranked-preview/` game files and exact server engine copied for parity. Review CI before uploading ZIP to Pages.
- Keep competitive score writes, VIP purchases, real payments and enforcement **off**.
- The fullscreen/landscape implementation must be visually verified on Android Chrome/Samsung Browser; screen orientation APIs may be unavailable until fullscreen permission.
