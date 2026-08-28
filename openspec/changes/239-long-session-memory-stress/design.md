# Design: 239-long-session-memory-stress

## Context / current state

The engine already bounds live resources and disposes GPU geometry, but none of it is validated over an
extended session. Documented current behavior:

- **Chunk streaming / world (`src/world/World.ts`)**: `ChunkManager` is a flat map of loaded chunks;
  `ensureChunks` creates chunks only inside the render-distance ring; `unloadChunks` removes out-of-range
  chunks (limit `renderDistance + 1`) at `CONFIG.budgets.unloadPerFrame` (4) per frame. On unload,
  `removeMeshesForChunk` removes each mesh from the scene and calls `mesh.geometry.dispose()`. The
  generation/mesh queues are bounded by `CONFIG.maxQueueSize` (512); the retry-mesh queue is bounded by
  the loaded-chunk set; a job's key is de-duplicated by its `genSet`/`meshSet`/`retryMeshSet`. The edit
  overlay is LRU-capped by `EDIT_OVERLAY_MAX_CHUNKS` (10,000). The `stateOverlay` is cleared on a
  `setBlock` write over the same cell but is **not** LRU-bounded (candidate long-session growth surface).
  `getStats()` exposes `loadedChunks`, `pendingGeneration`, `pendingMesh`, `triangles`, `voxels`.
- **GPU resources**: the world holds one shared `TextureAtlas.CanvasTexture` and two shared
  `Materials` (opaque/transparent) reused by every chunk mesh. Per-chunk `THREE.BufferGeometry` objects
  are created in `attach` and disposed in `removeMeshesForChunk`. `ResourceManager`
  (`src/engine/ResourceManager.ts`) tracks renderer/lighting/environment/audio/world-life/mob-renderers/
  interaction and disposes them together. `Renderer` (`src/engine/Renderer.ts`) handles WebGL context
  loss/restore by disposing and recreating the `WebGLRenderer`; `dispose()` disposes the renderer.
  Three.js's `renderer.info.memory.{geometries,textures}` and `renderer.info.programs` are available and
  are the concrete in-browser GPU-resource counters.
- **Server-side / headless managers**: `ChunkStreamManager` (226) keeps a bounded snapshot store
  (default 1024) with oldest-first eviction. `EntityManager` (129/131) retains `REMOVED` records in
  `byId` until `forgetChunk` (132) evicts them. `BlockEntityManager` (052) removes a chunk's instances
  on `removeChunk`. `WorldTickProcess` (224) steps an ordered system list; a throwing system stops the
  process and rethrows until `reset()`.
- **Storage**: IndexedDB repositories (`ChunkSectionRepository`, `BlockEntityRepository`,
  `EntityRepository`, `PlayerStateRepository`, `WorldMetadataRepository`) persist columns/entities;
  `AutosaveCoordinator` runs a `setInterval` autosave. IndexedDB is disk, not JS heap; long-session
  growth there is a secondary sampled signal, not a heap ceiling.
- **E2E**: `tests/e2e/game.spec.ts` uses `window.__voxelGame` (exposed only in DEV/VITE_E2E builds),
  `waitForGame` (goto + `#loading` hidden), `enterPointerLock` (canvas click + pointer lock), and
  `page.evaluate` to read game state and drive input. `playwright.config.ts` runs a single worker,
  headless, `VITE_E2E=true`, against a `vite preview` build. Headless runs use
  `CONFIG.headless.renderDistance`/`simulationDistance` (both 2) via `navigator.webdriver`.

## Target state

- A pure headless `MemoryResourceBudget` module validates a `LiveResourceSnapshot` of live-resource
  counters against a `MemoryResourceConfig` of concrete ceilings and returns a per-dimension + overall
  verdict, exactly parallel to 075's `evaluateRenderBudget`. Fully deterministic and unit-testable.
- A browser-scripted long-session suite drives the real game for extended periods and across cycles,
  sampling heap and GPU-resource counters, and asserts the growth ceilings the two specs define.
  Any leak a scenario surfaces is fixed within this change's scope and re-validated by the same
  scenario.

## Invariants

- `MemoryResourceConfig` fields are positive integers; validation rejects anything else.
- Per-dimension verdict = `actual <= budget`; non-finite or negative actuals violate their dimension.
- Overall verdict = every dimension within budget.
- `evaluateResourceBudget` is pure: identical `(config, snapshot)` inputs yield identical reports.
- Live-resource residency is bounded in steady state: after the player stops moving and the streaming
  queues drain, `loadedChunks` equals the render-distance interest-ring cardinality
  (`(2R+1)^2 × chunkLayerCount`), pending jobs drain to 0, and mesh geometries settle to a plateau.
- Per-cycle residency does not grow: after each teleport / world-reload / away-and-back cycle, live
  resources return to the same plateau as after the previous cycle (no monotonic growth).
