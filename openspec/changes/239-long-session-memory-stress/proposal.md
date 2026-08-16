# Proposal: 239-long-session-memory-stress

## Problem

The engine already bounds individual caches (chunk gen/mesh queues by `CONFIG.maxQueueSize`, the edit
overlay by `EDIT_OVERLAY_MAX_CHUNKS` of 10,000, `ChunkStreamManager` snapshots by 1024) and disposes
per-chunk GPU geometries on unload (`World.removeMeshesForChunk` → `geometry.dispose()`), but there is
**no automated validation** that these bounds hold over an *extended* session. Nothing measures heap or
GPU-resource growth across minutes of exploration, building, simulation, and repeated teleport /
world-reload cycling. A regression that leaks a chunk mesh, an edit-overlay entry, a `REMOVED` entity, a
block-entity record, or a GPU buffer per cycle would go undetected until a user plays long enough to
hit a crash. The renderer-level budget contract (075) covers per-frame draw/build/frame budgets but not
long-horizon residency or leak growth.

## Goals

- Add a headless, unit-testable **memory-resource budget contract** (mirroring the 075 render-budget
  pattern) that validates a snapshot of live-resource counters against concrete ceilings and reports a
  per-dimension verdict. The ceilings MUST match the real current runtime caps and MUST be deterministic.
- Add a **browser-scripted long-session leak-validation suite** (Playwright) that runs extended
  exploration / build / simulation sessions and teleport / world-reload / block-entity / GPU-context
  cycles, samples heap and GPU-resource counters at fixed intervals, and asserts concrete growth
  ceilings.
- Define, in one place, the measurement method: exactly which counters are sampled, at what interval,
  how GC is forced, which parts are headless-unit-testable versus browser-measured, and what
  pass/fail growth rule each scenario asserts.
- Fix any leaks the new suite surfaces, limited to the scenarios this change defines.

## Non-goals

- Not frame-time / draw-call / mesh-build budgeting (already 075).
- Not worker saturation or frame/tick budget enforcement under load (238-worker-and-main-thread-stress).
- Not abrupt-close, partial-write, quota, or import/export recovery (240-save-recovery-stress).
- Not deterministic input/tick replay (241-deterministic-replay-suite).
- Not a general-purpose production memory profiler; the budget contract is validation/observability
  tooling, not a user-facing feature.
- No gameplay, rendering, or storage behavior changes beyond fixes required by a failing leak scenario
  this change defines.

## Preconditions

- Change 238 (worker and main-thread stress) is implemented and verified, so frame/tick-budget
  behavior under load is stable before long-horizon residency is measured. (Per `CHANGE_SEQUENCE.md`
  ordering, 239 may be *documented* in advance but must not be implemented ahead of 238.)
- The E2E build flag (`VITE_E2E`) and `window.__voxelGame` test hook exist (src/main.ts).
- Headless overrides (`CONFIG.headless`, `navigator.webdriver`) exist (src/config, src/engine/Game.ts).

## Dependencies

- 075-render-performance-contract: the `RenderBudget`/`RenderPerformanceMonitor` evaluation pattern is
  reused for the memory-resource budget contract.
- 038/039/043 storage layer and `ChunkSectionRepository`-style IndexedDB stores: long-session autosave
  growth is sampled as a secondary signal; no new persistence code is added.
- Existing Playwright harness (playwright.config.ts, tests/e2e/game.spec.ts) and the `window.__voxelGame`
  hook for driving sessions and reading `renderer.info` and `performance.memory`.

## Proposed change

Two artifacts:

1. **`MemoryResourceBudget`** (headless): `LiveResourceSnapshot`, `MemoryResourceConfig`,
   `validateMemoryResourceConfig`, `evaluateResourceBudget`, and `DEFAULT_MEMORY_RESOURCE_BUDGET`.
   Pure, deterministic, DOM-free; unit-tested. It defines the live-resource dimensions
   (loaded chunks, pending jobs, mesh geometries, edit-overlay chunks, block entities, active entities,
   item entities), their concrete ceilings (derived from the real runtime caps), validation, and a
   per-dimension + overall verdict. This is the headless-measurable half of the contract.

