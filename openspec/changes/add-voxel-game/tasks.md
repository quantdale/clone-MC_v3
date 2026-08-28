# Tasks: add-voxel-game

> Status: **Complete for the current desktop single-player scope** — the original voxel contract and the survival/world-simulation expansion are implemented and verified below.

## 1. Project Bootstrap and Tooling

- [x] 1.1 Create `package.json` with three, vite, typescript, vitest, @playwright/test, eslint and scripts (dev, build, preview, test, test:e2e, lint, typecheck)
- [x] 1.2 Add `tsconfig.json` (strict mode, bundler module resolution)
- [x] 1.3 Add `vite.config.ts` with dev server and build settings
- [x] 1.4 Add `eslint.config.js` matching project conventions
- [x] 1.5 Add `vitest.config.ts` and `playwright.config.ts`
- [x] 1.6 Create `index.html` with canvas container and UI root elements
- [x] 1.7 Create `src/config/` module with tunables (seed, chunk size, render distance, reach, speeds, budgets)
- [x] 1.8 Verify `npm install`, `npm run dev`, `npm run build` all succeed with an empty entry point

## 2. Core Game Loop and Renderer

- [x] 2.1 Implement `src/engine/GameLoop.ts` with requestAnimationFrame, delta time, and max-delta clamp
- [x] 2.2 Implement `src/engine/Renderer.ts` wrapping WebGLRenderer with pixel-ratio handling and resize
- [x] 2.3 Implement perspective camera and responsive aspect update
- [x] 2.4 Implement `src/engine/InputManager.ts` (keyboard/mouse state, listener teardown)
- [x] 2.5 Implement `src/engine/ResourceManager.ts` for GPU resource tracking/disposal
- [x] 2.6 Implement `src/engine/Game.ts` wiring loop, renderer, and update/render phases
- [x] 2.7 Add init-failure error state for missing DOM elements / WebGL unavailable

## 3. Coordinate and Chunk Data Model

- [x] 3.1 Implement `src/world/WorldCoordinates.ts` (world↔chunk↔local conversion, floor-division for negatives)
- [x] 3.2 Unit-test coordinate conversion including negative coordinates and round-trips
- [x] 3.3 Implement `src/world/Chunk.ts` with Uint8Array block storage and typed get/set
- [x] 3.4 Implement chunk lifecycle states (pending/generating/generated/meshing/visible/unloading)
- [x] 3.5 Implement `src/world/ChunkManager.ts` chunk map with cross-chunk block lookup
- [x] 3.6 Implement dirty-state tracking with neighbor marking on boundary edits
- [x] 3.7 Unit-test boundary lookup, dirty propagation, and neighbor remesh marking

## 4. Block Registry and Textures

- [x] 4.1 Implement `src/world/BlockRegistry.ts` with definition type (id, name, solid, opaque, breakable, placeable, collision, render category, top/bottom/side UVs)
- [x] 4.2 Register the nine core blocks plus glass, snow, gravel, planks, ores, masonry, lava, and apple
- [x] 4.3 Implement `src/rendering/TextureAtlas.ts` generating procedural 16×16 tiles into a canvas atlas
- [x] 4.4 Implement `src/rendering/Materials.ts` with shared opaque and transparent materials
- [x] 4.5 Unit-test registry lookups, required-block presence, and per-face UV mapping

## 5. Procedural Terrain Generation

- [x] 5.1 Implement seeded PRNG and value noise in `src/math/`
- [x] 5.2 Unit-test noise reproducibility for a fixed seed
- [x] 5.3 Implement `src/world/TerrainGenerator.ts` height function with height variation
- [x] 5.4 Generate layered columns: grass/dirt/stone, biome surfaces, sand/gravel near sea level, water fill, bedrock floor, and protected caves
- [x] 5.5 Implement deterministic tree placement (trunk + canopy) from world-space seed
- [x] 5.6 Handle trees overhanging chunk borders (neighbor chunks compute same overhang, no duplication)
- [x] 5.7 Unit-test determinism (same seed+coords → identical chunk), boundary continuity, negative coords, cross-border trees

## 6. Chunk Meshing

- [x] 6.1 Implement `src/world/ChunkMesher.ts` face-culled meshing (skip faces against opaque neighbors)
- [x] 6.2 Emit per-face UVs from registry atlas coordinates (top/bottom/side)
- [x] 6.3 Produce separate opaque and transparent (water/glass) geometries per chunk
- [x] 6.4 Query neighbor chunks for boundary-face culling
- [x] 6.5 Unit-test hidden-face removal counts and water-only transparency grouping
- [x] 6.6 Document meshing approach; greedy meshing deferred (perf target met via face-culled meshing)

## 7. Chunk Rendering and Streaming

- [x] 7.1 Attach chunk meshes to scene with frustum culling enabled
- [x] 7.2 Implement bounded generation and meshing queues with per-frame budgets
- [x] 7.3 Implement stale-job guards (version counters) for async/queued results
- [x] 7.4 Implement dynamic load/unload within render distance around the player
- [x] 7.5 Implement unload disposal (geometry, materials, chunk map removal)
- [x] 7.6 Implement modified-chunk edit overlay and reapply on regeneration
- [x] 7.7 Integration-test streaming: chunks load on approach, unload at distance, edits survive reload

## 8. Player Camera, Movement, and Collision

- [x] 8.1 Implement pointer lock acquisition/loss handling with input reset
- [x] 8.2 Implement mouse look with configurable sensitivity and pitch clamp
- [x] 8.3 Implement `src/player/PlayerController.ts` WASD + sprint + jump/swimming with delta-time integration
- [x] 8.4 Implement `src/player/PlayerPhysics.ts` gravity, ground detection, AABB vs voxel axis-separated collision
- [x] 8.5 Implement safe spawn placement above valid terrain (flat, clear area + nonblocking preload and readiness gate)
- [x] 8.6 Unit-test collision helpers (axis resolution, penetration blocking)
- [x] 8.7 Browser-test movement, gravity, frame-rate stability, and pointer-lock pause/resume

