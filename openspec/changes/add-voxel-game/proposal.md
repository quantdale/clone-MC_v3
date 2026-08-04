# Proposal: add-voxel-game

## Why

The repository currently contains no source code. The goal is to build, from scratch, a complete and playable browser-based voxel sandbox game inspired by Minecraft's core mechanics — procedurally generated terrain, first-person controls, block destruction/placement, and dynamic chunk streaming — with production-ready architecture, tests, and documentation. Authoritative requirements are in `prompt.txt`.

## What Changes

- Bootstrap a Vite + TypeScript + Three.js project with dev tooling (Vitest, Playwright, ESLint, type checking).
- Implement a Three.js rendering core: WebGLRenderer, perspective camera, delta-time game loop, texture atlas, chunk-based meshes with hidden-face removal, frustum culling, transparent water, fog, and GPU resource disposal.
- Implement a seeded deterministic procedural world: chunked voxel storage, height-varied terrain with grass/dirt/stone/sand/water/bedrock, trees that cross chunk boundaries cleanly, and correct negative-coordinate handling.
- Implement a chunk system with lifecycle states, generation/meshing queues, dirty-state tracking with neighbor remeshing, bounded queues, stale-async-job guards, and disposal on unload.
- Implement chunk streaming around the player within a configurable render distance, with deterministic regeneration and an in-session modified-chunk edit overlay so player edits survive unload/reload.
- Implement a first-person player controller: pointer lock, mouse look with sensitivity and pitch clamp, WASD/sprint/jump, gravity, delta-time-stable movement, and AABB voxel collision with axis-separated resolution.
- Implement block interaction: center-screen voxel raycast (Amanatides & Woo grid traversal), max reach, accurate block/face targeting, destroy/place with placement validation, unbreakable bedrock, input cooldown, and selection outline feedback.
- Implement a centralized block registry (air, grass, dirt, stone, sand, water, bedrock, wood/log, leaves) with per-face texture coordinates and original procedural textures — no copyrighted assets.
- Implement an inventory hotbar with texture-preview icons, highlight, number-key and mouse-wheel selection with wraparound, and integration with placement.
- Implement lighting/environment: hemisphere + directional sunlight, sky, distance fog, and water presentation (day-night cycle optional).
- Implement UI: crosshair, FPS counter, loading indicator, pointer-lock instructions/pause message, init-failure error state, and debug overlay (position, chunk, loaded/pending counts, triangles).
- Meet measurable performance targets: ~60 FPS at render distance 8 on typical desktop, bounded per-frame generation work, no unbounded memory growth, per-frame allocation avoidance, covered by unit/integration tests.

## Capabilities

### New Capabilities

- `rendering`: Three.js renderer, camera, game loop, texture atlas, chunk meshes with hidden-face removal, culling, materials, transparency, disposal, fog, resize.
- `world-generation`: seeded deterministic terrain, block layers, trees, chunk-boundary continuity, negative coordinates.
- `chunk-system`: chunk storage, coordinate conversion, lifecycle, queues, dirty/neighbor remeshing, bounded async work, disposal.
- `chunk-streaming`: load/unload around player, render distance, frame-distributed work, in-session edit persistence overlay.
- `player-controller`: pointer lock, mouse look, WASD/sprint/jump, gravity, delta-time movement, AABB voxel collision, safe spawn, pause.
- `block-interaction`: voxel raycast, targeting, destroy/place, placement validation, bedrock, cooldown, outline feedback, remeshing.
- `block-registry`: centralized block definitions, texture coordinates, original procedural textures.
- `inventory-hotbar`: hotbar slots, icons, selection (keys + wheel wraparound), name display, placement integration.
- `lighting-environment`: ambient/hemisphere + directional light, sky, fog, water presentation, optional day-night cycle.
- `user-interface`: crosshair, FPS counter, loading indicator, pointer-lock messaging, error state, debug overlay, responsive layout.
- `performance`: measurable FPS/memory/allocation targets and test expectations.

### Modified Capabilities

(None — no existing specs.)

## Impact

- **New code**: entire project under `src/` (`engine`, `world`, `player`, `rendering`, `inventory`, `ui`, `math`, `config`), plus `index.html`, tests, and project config files.
- **Dependencies**: three, vite, typescript, vitest, @playwright/test, eslint (new `package.json`).
- **Docs**: README with install/run/test/build/controls, plus these OpenSpec change artifacts.
- No existing code or APIs are affected (greenfield).
