# V6 — coherent forest map, no pasted screenshot halves

## Why

Player screenshots of V5 show a severe image seam: the illustrated concept left side and the old procedural tile map right side are visually inconsistent. Earlier art mockups were never a real authored collision map. The approved direction is to rebuild the **entire playable map as one world**.

## Implementation

- Versioned 26×26 deterministic V6 canonical map (makeMapV6) built by the shared score engine `src/online/run-engine.mjs`: `tiles`, `water`, `path` and `bridge` matrices, 82 reachable coin sites, spawn at (12.5,13.5), treasure shrine at (22.5,7.5). Seed gives variation in natural obstacles without destroying the designed path/river/bridge network.
- Draws continuous winding dirt paths and the blue river from those matrices. Bridges are rendered **only over water tiles with traversable (0) authoritative collision**, so visual crossings match server movement. Trees and boulders only on collision tiles 1 and 2. The minimap uses that exact same map.
- The forest and water outside the playable boundary use the same original procedural pixel sprite set; there is **no external reference image or background image overlay**, no mismatched left/right images.
- Foreground sorting by world y allows the player and collectibles to appear in a scene built from one coherent map.
- The player has the same 3-minute offline practice, joystick, collect, map choice, pause and replay check. Coin/treasure gain is still computed only by the shared engine, not by client art.
- Existing GitHub root V1, Google Login and Firebase/App Check client files are kept unchanged inside Pages Direct Upload ZIP.
- This is a new visual level arrangement, NOT an exact pixel copy of the concept screenshot. The supplied concept is an artistic target; game-ready image assets and precise handcrafted art could refine future releases further.

## Safety and limits

- **Practice only.** No scores are uploaded, no real prize leaderboard, no paid VIP/payment, no new VPS/Workers deployment, no Firebase security weakening. Static Pages upload is manual.
- Default public demo seed is fixed; do not accept its results as anti-cheat proof.
- Since the canonical map changes, this branch must remain isolated from any live ranked sessions or historical run replay. Do not turn on online score writes without introducing explicit level/version IDs and server challenge identifiers.
- V6 must be checked on Android landscape for water/bridge reachability, collision, timer and CPU use. Local and GitHub automated tests verify structure/parity, not device-specific UX.

## How to install

Download the GitHub Actions artifact `Treasure-Hunt-2D-V6-Cohesive-Playable-Map` and upload it to the existing `treasure-hunt-2d-jtk` Cloudflare Pages project as a new Direct Upload deployment. Open `/ranked-preview/` with landscape orientation.

### Compatibility guard
Legacy `makeMap`, `createRunSession` and `replayRun` remain byte-compatible with the original test fixtures and any historical saved run IDs. V6 uses `makeMapV6`, `createRunSessionV6` and `replayRunV6` explicitly. Do not replay any old run as V6 or vice versa.
