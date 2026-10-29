# Reference V4 art/camera redesign

User's two comparison screenshots show that V3 is too zoomed in and its blocky forest/rivers/cliffs differ markedly from the detailed fantasy pixel-forest illustration.

## V4 changes
- Camera scale: official map tile displays at 43 CSS px vs V3 74 (about 1.72x wider visual field). World coordinates and speed remain identical.
- Original more intricate asymmetric 96x118 pixel treetops with layered highlights/shadows, textured dirt paths, less stark tiled grass and water ripples.
- Waterfalls now occur rarely at legitimate rock/water boundaries, with a single exterior decorative cascade rather than a repeated wall of blue rectangles.
- Larger reference-style minimap and portrait forest thumbnail, top HUD teal frames, score, coins and timer all overlay gameplay.
- Mobile landscape joy, collect, pause, full-screen, server-aligned replay and 3-minute timer remain.
- No downloaded or embedded copyrighted/third-party art, no static screenshot background. This original procedural pixel art approximates the requested image but will not match each pixel. Additional pixel artist assets would be needed for exact studio-grade fidelity.
- Source engine `src/online/run-engine.mjs` and original website `index.html` and `/login/` unchanged. No VIP, payments, rewards, ranking writes, real-money or multiplayer.
- No Cloudflare Worker / Firebase / D1 changes or paid infrastructure.
- Draft PR. User must manually deploy ZIP to existing `treasure-hunt-2d-jtk` Pages project and test real Android Chrome landscape.

## Validation
`npm test` checks login security, gameplay replay parity, camera size and UI components. Artifact preserves 10 site files and has no secrets. CI does not deploy.
