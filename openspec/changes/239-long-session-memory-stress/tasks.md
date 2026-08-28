# Tasks: 239-long-session-memory-stress

## 1. Baseline & characterization

- [x] 1.1 Verify the current runtime caps used by the budget contract: `CONFIG.maxQueueSize` (512),
  `World.EDIT_OVERLAY_MAX_CHUNKS` (10,000), desktop/headless render-distance interest-ring cardinality,
  `SPAWN_CAP`, item-entity/xp-orb despawn bounds, and `ChunkStreamManager` snapshot bound; record them
  in `design.md` and derive the `DEFAULT_MEMORY_RESOURCE_BUDGET` values from them.
- [x] 1.2 Characterize current long-session behavior: confirm `World` disposes per-chunk `geometry` on
  unload, the edit overlay is LRU-capped, queues are bounded, and the `stateOverlay` growth surface;
  record any gap (e.g. `stateOverlay` unbounded) as a candidate fix for 4.2/4.3.
- [x] 1.3 Confirm the browser measurement seams exist and are reachable: `window.__voxelGame`,
  `world.getStats()`, `renderer.renderer.info.memory.*`, entity/block-entity/item-entity live counts, and
  `performance.memory` (Chromium). Record which counts are not yet exposed and need a measurement hook.

## 2. Implementation

- [x] 2.1 Add `src/rendering/MemoryResourceBudget.ts`: `MemoryResourceDimension`,
  `LiveResourceSnapshot`, `MemoryResourceConfig`, `MemoryResourceEntry`, `MemoryResourceReport`,
  `DEFAULT_MEMORY_RESOURCE_BUDGET`, `validateMemoryResourceConfig`, and
  `evaluateResourceBudget` (per-dimension + overall verdict, fixed entry order, total evaluation).
- [x] 2.2 Add `tests/e2e/memory-stress.spec.ts` with a shared `sampleLiveResources(page)` helper that
  assembles a `LiveResourceSnapshot` from the live game and runs it through `evaluateResourceBudget`,
  recording the raw heap + GPU series.
- [x] 2.3 Add (test-only) Playwright launch option to force GC in headless Chromium
  (`--js-flags=--expose-gc`) in `playwright.config.ts`, and make the heap sampler detect
  `performance.memory` availability and fail explicitly when absent.
- [x] 2.4 Expose any missing live-resource count the scenarios need (e.g. block-entity / entity / item
  entity size, or an edit-overlay chunk count) via an existing test hook, without changing gameplay.

## 3. Focused unit tests (headless)

- [x] 3.1 `tests/unit/MemoryResourceBudget.test.ts`: config-validation matrix (0, negative, fractional,
  NaN, Infinity, non-number, missing field, extra key).
- [x] 3.2 Evaluation scenarios: all-within, single-dimension violation, boundary equality
  (`actual === budget`), malformed actuals (negative/NaN/Infinity/missing/non-numeric), overall verdict,
  fixed entry order.
- [x] 3.3 Default-ceiling derivation: desktop `R=6` → `maxLoadedChunks === 169`, `maxPendingJobs ===
  512 + 169`, `maxMeshGeometries === 2·169 + 40`, `maxEditOverlayChunks === 10_000`; headless `R=2` →
  `49` / `2·49 + 40` (residency ceiling is the radius-3 preload ring, not the R=2 ring).
- [x] 3.4 Determinism: identical config + snapshot produce deeply equal reports.

## 4. Edge / failure, integration, regression & final gate

- [x] 4.1 Edge/failure: heap measurement unavailable → scenario fails with the documented error;
  forced-GC unavailable → scenario records `gc: unavailable` and still applies the settled-median growth
  rule; malformed snapshot actuals violate without throwing.
- [x] 4.2 Integration: long exploration session (heap ceiling ≤ 8 MiB settled-median growth; GPU plateau
  drift ≤ 4 geometries) and build/chunk-churn session (queues ≤ `maxQueueSize`; geometry bounded); fix
  any leak the suite surfaces (e.g. `stateOverlay` unbounded growth) and re-run the failing scenario.
- [x] 4.3 Integration: idle simulation session (entity/item/orb counts bounded); teleport cycling
  (`loadedChunks` returns to ring cardinality, plateau stable); world-reload cycling (heap bounded across
  ≥ 6 reloads); block-entity away-and-back (count returns to baseline); GPU-context-restore (plateau
  stable); failure scenario (resources bounded on error).
- [x] 4.4 Regression & final gate: run the full baseline gate (`npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`, `npm run test:e2e`), record evidence in `verification.md`, and advance
  change 239 to VERIFIED in `PROGRAM_STATE.json` / `PROGRAM_STATE.md` per the review handoff protocol.
