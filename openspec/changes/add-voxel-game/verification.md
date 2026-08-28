# Verification Matrix — add-voxel-game

Maps every requirement to its specification, implementation, test/validation method, status, and evidence.
Evidence below combines the original implementation verification with the hardening and survival/inventory/world-simulation expansion passes executed on 2026-08-13 (Node 22/24, npm 11, Chromium via Playwright). The current working tree is authoritative for behavior and counts.

## Global verification

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm install` | Pass |
| Type-check | `npm run typecheck` (_tsc --noEmit_) | Pass (exit 0) |
| Lint | `npm run lint` (_eslint ._) | Pass (0 problems) |
| Unit tests | `npm test` (_vitest run_) | Pass (114/114 across 14 files) |
| Production build | `npm run build` | Pass (dist/ built) |
| Browser tests | `npm run test:e2e` (_playwright test_) | Pass (19/19) |
| Production dependency audit | `npm audit --omit=dev` | Pass (0 vulnerabilities) |
| Headless runtime tier | headless Chromium, 1280×720 | Render distance 2, DPR 1, shadows disabled; visual capture observed 22 FPS in the captured frame and remained responsive through the suite |
| Production smoke | Playwright production preview | No page errors or console errors in the browser suite; CSP present; gameplay and crafting screenshots captured and inspected; pointer-lock release/relock pass |

## Requirement traceability

| ID | Requirement / Scenario | Spec | Implementation | Verification | Status |
| --- | --- | --- | --- | --- | --- |
| REND-01 | WebGL renderer + game loop with clamped delta time | specs/rendering/spec.md | src/engine/Renderer.ts, GameLoop.ts | Type-check + e2e "initializes" | Pass |
| REND-02 | Pixel-ratio handling, responsive resize | specs/rendering/spec.md | src/engine/Renderer.ts | e2e "initializes"; layout probe at 1920×1080 & 1366×768 | Pass |
| REND-03 | Chunk-level meshes, hidden-face removal, ≤2 meshes/chunk | specs/rendering/spec.md | src/world/ChunkMesher.ts | Unit tests (5): hidden faces, lone block = 6 faces, water transparency | Pass |
| REND-04 | Texture atlas, per-face UV mapping, shared materials | specs/rendering/spec.md | src/rendering/TextureAtlas.ts, Materials.ts | Unit: registry per-face tiles; e2e "renders textured terrain" | Pass |
| REND-05 | Culling, fog, transparency | specs/rendering/spec.md | src/world/World.ts, Environment.ts, Materials.ts | Pixel probe (grass/stone/water/sky present) | Pass |
| REND-06 | GPU resource disposal on unload | specs/rendering/spec.md | src/world/World.ts (`removeMeshesForChunk`) | Static review; memory probe stable | Pass |
| WORLD-01 | Seeded deterministic generation; no Math.random | specs/world-generation/spec.md | src/math/PRNG.ts, Noise.ts, TerrainGenerator.ts | Unit: determinism, differing seeds, noise reproducibility | Pass |
| WORLD-02 | Layer composition (grass/dirt/stone/sand/gravel/snow/water/bedrock) | specs/world-generation/spec.md | src/world/TerrainGenerator.ts | Unit: bedrock at y=0, biome surfaces, sand, gravel, water | Pass |
| WORLD-03 | Deterministic trees crossing chunk borders exactly once | specs/world-generation/spec.md | src/world/TerrainGenerator.ts (owner-based canopy) | Unit: tree presence; continuity at negative coords | Pass |
| WORLD-04 | Chunk-boundary continuity & negative coordinates | specs/world-generation/spec.md | src/world/TerrainGenerator.ts | Unit: continuity, negative coords | Pass |
| WORLD-05 | Deterministic coal and iron ore distribution | specs/world-generation/spec.md | src/world/TerrainGenerator.ts | Unit: distant ore scan and same-seed comparison | Pass |
| WORLD-06 | Deterministic deep lava pockets outside spawn ring | specs/world-generation/spec.md | src/world/TerrainGenerator.ts | Unit: distant lava scan and same-seed comparison | Pass |
| CHUNK-01 | Storage + coordinate conversion incl. negatives | specs/chunk-system/spec.md | src/world/WorldCoordinates.ts, Chunk.ts | Unit: -1 → chunk -1/local 15, round-trips | Pass |
| CHUNK-02 | Cross-chunk block lookup | specs/chunk-system/spec.md | src/world/World.ts, ChunkManager.ts | Unit: World.test boundary reads | Pass |
| CHUNK-03 | Lifecycle states, bounded queues, stale-job guards | specs/chunk-system/spec.md | src/world/Chunk.ts, World.ts | Unit: queue bounding; static review of version guards | Pass |
| CHUNK-04 | Dirty state + neighbor remeshing on boundary edits | specs/chunk-system/spec.md | src/world/World.ts (`setBlock`) | Unit: World.test boundary edit | Pass |
| CHUNK-05 | Unload removes meshes, disposes resources, releases storage | specs/chunk-system/spec.md | src/world/World.ts (`unloadChunks`) | Unit: World.test edit-survives-unload | Pass |
| CHUNK-06 | Unsupported sand/gravel settles with bounded updates | specs/chunk-system/spec.md | src/world/World.ts (`fallingQueue`, `processFallingBlocks`) | Unit: World.test granular fall | Pass |
| STREAM-01 | Load within render distance, unload beyond | specs/chunk-streaming/spec.md | src/world/World.ts (`update`) | e2e "chunks stream as player explores"; stats probe (loaded=323 bounded) | Pass |
| STREAM-02 | Frame-distributed bounded work | specs/chunk-streaming/spec.md | src/config/index.ts budgets; World.ts queues | Perf probe: no freezes while sprint-streaming | Pass |
| STREAM-03 | Deterministic regeneration | specs/chunk-streaming/spec.md | src/world/TerrainGenerator.ts | Unit determinism; World.test regenerate | Pass |
| STREAM-04 | Edit persistence across unload/reload and refresh | specs/chunk-streaming/spec.md | src/world/World.ts (`editOverlay`, `exportEdits`, `importEdits`) + Game localStorage bridge | Unit: World.test edit survives unload/reload and validates save snapshots | Pass |
| PLAYER-01 | Pointer lock, mouse look, pitch clamp | specs/player-controller/spec.md | src/engine/InputManager.ts, PlayerController.ts | e2e "shows overlay & hides on pointer lock" | Pass |
| PLAYER-02 | WASD/sprint/jump, delta-time movement | specs/player-controller/spec.md | src/player/PlayerController.ts | e2e "player moves when WASD held", "jump & gravity" | Pass |
| PLAYER-03 | Gravity + ground detection, no fall-through | specs/player-controller/spec.md | src/player/PlayerPhysics.ts, World.ts (solid below y<0, spawn preload) | e2e "jump & gravity"; fall-reproduction probe fixed (y stays 34) | Pass |
| PLAYER-04 | AABB voxel collision, axis-separated + practical step-up | specs/player-controller/spec.md | src/player/PlayerPhysics.ts | Unit: PlayerPhysics (floor, wall, no fall-through, one-block step, two-block wall) | Pass |
| PLAYER-05 | Safe spawn above valid terrain and water-aware movement | specs/player-controller/spec.md | src/engine/Game.ts + PlayerPhysics/PlayerController | e2e init; unit swim buoyancy coverage | Pass |
| BLOCK-01 | Amanatides & Woo raycast, accurate targeting | specs/block-interaction/spec.md | src/math/DDA.ts | Unit: DDA (axial, diagonal, negatives, miss, reach) | Pass |
| BLOCK-02 | Destroy breakable, bedrock protected | specs/block-interaction/spec.md | src/player/PlayerInteraction.ts | e2e "player can target and break a block"; registry unit (bedrock breakable=false) | Pass |
| BLOCK-03 | Place adjacent, reject self-intersection/occupied | specs/block-interaction/spec.md | src/player/PlayerInteraction.ts (AABB check) | e2e "player can place a block from the hotbar" (Stone placed above target) | Pass |
| BLOCK-04 | Selection outline + cooldown | specs/block-interaction/spec.md | src/player/PlayerInteraction.ts (outline, `actionCooldown`) | Static review | Pass |
| BLOCK-05 | Immediate remesh incl. boundary neighbors | specs/block-interaction/spec.md | src/world/World.ts (`setBlock` → enqueueMesh + neighbor dirty) | Unit: World boundary edit | Pass |
| BLOCK-06 | Hardness-based held breaking, release reset, and block drops | specs/block-interaction/spec.md | src/player/PlayerInteraction.ts, BlockRegistry.ts | Unit: PlayerInteraction (3); e2e break | Pass |
| BLOCK-07 | Ore blocks yield coal/raw-iron material drops | specs/block-interaction/spec.md | src/player/PlayerInteraction.ts, BlockRegistry.ts | Unit: ore drop interaction | Pass |
| REG-01 | Centralized registry, no hardcoded ids | specs/block-registry/spec.md | src/world/BlockRegistry.ts | Unit: 6 registry tests | Pass |
| REG-02 | Definition properties (solid/opaque/breakable/placeable/UVs) | specs/block-registry/spec.md | src/world/BlockRegistry.ts | Unit: property access | Pass |
| REG-03 | Nine core plus expanded placeable blocks | specs/block-registry/spec.md | src/world/BlockRegistry.ts | Unit: required set and expanded placeables present | Pass |
| REG-04 | Original procedural textures | specs/block-registry/spec.md | src/rendering/TextureAtlas.ts | Static review (canvas-generated tiles) | Pass |
| REG-05 | Hardness metadata and Apple food item | specs/block-registry/spec.md | src/world/BlockRegistry.ts, TextureAtlas.ts | Registry unit + production visual smoke | Pass |
| REG-06 | Ore, masonry, lava, and food registration | specs/block-registry/spec.md | src/world/BlockRegistry.ts, TextureAtlas.ts | Registry unit + terrain/visual smoke | Pass |
| REG-07 | Stick and durable tool registration | specs/block-registry/spec.md | src/world/BlockRegistry.ts, TextureAtlas.ts | Registry unit + e2e crafting | Pass |
| REG-08 | Coal and raw-iron material registration/drop mapping | specs/block-registry/spec.md | src/world/BlockRegistry.ts, TextureAtlas.ts | Registry + ore-drop unit | Pass |
| INV-01 | Hotbar slots, icons, selection highlight | specs/inventory-hotbar/spec.md | src/inventory/Hotbar.ts | e2e "crosshair and hotbar visible" (9 slots) | Pass |
| INV-02 | Number-key + wheel selection w/ wraparound | specs/inventory-hotbar/spec.md | src/inventory/Inventory.ts, InputManager.ts, Game.ts | e2e "number keys", "wheel wraps"; Unit: Inventory (10) | Pass |
| INV-03 | Block-name display on selection change | specs/inventory-hotbar/spec.md | src/ui/HUD.ts, Game.ts | e2e "wheel wraps" asserts name chip non-empty | Pass |
| INV-04 | Placement uses selected slot | specs/inventory-hotbar/spec.md | src/player/PlayerInteraction.ts + BlockSelector | Static review | Pass |
| INV-05 | Responsive readability | specs/inventory-hotbar/spec.md | src/styles.css | Layout probe at 1920×1080 and 1366×768 | Pass |
| INV-06 | Stackable hotbar/storage quantities and validated snapshots | specs/inventory-hotbar/spec.md | src/inventory/Inventory.ts | Unit: Inventory (14) | Pass |
| INV-07 | Transactional nine-recipe crafting chain | specs/inventory-hotbar/spec.md | src/inventory/Crafting.ts | Unit: Crafting (5); e2e crafting through wooden pickaxe | Pass |
| INV-10 | Tool durability snapshot, mining wear, and hotbar feedback | specs/inventory-hotbar/spec.md | src/inventory/Inventory.ts, Hotbar.ts, PlayerInteraction.ts | Unit inventory/interaction + e2e tool label | Pass |
| INV-08 | Inventory/crafting modal with 9 + 27 cells | specs/inventory-hotbar/spec.md, specs/user-interface/spec.md | src/ui/CraftingPanel.ts, index.html | e2e crafting + visual capture | Pass |
| INV-09 | Apple food use | specs/inventory-hotbar/spec.md | src/engine/Game.ts, SurvivalSystem.ts | e2e food-use assertion | Pass |
| LIGHT-01 | Hemisphere + directional sun, readable surfaces | specs/lighting-environment/spec.md | src/rendering/Lighting.ts | Pixel probe (distinguishable lit faces) | Pass |
| LIGHT-02 | Sky + fog tuned to render distance with day/night tinting | specs/lighting-environment/spec.md | src/rendering/Environment.ts, Lighting.ts | Pixel probe (sky/fog present); e2e terrain test | Pass |
| LIGHT-03 | Water distinct & semi-transparent | specs/lighting-environment/spec.md | src/rendering/Materials.ts, TextureAtlas.ts | Pixel probe (water blue detected); mesher unit (transparent geometry) | Pass |
| LIGHT-04 | Day-night cycle stable and synchronized with sky | specs/lighting-environment/spec.md | src/rendering/Lighting.ts + Environment.ts (`dayNight.enabled`) | Static review; production build smoke | Pass |
| LIGHT-05 | HUD world clock follows day/night phase | specs/user-interface/spec.md, specs/lighting-environment/spec.md | src/rendering/Lighting.ts, src/ui/HUD.ts, src/engine/Game.ts | Production visual smoke shows clock | Pass |
| UI-01 | Crosshair + FPS counter | specs/user-interface/spec.md | src/ui/Crosshair.ts, HUD.ts | e2e "crosshair visible", "FPS updates" | Pass |
| UI-02 | Loading indicator tied to world readiness | specs/user-interface/spec.md | src/ui/LoadingIndicator.ts, Game.ts (`isReady(pcx,pcz)`) | e2e waits for loading hidden; probe | Pass |
| UI-03 | Pointer-lock instructions + pause/click-to-resume | specs/user-interface/spec.md | index.html overlay, Game.ts (`onLockChange`) | e2e "shows overlay & hides on pointer lock" | Pass |
| UI-04 | Init-error state for WebGL/DOM failures | specs/user-interface/spec.md | src/main.ts (`showFatalError`), Renderer `rendererCreated` | Static review | Pass |
| UI-05 | Debug overlay (pos/chunk/loaded/pending/triangles) | specs/user-interface/spec.md | src/ui/DebugOverlay.ts, Game.ts | e2e "debug overlay toggles with F3"; probe reads stats | Pass |
| UI-06 | Usable at 1920×1080 and 1366×768 | specs/user-interface/spec.md | src/styles.css | Layout probe both resolutions (all elements correctly placed) | Pass |
| UI-07 | Health and hunger HUD | specs/user-interface/spec.md, specs/survival-system/spec.md | src/ui/HUD.ts, Game.ts | e2e survival HUD | Pass |
| UI-08 | Break progress and action toasts | specs/user-interface/spec.md | index.html, styles.css, Game.ts | Unit interaction progress + visual gameplay capture | Pass |
| UI-09 | Pause-safe inventory/crafting modal | specs/user-interface/spec.md | CraftingPanel.ts, Game.ts | e2e crafting + visual capture | Pass |
| UI-10 | Tool durability indicator and break toast | specs/user-interface/spec.md, specs/inventory-hotbar/spec.md | Hotbar.ts, Game.ts, styles.css | Unit tool break + e2e crafted tool | Pass |
| SURV-01 | Health, hunger, saturation, hunger drain, regen | specs/survival-system/spec.md | src/player/SurvivalSystem.ts | Unit: SurvivalSystem (6) | Pass |
| SURV-02 | Fall damage and drowning | specs/survival-system/spec.md, specs/player-controller/spec.md | SurvivalSystem.ts, PlayerPhysics.ts | Unit survival + physics landing telemetry | Pass |
| SURV-03 | Death, respawn, and local player-state persistence | specs/survival-system/spec.md, specs/chunk-streaming/spec.md | Game.ts, SurvivalSystem.ts, Inventory.ts | Type-check, unit snapshots, browser gameplay smoke | Pass |
| SURV-04 | Lava exposure damage and lava telemetry | specs/survival-system/spec.md, specs/player-controller/spec.md | SurvivalSystem.ts, PlayerPhysics.ts | Unit: lava interval and physics detection | Pass |
| WORLD-SIM-01 | Deterministic passive critter herd | specs/world-simulation/spec.md | src/world/WorldLife.ts | Unit + e2e passive-life scene probe | Pass |
| WORLD-SIM-02 | Pause-safe passive movement and cleanup | specs/world-simulation/spec.md | src/world/WorldLife.ts, src/engine/Game.ts | Unit disposal + crafting pause flow | Pass |
| WORLD-SIM-03 | Bounded granular settling work | specs/world-simulation/spec.md | src/world/World.ts | Unit World falling-queue update | Pass |
| PERF-01 | Measurable desktop target + responsive headless tier | specs/performance/spec.md | config, renderer, engine + stream budgets | Desktop target documented; headless tier smoke measured 22–36 FPS with reduced ring/DPR/no shadows | Pass |
| PERF-02 | Bounded per-frame work, no long freezes | specs/performance/spec.md | src/config budgets + World queues | Perf probe: no freezes during sprint-streaming | Pass |
| PERF-03 | Memory bounded; unload releases resources | specs/performance/spec.md | World unload + dispose | Loaded-chunk bound, budgeted unload, and GPU disposal reviewed; current headless smoke completed without runtime errors | Pass |
| PERF-04 | Hot-path allocation avoidance | specs/performance/spec.md | PlayerInteraction scratch vectors, camera reuse | Static review | Pass |
| PERF-05 | Rebuild only dirty chunks + boundary neighbors | specs/performance/spec.md | World `setBlock` → localized remesh | Unit: World boundary test; design | Pass |
| PERF-06 | Unit + browser coverage | specs/performance/spec.md | tests/unit, tests/e2e | 114 unit + 19 e2e, all passing | Pass |

## Remaining issues

- None critical. Known scope extensions are greedy meshing, hostile AI/interactive mobs, mobile controls, ladders, slopes, and weather. Biomes, caves, clouds, day/night, world clock, browser save snapshots, swimming, lava behavior, one-block step-up traversal, stackable inventory, nine-recipe crafting, durable tools, granular settling, passive life, survival rules, and procedural audio are implemented and covered by unit/browser tests where practical.
