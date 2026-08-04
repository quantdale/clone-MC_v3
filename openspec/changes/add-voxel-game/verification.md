# Verification Matrix — add-voxel-game

Maps every requirement to its specification, implementation, test/validation method, status, and evidence.
Evidence was produced by executing the listed commands on 2026-08-04 (Node 24, npm 11, Chromium via Playwright).

## Global verification

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm install` | Pass |
| Type-check | `npm run typecheck` (_tsc --noEmit_) | Pass (exit 0) |
| Lint | `npm run lint` (_eslint ._) | Pass (0 problems) |
| Unit tests | `npm test` (_vitest run_) | Pass (76/76) |
| Production build | `npm run build` | Pass (dist/ built) |
| Browser tests | `npm run test:e2e` (_playwright test_) | Pass (14/14) |
| FPS at render distance 8 | headless Chromium + ANGLE, 1280×720 | ~60.2 FPS idle & while sprint-streaming |
| Memory stability | extended exploration (`performance.memory`) | 110.6 MB, no growth during streaming |

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
| WORLD-02 | Layer composition (grass/dirt/stone/sand/water/bedrock) | specs/world-generation/spec.md | src/world/TerrainGenerator.ts | Unit: bedrock at y=0, grass above sea level, sand, water | Pass |
| WORLD-03 | Deterministic trees crossing chunk borders exactly once | specs/world-generation/spec.md | src/world/TerrainGenerator.ts (owner-based canopy) | Unit: tree presence; continuity at negative coords | Pass |
| WORLD-04 | Chunk-boundary continuity & negative coordinates | specs/world-generation/spec.md | src/world/TerrainGenerator.ts | Unit: continuity, negative coords | Pass |
| CHUNK-01 | Storage + coordinate conversion incl. negatives | specs/chunk-system/spec.md | src/world/WorldCoordinates.ts, Chunk.ts | Unit: -1 → chunk -1/local 15, round-trips | Pass |
| CHUNK-02 | Cross-chunk block lookup | specs/chunk-system/spec.md | src/world/World.ts, ChunkManager.ts | Unit: World.test boundary reads | Pass |
| CHUNK-03 | Lifecycle states, bounded queues, stale-job guards | specs/chunk-system/spec.md | src/world/Chunk.ts, World.ts | Unit: queue bounding; static review of version guards | Pass |
| CHUNK-04 | Dirty state + neighbor remeshing on boundary edits | specs/chunk-system/spec.md | src/world/World.ts (`setBlock`) | Unit: World.test boundary edit | Pass |
| CHUNK-05 | Unload removes meshes, disposes resources, releases storage | specs/chunk-system/spec.md | src/world/World.ts (`unloadChunks`) | Unit: World.test edit-survives-unload | Pass |
| STREAM-01 | Load within render distance, unload beyond | specs/chunk-streaming/spec.md | src/world/World.ts (`update`) | e2e "chunks stream as player explores"; stats probe (loaded=323 bounded) | Pass |
| STREAM-02 | Frame-distributed bounded work | specs/chunk-streaming/spec.md | src/config/index.ts budgets; World.ts queues | Perf probe: no freezes while sprint-streaming | Pass |
| STREAM-03 | Deterministic regeneration | specs/chunk-streaming/spec.md | src/world/TerrainGenerator.ts | Unit determinism; World.test regenerate | Pass |
| STREAM-04 | In-session edit persistence (overlay) | specs/chunk-streaming/spec.md | src/world/World.ts (`editOverlay`, `applyEditOverlay`) | Unit: World.test edit survives unload/reload | Pass |
| PLAYER-01 | Pointer lock, mouse look, pitch clamp | specs/player-controller/spec.md | src/engine/InputManager.ts, PlayerController.ts | e2e "shows overlay & hides on pointer lock" | Pass |
| PLAYER-02 | WASD/sprint/jump, delta-time movement | specs/player-controller/spec.md | src/player/PlayerController.ts | e2e "player moves when WASD held", "jump & gravity" | Pass |
| PLAYER-03 | Gravity + ground detection, no fall-through | specs/player-controller/spec.md | src/player/PlayerPhysics.ts, World.ts (solid below y<0, spawn preload) | e2e "jump & gravity"; fall-reproduction probe fixed (y stays 34) | Pass |
| PLAYER-04 | AABB voxel collision, axis-separated | specs/player-controller/spec.md | src/player/PlayerPhysics.ts | Unit: PlayerPhysics (floor, wall, no fall-through) | Pass |
| PLAYER-05 | Safe spawn above valid terrain | specs/player-controller/spec.md | src/engine/Game.ts (`spawnPlayerSafely` flat-area check) + `World.preloadChunks` | e2e init; probe: spawn y=34 on solid ground | Pass |
| BLOCK-01 | Amanatides & Woo raycast, accurate targeting | specs/block-interaction/spec.md | src/math/DDA.ts | Unit: DDA (axial, diagonal, negatives, miss, reach) | Pass |
| BLOCK-02 | Destroy breakable, bedrock protected | specs/block-interaction/spec.md | src/player/PlayerInteraction.ts | e2e "player can target and break a block"; registry unit (bedrock breakable=false) | Pass |
| BLOCK-03 | Place adjacent, reject self-intersection/occupied | specs/block-interaction/spec.md | src/player/PlayerInteraction.ts (AABB check) | e2e "player can place a block from the hotbar" (Stone placed above target) | Pass |
| BLOCK-04 | Selection outline + cooldown | specs/block-interaction/spec.md | src/player/PlayerInteraction.ts (outline, `actionCooldown`) | Static review | Pass |
| BLOCK-05 | Immediate remesh incl. boundary neighbors | specs/block-interaction/spec.md | src/world/World.ts (`setBlock` → enqueueMesh + neighbor dirty) | Unit: World boundary edit | Pass |
| REG-01 | Centralized registry, no hardcoded ids | specs/block-registry/spec.md | src/world/BlockRegistry.ts | Unit: 5 registry tests | Pass |
| REG-02 | Definition properties (solid/opaque/breakable/placeable/UVs) | specs/block-registry/spec.md | src/world/BlockRegistry.ts | Unit: property access | Pass |
| REG-03 | All nine required blocks | specs/block-registry/spec.md | src/world/BlockRegistry.ts | Unit: required set present | Pass |
| REG-04 | Original procedural textures | specs/block-registry/spec.md | src/rendering/TextureAtlas.ts | Static review (canvas-generated tiles) | Pass |
| INV-01 | Hotbar slots, icons, selection highlight | specs/inventory-hotbar/spec.md | src/inventory/Hotbar.ts | e2e "crosshair and hotbar visible" (9 slots) | Pass |
| INV-02 | Number-key + wheel selection w/ wraparound | specs/inventory-hotbar/spec.md | src/inventory/Inventory.ts, InputManager.ts, Game.ts | e2e "number keys", "wheel wraps"; Unit: Inventory (7) | Pass |
| INV-03 | Block-name display on selection change | specs/inventory-hotbar/spec.md | src/ui/HUD.ts, Game.ts | e2e "wheel wraps" asserts name chip non-empty | Pass |
| INV-04 | Placement uses selected slot | specs/inventory-hotbar/spec.md | src/player/PlayerInteraction.ts + BlockSelector | Static review | Pass |
| INV-05 | Responsive readability | specs/inventory-hotbar/spec.md | src/styles.css | Layout probe at 1920×1080 and 1366×768 | Pass |
| LIGHT-01 | Hemisphere + directional sun, readable surfaces | specs/lighting-environment/spec.md | src/rendering/Lighting.ts | Pixel probe (distinguishable lit faces) | Pass |
| LIGHT-02 | Sky + fog tuned to render distance | specs/lighting-environment/spec.md | src/rendering/Environment.ts | Pixel probe (sky/fog present); e2e terrain test | Pass |
| LIGHT-03 | Water distinct & semi-transparent | specs/lighting-environment/spec.md | src/rendering/Materials.ts, TextureAtlas.ts | Pixel probe (water blue detected); mesher unit (transparent geometry) | Pass |
| LIGHT-04 | Day-night cycle optional, stable | specs/lighting-environment/spec.md | src/rendering/Lighting.ts (`dayNight.enabled`, default off) | Static review | Pass |
| UI-01 | Crosshair + FPS counter | specs/user-interface/spec.md | src/ui/Crosshair.ts, HUD.ts | e2e "crosshair visible", "FPS updates" | Pass |
| UI-02 | Loading indicator tied to world readiness | specs/user-interface/spec.md | src/ui/LoadingIndicator.ts, Game.ts (`isReady(pcx,pcz)`) | e2e waits for loading hidden; probe | Pass |
| UI-03 | Pointer-lock instructions + pause/click-to-resume | specs/user-interface/spec.md | index.html overlay, Game.ts (`onLockChange`) | e2e "shows overlay & hides on pointer lock" | Pass |
| UI-04 | Init-error state for WebGL/DOM failures | specs/user-interface/spec.md | src/main.ts (`showFatalError`), Renderer `rendererCreated` | Static review | Pass |
| UI-05 | Debug overlay (pos/chunk/loaded/pending/triangles) | specs/user-interface/spec.md | src/ui/DebugOverlay.ts, Game.ts | e2e "debug overlay toggles with F3"; probe reads stats | Pass |
| UI-06 | Usable at 1920×1080 and 1366×768 | specs/user-interface/spec.md | src/styles.css | Layout probe both resolutions (all elements correctly placed) | Pass |
| PERF-01 | ~60 FPS at render distance 8, documented | specs/performance/spec.md | engine + stream budgets | Measured: 60.2 FPS (idle and streaming) | Pass |
| PERF-02 | Bounded per-frame work, no long freezes | specs/performance/spec.md | src/config budgets + World queues | Perf probe: no freezes during sprint-streaming | Pass |
| PERF-03 | Memory bounded; unload releases resources | specs/performance/spec.md | World unload + dispose | Memory probe: 110.6 MB flat during exploration | Pass |
| PERF-04 | Hot-path allocation avoidance | specs/performance/spec.md | PlayerInteraction scratch vectors, camera reuse | Static review | Pass |
| PERF-05 | Rebuild only dirty chunks + boundary neighbors | specs/performance/spec.md | World `setBlock` → localized remesh | Unit: World boundary test; design | Pass |
| PERF-06 | Unit + browser coverage | specs/performance/spec.md | tests/unit, tests/e2e | 76 unit + 14 e2e, all passing | Pass |

## Remaining issues

- None critical. Known limitations (greedy meshing, day/night disabled by default, no cross-restart saves, no step-up, no mobile controls) are documented in the README and are explicitly out of scope.