- Block-entity and entity counts are bounded and return to baseline when their owning chunk unloads.
- GPU resources (geometries/textures/programs) stabilize to a plateau after any context restore; a
  restore never permanently adds resources beyond the re-meshed world.

## API and data model

```ts
// src/rendering/MemoryResourceBudget.ts (NEW) — mirrors src/rendering/RenderBudget.ts
export type MemoryResourceDimension =
  | 'loadedChunks' | 'pendingJobs' | 'meshGeometries'
  | 'editOverlayChunks' | 'blockEntities' | 'activeEntities' | 'itemEntities';

export interface LiveResourceSnapshot {
  readonly loadedChunks: number;      // world.getStats().loadedChunks
  readonly pendingJobs: number;       // pendingGeneration + pendingMesh (+ retry)
  readonly meshGeometries: number;    // renderer.info.memory.geometries (browser) or world.meshGroups size (CPU proxy)
  readonly editOverlayChunks: number; // world.getEditCount()/editOverlay chunk keys, or snapshot from the overlay map size
  readonly blockEntities: number;     // BlockEntityManager.size (or live store size)
  readonly activeEntities: number;    // EntityManager.size (active) / replication tracked count
  readonly itemEntities: number;      // ItemEntityManager.size
}

export interface MemoryResourceConfig {
  readonly maxLoadedChunks: number;
  readonly maxPendingJobs: number;
  readonly maxMeshGeometries: number;
  readonly maxEditOverlayChunks: number;
  readonly maxBlockEntities: number;
  readonly maxActiveEntities: number;
  readonly maxItemEntities: number;
}

export interface MemoryResourceEntry {
  readonly dimension: MemoryResourceDimension;
  readonly budget: number;
  readonly actual: number;
  readonly withinBudget: boolean;
}
export interface MemoryResourceReport {
  readonly withinBudget: boolean;
  readonly entries: readonly MemoryResourceEntry[];
}

export const DEFAULT_MEMORY_RESOURCE_BUDGET: MemoryResourceConfig;
export function validateMemoryResourceConfig(input: unknown): MemoryResourceConfig;
export function evaluateResourceBudget(
  config: MemoryResourceConfig,
  snapshot: LiveResourceSnapshot,
): MemoryResourceReport;
```

`DEFAULT_MEMORY_RESOURCE_BUDGET` ceilings are derived from the current runtime caps, not arbitrary:

- `maxLoadedChunks` = `(2·R+1)² × layerCount` for the effective radius `r = max(R, preloadRadius)`
  (default desktop `R=6`, `layerCount=1` → 169; headless `R=2` with `preloadRadius=3` → 49; see the
  Reconciliation note). A violation means a chunk was not unloaded.
- `maxPendingJobs` = `CONFIG.maxQueueSize` (512) + the loaded-chunk-bounded retry queue (≤ maxLoaded).
- `maxMeshGeometries` = `2 × maxLoadedChunks` (opaque + transparent mesh per chunk) + a small fixed
  allowance for the constant-shape geometries (world-life, mob renderers, environment, target outline).
- `maxEditOverlayChunks` = `World.EDIT_OVERLAY_MAX_CHUNKS` (10,000).
- `maxBlockEntities` = a documented cap (default 4096) reflecting one block entity per loaded-cell upper
  bound; the exact number is tuned by the implementing agent against the live store.
- `maxActiveEntities` = mob `SPAWN_CAP` + fixed allowance for the deterministic live-set bounds.
- `maxItemEntities` = a documented concurrent cap (default 1024) covering item entities + xp orbs under
  the existing pickup/despawn budgets.

These are defaults the implementing agent may tune only with a recorded rationale; the validator and
evaluation logic are the normative contract.

## Control / data flow

1. **Headless**: a unit test constructs a `MemoryResourceConfig` and a fixture `LiveResourceSnapshot`,
   calls `validateMemoryResourceConfig`/`evaluateResourceBudget`, and asserts the per-dimension +
   overall verdicts, validation errors, boundary equality, and determinism.
2. **Browser sampling**: the e2e helper gathers one `LiveResourceSnapshot` from the live game via
   `page.evaluate` — `game.world.getStats()`, `game.renderer.renderer.info.memory.*`, entity counts, and
   `performance.memory.usedJSHeapSize` — wraps it in `evaluateResourceBudget` (imported from the same
   module, so the ceiling logic is exercised end-to-end), and also records the raw heap series.
3. **Session driving**: the e2e scenario enters pointer lock, holds movement keys / performs build
   actions / waits idle, teleports by setting `game.player.position`, and reloads via `page.reload()`,
   sampling on a fixed interval.
4. **Assertion**: after the final settle, the scenario computes the growth rule (median-of-last vs
   median-of-first settled samples) and asserts it is within the concrete ceiling, and that every budget
   dimension is within budget.

