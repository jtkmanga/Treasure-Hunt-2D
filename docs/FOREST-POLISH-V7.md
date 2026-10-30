# Forest V7 — unified art polish for real mobile gameplay

## Issues observed in owner's V6 Android screenshots
- Dirt roads were a visible checkerboard of rectangles; wood bridges a uniform grid.
- River tiles have harsh rectangular banks.
- Pine forest lacked species/height variation, rocks sometimes lined up.
- Ground texture was flat and collectibles looked detached from the landscape.

## Changes
- 64 43×43 pre-rasterized transparent dirt overlays; N/E/S/W neighbor mask creates rounded continuous wandering paths over textured grass, avoiding per-frame raster loops.
- Shoreline draw based on the exact map.water neighbors, with broken grass/clay banks and short ripples replacing straight light-blue boundary stripes.
- 12 locally drawn tree sprite variants, now including tiered pines with shadow and mixed deciduous canopies. Rocks have slight scale/position variation, while still occupying only original blocked tiles.
- More textured and railed bridge planks over actual walkable bridge tiles. Treasure pedestal, torches and subtle low-cost coin glints.
- Preserved V6 canonical data, spawn, 82 coin positions, 3-minute run engine, score replay, minimap, touch controls and fullscreen layout.
- Mild premium teal/gold HUD finish. No GPU-heavy CSS blur, no downloaded sprites or screenshots, no paid services.

## Boundaries
This pass does NOT promise exact pixel-level parity with the reference concept illustration; getting there would need carefully authored sprite atlases and more art time. V7 remains offline PRACTICE with no trusted score uploads, real leaderboard, payments or VIP changes.

## Test and deploy
GitHub Actions runs the complete existing auth/anti-cheat/security test suite, renderer non-mutation test and V7 art checks; then creates an 11-file mobile Pages ZIP with existing V1 and /login/ preserved. The owner deploys the artifact manually to Cloudflare Pages `treasure-hunt-2d-jtk` and checks /ranked-preview/ in Android landscape. The old versioned engine stays compatible.
