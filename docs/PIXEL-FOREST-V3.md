# Pixel Forest V3 — visual art pass 2

Approved original visual target: lush fantasy 16-bit-looking forest with winding paths, rivers, cliff waterfalls, wooden bridge, rich flora, warm gold-edged HUD, translucent analog and gold collect button.

## Changes
- Kept the same reliable mobile landscape orientation UI, 3-minute in-game HUD, Pause, minimap, joystick and collect control.
- Added a self-contained pixel-art rendering module, **scenic-details.mjs**, that draws original small reusable 2D sprite canvases for river foam/waterfalls, rocky cliff walls, lily pads, fern clusters, stumps, wooden boardwalks, lamp posts, signboards and crates. Added trees/scene layering and a slightly clearer hero sprite.
- Visual accents are drawn separately from authoritative tiles. Bridges/boardwalks are drawn **only on existing walkable safe tiles**, never across collision-water or blocking obstacles; waterfalls decorate existing water or non-playable out-of-bounds areas. Visuals never grant walking, prizes or extra coins.
- Changed fantasy HUD frame to gold-edged and improved buttons/mini-map contrast. No external image request or asset, so the preview stays free and static.
- Same exact `run-engine.mjs` source shared with previous score replay; 3 levels and 900 ticks at 200ms unchanged.
- Does **not** match every pixel of the concept illustration: this is implementable optimized procedural art for mobile, not a static image background.
- Public game root index.html and /login/ retained unchanged; all added files are under `/ranked-preview/`.
- GitHub CI packages a ten-file Pages ZIP preserving root, login, auth-client and new scene; **no automatic deployment**.

## Safety
No server writes, WebSockets, score ranking, payments, VIP, Firebase Enforcement, or paid VPS. Source branch and PR are drafts and isolated from GPT-VOXEL-3D.

## How to preview
Upload the ZIP to Cloudflare Pages `treasure-hunt-2d-jtk` through Create deployment on phone. Open `https://treasure-hunt-2d-jtk.pages.dev/ranked-preview/` in landscape. Tap Start/Fullscreen and move using analog + collect.
