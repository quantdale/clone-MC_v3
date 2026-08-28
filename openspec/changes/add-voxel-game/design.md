# Design: add-voxel-game

## Context

Greenfield repository (no source code). We are building a complete browser-based voxel sandbox game per `prompt.txt`. Constraints: original textures only (no copyrighted assets), deterministic seeded world, in-session edit persistence, measurable ~60 FPS performance, and full spec-driven documentation via OpenSpec.

## Goals / Non-Goals

**Goals:**
- Playable first-person voxel game: seeded chunked terrain, streaming, break/place, stackable survival inventory, crafting, health/hunger, collision, lighting, audio feedback, passive world life, and UI.
- Modular, typed, testable codebase with unit (Vitest) and browser (Playwright) coverage.
- Production build that installs, runs, and passes type-check/lint/tests.

**Non-Goals:**
- Multiplayer, hostile AI, interactive mobs, weather, and mobile controls.
- Multiplayer/server persistence; local seed-scoped player and edit snapshots are supported.

## Decisions

- **Stack: Vite + TypeScript + Three.js.** Vite gives fast dev server and production builds with minimal config; TypeScript satisfies strong-typing requirements; Three.js is the required renderer. Alternative considered: plain WebGL — rejected, far more code for no benefit.
- **Module layout**: `src/engine` (Game, GameLoop, Renderer, InputManager, ResourceManager), `src/world` (World, Chunk, ChunkManager, ChunkGenerator, ChunkMesher, BlockRegistry, TerrainGenerator, WorldCoordinates, WorldLife), `src/player` (Player, PlayerController, PlayerPhysics, PlayerInteraction, SurvivalSystem), `src/rendering` (TextureAtlas, Materials, Lighting, Environment), `src/inventory` (Inventory, Hotbar, Crafting), `src/audio` (GameAudio), `src/ui` (Crosshair, DebugOverlay, LoadingIndicator, HUD, CraftingPanel), `src/math`, `src/config`. Mirrors prompt.txt section 7's separation of concerns.
- **Chunk size 16×64×16** (X×Y×Z). Justification: 16-wide columns match Minecraft-proven streaming granularity; 64 height covers terrain variation without tall-column waste; 16K voxels/chunk fits one `Uint8Array` (16 KB) and meshes fast enough within a per-frame budget. Larger chunks would lengthen mesh time per edit; smaller would multiply draw calls.
- **Block storage: `Uint8Array` per chunk**, indexed `x + z*16 + y*256`. Block ids fit in a byte (only 9 required types). Alternative: Uint16 — unnecessary headroom now; registry reserves id space.
- **Noise: seeded simplex/value noise** implemented in `src/math` (seeded PRNG, e.g. mulberry32 + permutation-table gradient noise). `Math.random()` is banned from world-critical generation. No external noise dependency needed; a small well-tested implementation keeps dependencies minimal.
- **Meshing: face-culled naive meshing first** (emit only faces adjacent to non-opaque blocks), one opaque mesh + one transparent (water) mesh per chunk, shared materials and one texture atlas. Greedy meshing is a documented stretch goal, applied only if profiling shows meshing is a bottleneck; the specs already require documenting the omission.
- **Textures: procedural 16×16 tiles generated at runtime** onto a canvas atlas (per-block noise-tinted patterns). Guarantees original art, zero asset files, and trivial licensing.
- **Persistence: modified-chunk overlay.** An in-memory `Map<chunkKey, Map<localIndex, blockId>>` of player edits, applied after deterministic regeneration on chunk load. Unmodified chunks cost nothing to restore; the whole world is never stored.
- **Async work: bounded per-frame queues on the main thread** (configurable jobs/frame for generation and meshing), with generation/mesh versions to discard stale results. Web Workers are a considered-but-deferred alternative — complexity not justified until profiling demands it.
- **Collision: player AABB vs voxel grid, axis-separated resolution** (move X, resolve; move Y, resolve; move Z, resolve) sampled against solid blocks from the registry. Simple, robust, stable across frame rates with delta-time integration.
- **World simulation: bounded queues and shared resources.** Sand/gravel updates are deduplicated and capped per world update; passive critters use deterministic seed-derived offsets, shared low-poly resources, and stop while the gameplay simulation is paused.
- **Raycast: Amanatides & Woo DDA** from camera center, returning block coords + face normal; avoids float-rounding selection bugs.
- **Testing: Vitest** for deterministic unit logic (noise reproducibility, coordinate conversion incl. negatives, registry, dirty propagation, collision helpers, DDA, hotbar wraparound); **Playwright** for browser checks (init, canvas render, pointer lock, movement, gravity, break/place, streaming, production build loads clean).

## Risks / Trade-offs

- [Meshing performance on edit-heavy play] → Face-culled meshing with per-frame budget; neighbor-only remeshing; profile and adopt greedy meshing as the documented stretch if needed.
- [Async chunk races (stale jobs overwriting fresh state)] → Lifecycle states + per-chunk generation/mesh version counters; stale results discarded before application.
- [Queue growth during fast movement] → Bounded queues keyed by chunk, distance-prioritized, deduplicated; requests outside render distance dropped.
- [Memory growth during exploration] → Hard unload beyond render distance with geometry/material disposal; overlay map holds edits only for touched chunks.
- [Trees crossing chunk borders] → Tree placement derived deterministically from world-space seed so neighbor chunks compute the same overhanging blocks; unit-tested at borders.
- [Pointer-lock UX edge cases (lock loss, re-entry)] → Input state reset on lock loss, pause message, resume handled centrally in InputManager.
- [Frame-rate-dependent physics] → All movement integrated with clamped delta time; no per-frame-rate coupling.