2. **Long-session browser stress suite** (e2e): Playwright scenarios that run N-minute
   exploration / build / simulation sessions and teleport / world-reload / block-entity /
   GPU-context-restore cycles, sampling `performance.memory.usedJSHeapSize` and
   `renderer.info.memory.{geometries,textures}` plus `renderer.info.programs`/`render.calls` and
   `world.getStats()` at fixed intervals, and asserting concrete growth ceilings. This is the
   browser-measured half.

The measurement method (counters, interval, GC forcing, ceilings, unit-vs-browser split) is specified
normatively in the two capability specs so a test author can determine pass/fail without guessing.

## Compatibility and migration

Additive. New pure module + new e2e files. No stored data, public API, or serialized format changes.
`playwright.config.ts` may gain a Chromium `--js-flags=--expose-gc` launch option (and, if needed, a
`--enable-unsafe-swiftshader` / GPU-force flag) so GC and software-GL are deterministic; these are
test-only and do not affect the production build. No `CONFIG` defaults change.

## Risks

- **Heap measurement is Chromium-specific**: `performance.memory` is Chromium-only and returns
  best-effort numbers. Mitigation: the browser scenarios assert the API is present and otherwise fail
  with an explicit "measurement unavailable" error; growth ceilings are deliberately coarse (MiB
  scale) and compare medians, not noisy single samples.
- **GPU memory is not directly readable** in a portable way. Mitigation: use `renderer.info.memory.*`
  (Three.js counters) as the GPU-resource signal within a session, and `performance.memory` heap as the
  cross-reload signal (a leaked `WebGLRenderer` keeps JS-side GPU wrapper objects alive). The
  `WEBGL_memory_info` extension is probed opportunistically but not required.
- **Low-FPS software WebGL in headless CI** makes wall-clock sessions slow. Mitigation: reuse the
  existing headless overrides (render/sim distance 2) and scale session lengths (e.g. 10-minute
  exploration, not 60) while keeping the growth rule independent of absolute time.
- **Flaky GC timing**: `window.gc()` is unavailable unless `--expose-gc` is set. Mitigation: force GC
  when available and always sample both before and after a forced GC; the ceiling rule compares medians
  of settled samples.
- **Block entities / entities may not yet be wired into the single-player browser world**, so some
  scenarios may need the implementing agent to expose a live count hook or run against a headless
  fixture. The contract states the invariant (count returns to baseline after away-and-back); the
  implementing agent wires the measurement seam and records any gap.

## Rollback strategy

The new module and e2e files are additive and independent; removing them restores prior behavior. Any
production fix a failing scenario triggers is small, scoped to the specific cache/resource, and
guarded by the same scenario. No migration or data changes.

## Definition of Done

- `MemoryResourceBudget` exists, is deterministic, and passes its unit suite; every configured
  dimension has a concrete ceiling matching the current runtime cap and an evaluation verdict.
- The long-session browser suite exists and runs green headlessly under the existing Playwright
  harness, covering exploration, build/chunk churn, simulation, teleport cycling, world-reload cycling,
  block-entity accumulation, GPU-context restore, and a failure scenario. Reconciliation: the
  single-player browser world does not wire block entities, so the block-entity lifecycle invariant is
  validated headlessly against `BlockEntityManager` and the browser scenario asserts the live count
  stays at baseline (0); the failure scenario is driven by a test-only `Game.failSimulation()` hook.
- Every scenario names its sampled counters, sampling interval, GC policy, and concrete pass/fail
  ceiling; the spec states which parts are headless-unit-tested vs browser-measured.
- No leak the suite detects remains unfixed without a recorded, non-blocking exception.
- Baseline gate passes: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`.

## Advancement gate

100% task completion with all requirements verified and the full baseline gate green. Advancement
below 100% requires the explicit exception process in `AGENTS.md`; no MUST/SHALL requirement may be
unimplemented or unverified.