## Detailed behavior

- `validateMemoryResourceConfig` MUST reject non-integer, non-positive, non-finite, or NaN fields with a
  descriptive error naming the field, and MUST return the same value (narrowed) for a valid config.
- `evaluateResourceBudget` MUST produce exactly one entry per dimension in a fixed order and the overall
  verdict; equality (`actual === budget`) is within budget; negative/NaN/Infinity actuals violate their
  dimension; a missing/non-numeric dimension actual violates.
- The growth rule for a long session is: `median(last k settled samples) − median(first k settled
  samples) ≤ ceiling`, with `k` and the ceiling defined per scenario (heap ceiling 8 MiB; geometry
  plateau drift ≤ 4 geometries). "Settled" means sampled ≥ T after the last input stop and, where
  available, after a forced `window.gc()`.
- Teleport cycling: set `game.player.position` to a deterministic grid of far coordinates, wait for
  `#loading` hidden and `loadedChunks` to settle to the ring cardinality, sample, repeat. The plateau
  after cycle *n* must not exceed the plateau after cycle *1* by more than the geometry drift allowance.
- World-reload cycling: `page.reload()` repeatedly; each reload boots a fresh `Game`/`World`. Because a
  leaked `WebGLRenderer` keeps GPU wrapper objects alive in the JS heap, the cross-reload leak signal is
  `performance.memory.usedJSHeapSize` (settled median), which MUST NOT grow across reloads beyond the
  heap ceiling. `renderer.info.memory.*` of the new renderer is also recorded as a secondary signal.

## Failure modes

- Measurement unavailable: if `performance.memory` is absent, the browser scenarios MUST fail with an
  explicit "heap measurement unavailable (non-Chromium)" error rather than silently pass.
- `window.gc` unavailable: scenarios continue with the no-GC series and the ceiling rule still applies
  to settled medians; the report notes GC was not forced.
- A world/system error stops the tick process (`WorldTickProcess` rethrows until `reset`): the failure
  scenario asserts that the game enters the error state and that live resources did not grow while
  erroring — resource counts stay bounded.
- Budget evaluation on malformed snapshot: pure, defensive, never throws for bad actuals (they violate);
  it throws only on an invalid config.
- Context-restore failure: `Renderer` enters the recoverable error state; the scenario asserts the game
  does not accumulate GPU resources on a failed restore.

## Compatibility / migration

Additive. `MemoryResourceBudget.ts` is new and imported by the e2e helper and unit test only; no
existing module changes its behavior. No stored data, no serialized format, no public runtime API
change. `playwright.config.ts` may add launch args (`--js-flags=--expose-gc`) scoped to the browser
fixture; production `CONFIG` is untouched.

## Performance / resource constraints

`evaluateResourceBudget` is O(dimensions) with one small allocation per call (the report + entries);
`validateMemoryResourceConfig` is O(fields). The e2e sampler reads `renderer.info` and
`world.getStats()`, which are already-accumulated counters, so sampling adds no meaningful cost. The
stress sessions themselves are CI-time cost, not runtime cost.

## Testing seams

- **Headless unit** `tests/unit/MemoryResourceBudget.test.ts` (NEW):
  - config validation matrix (0, negative, NaN, Infinity, fractional, non-number, missing field);
  - evaluation: all-within, single-over, boundary equality, negative/NaN/Infinity actuals, overall
    verdict, fixed entry order;
  - determinism: identical config + snapshot → deeply equal reports;
  - default ceiling values match the current runtime caps (desktop R=6 → 169; edit overlay 10,000;
    pending 512-based).
- **Browser e2e** `tests/e2e/memory-stress.spec.ts` (NEW), reusing the helpers/pattern from
  `game.spec.ts`:
  - long exploration session with periodic heap + GPU samples;
  - build / chunk-churn session (place/break loop) asserting bounded queues + geometry;
  - idle simulation session asserting bounded item/orb/entity counts;
  - teleport cycling asserting plateau stability;
  - world-reload cycling asserting heap ceiling;
  - block-entity accumulation away-and-back asserting return to baseline;
  - GPU-context restore asserting plateau stability;
  - failure scenario asserting bounded resources on error.
- A shared `sampleLiveResources(page)` e2e helper (importing `evaluateResourceBudget`) keeps the
  measurement method in one place and reused by every scenario.

## Observability / debugging

Each e2e scenario records the full time series (timestamps, `usedJSHeapSize`, `info.memory.*`, budget
report) and prints it on failure so a reviewer can see the growth curve and exactly which dimension
violated. The headless report names each failing dimension with budget vs actual. A scenario-level
summary line reports forced-GC availability and session wall-time.

## Affected files / symbols

- `src/rendering/MemoryResourceBudget.ts` — NEW (types, `DEFAULT_MEMORY_RESOURCE_BUDGET`,
  `deriveMemoryResourceBudget`, `computeRingCardinality`, validator, evaluator).