## 9. Block Interaction

- [x] 9.1 Implement Amanatides & Woo voxel raycast in `src/math/` (block + face normal, max reach)
- [x] 9.2 Unit-test ray-grid traversal including axis-aligned and diagonal rays
- [x] 9.3 Implement `src/player/PlayerInteraction.ts` destroy (bedrock-safe) and place with validity checks
- [x] 9.4 Reject placement inside player AABB and in occupied cells
- [x] 9.5 Add input cooldown/debounce for break/place
- [x] 9.6 Add selection outline mesh for targeted block
- [x] 9.7 Trigger immediate remesh incl. neighbor chunks on boundary edits
- [x] 9.8 Browser-test target, break, place, and bedrock behavior

## 10. Inventory Hotbar

- [x] 10.1 Implement `src/inventory/Inventory.ts` and `src/inventory/Hotbar.ts` slot model
- [x] 10.2 Render hotbar UI with texture-preview icons from the atlas and selection highlight
- [x] 10.3 Implement number-key selection
- [x] 10.4 Implement mouse-wheel selection with wraparound
- [x] 10.5 Show selected block display name on selection change
- [x] 10.6 Wire selected slot into block placement
- [x] 10.7 Unit-test selection logic and wraparound

## 11. Lighting, Environment, and Terrain Variation Polish

- [x] 11.1 Implement `src/rendering/Lighting.ts` hemisphere/ambient + directional sunlight
- [x] 11.2 Implement `src/rendering/Environment.ts` sky background and distance fog tuned to render distance
- [x] 11.3 Polish water presentation (tint, transparency, surface readability)
- [x] 11.4 Verify sand/water/height variation reads well visually
- [x] 11.5 Add day-night cycle, synchronized sky tint, and bounded procedural clouds

## 12. UI, Loading, and Diagnostics

- [x] 12.1 Implement `src/ui/Crosshair.ts`
- [x] 12.2 Implement FPS counter in `src/ui/HUD.ts`
- [x] 12.3 Implement `src/ui/LoadingIndicator.ts` tied to initial chunk readiness
- [x] 12.4 Implement pointer-lock instructions and pause/click-to-resume message
- [x] 12.5 Implement `src/ui/DebugOverlay.ts` (position, chunk, loaded/pending counts, triangles)
- [x] 12.6 Verify UI readability at 1920×1080 and 1366×768

## 13. Performance Optimization

- [x] 13.1 Audit hot paths for per-frame allocations; reuse vectors/temp objects
- [x] 13.2 Verify only dirty chunks (+ boundary neighbors) remesh on edits
- [x] 13.3 Verify bounded queues and per-frame budgets under sprint-streaming
- [x] 13.4 Profile memory during extended exploration; confirm no unbounded growth
- [x] 13.5 Measure FPS at render distance 8 and document observed result in verification notes

## 14. Automated Testing

- [x] 14.1 Complete Vitest unit suite (noise, coordinates, registry, dirty propagation, collision, DDA, hotbar, overlay)
- [x] 14.2 Complete Playwright suite (init, canvas render, pointer lock, movement, collision, break/place, hotbar, streaming, unload)
- [x] 14.3 Add production-build smoke test (build output loads without fatal console errors)
- [x] 14.4 Ensure `npm run test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck` all pass

## 15. Production Verification and Documentation

- [x] 15.1 Run full production build and preview; verify gameplay end-to-end
- [x] 15.2 Write README: prerequisites, install, dev/test/lint/typecheck/build/preview commands, controls, architecture, performance notes, known limitations
- [x] 15.3 Record verification evidence (commands + results) in the change documentation
- [x] 15.4 Final audit against prompt.txt mandatory validation checklist; fix any failures
- [x] 15.5 Confirm specs match final behavior; update any drifted requirements

## 16. Survival, Inventory, Crafting, and Feedback Expansion

- [x] 16.1 Add stack counts, 27 storage stacks, item add/remove, consumption, and validated inventory snapshots
- [x] 16.2 Add hardness metadata, held mining progress, collected block drops, leaves-to-apple drops, and stack-aware placement
- [x] 16.3 Add nine deterministic recipes including planks, glass, gravel, masonry, sticks, and tools with transactional capacity checks
- [x] 16.4 Add pause-safe inventory/crafting UI with 9 hotbar cells, 27 storage cells, icons, counts, and recipe buttons
- [x] 16.5 Add health, hunger, saturation, fall damage, drowning, regeneration, apple food, death, respawn, and persistence
- [x] 16.6 Add survival HUD, break progress, action toasts, camera bob, and procedural WebAudio cues
- [x] 16.7 Add unit coverage for stacks, crafting, mining progress, fall telemetry, and survival rules
- [x] 16.8 Run the expanded full suite, production build, browser suite, visual smoke, and update verification evidence
- [x] 16.9 Add deterministic coal/iron ore generation, deep lava pockets, lava movement, and lava survival damage
- [x] 16.10 Add bounded sand/gravel settling with edit/remesh persistence
- [x] 16.11 Add deterministic passive world life with pause-safe movement and disposal
- [x] 16.12 Add a synchronized in-game day/night clock to the HUD
- [x] 16.13 Inspect gameplay and crafting captures, remove temporary visual smoke coverage, and record final evidence
- [x] 16.14 Add durable wooden/stone tools, preferred-tool mining speed, break consumption, hotbar durability bars, and browser coverage
- [x] 16.15 Add distinct coal/raw-iron ore drops and registry-backed material inventory items