- `tests/unit/MemoryResourceBudget.test.ts` — NEW (config validation matrix, evaluation scenarios,
  default-ceiling derivation, determinism, and the headless block-entity away-and-back invariant).
- `src/world/World.ts` — `getEditOverlayChunkCount(): number` (measurement seam; no gameplay change).
- `src/engine/Game.ts` — `getLiveResourceCounts()` (measurement seam) and a test-only `failSimulation()`
  hook for the failure scenario (no gameplay change; the throw is gated on an explicit flag that is never
  set in production).
- `tests/e2e/memory-stress.spec.ts` — NEW (browser scenarios + `sample`/`waitSettled` helpers that reuse
  `evaluateResourceBudget`).
- `playwright.config.ts` — adds a test-only headless Chromium `--js-flags=--expose-gc` launch arg.
- No production cache/resource fix was required: the pre-existing bounds (per-chunk `geometry.dispose()`
  on unload, LRU-capped edit overlay, bounded gen/mesh queues, `stateOverlay` cleared on overwrite) held
  under every scenario; no leak was surfaced.

## Reconciliation against the actual code (implemented)

The pre-authored package assumed block entities are wired into the single-player browser world. They are
**not**: `new BlockEntityManager` appears only in the passive/hostile mob systems (which use
`EntityManager`, not block entities), and `World`/`Game` never instantiate a `BlockEntityManager`. A
placed chest/furnace sets a block id but creates no block-entity instance. Consequently:

- **Block-entity accumulation** is validated where the invariant actually lives: headlessly against
  `BlockEntityManager` (`removeChunk` returns the live count to baseline across repeated away-and-back
  cycles; added as a describe block in `MemoryResourceBudget.test.ts`). The browser scenario
  "block-entity live count stays at baseline" asserts the truthful single-player invariant: the live
  block-entity count is `0` at baseline and stays `0` across teleport away-and-back / reload cycles,
  with the settled budget within budget. This is a recorded gap (single-player does not wire block
  entities); the lifecycle itself is unit-covered.
- **Failure behavior** uses a test-only `Game.failSimulation()` hook (guarded by an explicit flag) that
  makes the next `update` throw, entering the recoverable error state via the normal `GameLoop` error
  path. The browser scenario asserts live resources stay bounded and stable while erroring.
- **Bounded-queues ceiling**: `getStats().pendingMesh` includes the loaded-chunk-bounded
  `retryMeshQueue`, so the churn ceiling is the budget `maxPendingJobs = CONFIG.maxQueueSize +
  maxLoadedChunks` (537 headless), not the raw 512. The memory-resource spec's bounded-queues scenario
  wording was reconciled accordingly.
- **Session durations** are shortened for software-WebGL CI (exploration ~45 s, churn ~35 s, idle ~25 s,
  teleport 6 cycles, reload 6 cycles) while the growth rule stays time-independent (settled medians), per
  the design's mitigation note. Actual measured numbers are recorded in `verification.md`.
- **`maxActiveEntities`** = passive `SPAWN_CAP` (12) + 256 = 268, which also generously bounds the
  hostile cap (8); the `activeEntities` snapshot sums live passive + hostile mobs.
- **Residency ceiling vs render ring**: the boot preload (`CONFIG.preloadRadius=3`) retains a radius-3
  ring beyond the headless streaming ring (R=2), because preloaded chunks are kept up to the unload limit
  (R+1=3). The budget's `maxLoadedChunks` therefore uses `r = max(R, preloadRadius)` (169 desktop, 49
  headless), reconciling the pre-authored 25-headless figure. This was surfaced by the first e2e run
  (loadedChunks reached 31/49 in teleport/exploration, correctly flagged above the old 25 ceiling).

## Rejected alternatives

- *Real `WebGLMemoryInfo`-style GPU reading as a hard requirement*: not portable and often unavailable;
  `renderer.info.memory.*` + heap is reliable and sufficient for growth detection.
- *A standalone non-PW profiler / Puppeteer harness*: the existing single-worker Playwright config and
  `window.__voxelGame` hook already drive sessions; a second harness duplicates the infra.
- *Extending 075's `RenderPerformanceMonitor`*: that contract is per-frame budgeting; long-horizon
  residency is a different axis and belongs in a distinct, additive module.
- *A 60-minute session*: wall-clock cost is disproportionate for software-WebGL CI; a 10-minute session
  with a time-independent growth rule catches the same leak classes.

## Downstream dependencies

- 240-save-recovery-stress can reuse the world-reload cycling pattern for crash/quota recovery.
- 241-deterministic-replay-suite can reuse the session-driving and sampling helpers for replay-length
  stress.
- 247-performance-release-gate may fold the residency ceilings into release hardware tiers.
