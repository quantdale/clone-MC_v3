# Spec: long-session-leak-validation

## Contract

The browser-scripted long-session suite MUST detect memory and GPU-resource leaks across extended
exploration, build, and simulation sessions and across teleport, world-reload, block-entity, and
GPU-context-restore cycles. Every scenario MUST sample a concrete, documented counter set at a fixed
interval, define a concrete pass/fail growth ceiling, and assert it. The suite MUST run under the
existing Playwright harness (headless Chromium, single worker, `VITE_E2E=true`) against the production
build served by `vite preview`. This spec is the **browser-measured** half of change 239; the
headless-unit-tested half is `memory-resource-budgets`, whose `evaluateResourceBudget` the scenarios
use to validate the live-resource snapshot.

## Definitions

- **Heap**: `performance.memory.usedJSHeapSize` in bytes (Chromium-only). The suite MUST verify the API
  exists before trusting a heap result and MUST fail with an explicit "heap measurement unavailable
  (non-Chromium)" error when it does not.
- **GPU resources**: `renderer.info.memory.geometries`, `renderer.info.memory.textures`,
  `renderer.info.programs`, and `renderer.info.render.calls` read from the live `window.__voxelGame`
  renderer via `page.evaluate`.
- **Live snapshot**: a `LiveResourceSnapshot` assembled in the browser from `world.getStats()`
  (`loadedChunks`, `pendingGeneration`, `pendingMesh`), `renderer.info.memory.geometries`, and the live
  entity/block-entity/item-entity counts, evaluated with `evaluateResourceBudget`.
- **Sample interval / series**: samples are taken every `SAMPLE_INTERVAL_MS` (default 30,000) across a
  session of duration `SESSION_MS` (default 600,000 / 10 minutes for exploration). Implementations MAY
  shorten `SESSION_MS` for CI practicality provided the growth rule stays time-independent (settled
  medians) and every scenario still samples the documented counters at the documented interval; the
  actual durations are recorded in `verification.md`.
- **Settled samples**: samples taken ≥ `SETTLE_MS` (default 5,000) after the last input stop and, when
  `window.gc` is available, after a forced `window.gc()`.
- **Growth rule**: `median(last k settled samples) − median(first k settled samples) ≤ ceiling`, with
  `k = 5`. A run violates when the rule fails or when any settled budget evaluation is out of budget.

## Invariants

- In steady state (player stopped, queues drained), `loadedChunks` settles to the residency ceiling
  `(2·r+1)² × layerCount` with `r = max(R, preloadRadius)` (the boot preload ring is retained; headless
  `R=2`, preload radius 3 → 49) and pending jobs drain to 0.
- Live residency does not grow monotonically across cycles: after each teleport / world-reload /
  away-and-back cycle, resources return to the same plateau as after the previous cycle.
- Block-entity and entity counts return to baseline when their owning chunk unloads.
- GPU resources stabilize to a plateau after any context restore and never permanently grow across
  restores or reloads.

## Requirements

### Requirement: measurement method is concrete
Every scenario MUST sample the documented counter set at the documented interval, compute the growth
rule over settled samples, and report forced-GC availability and session wall-time.

#### Scenario: heap series is measured
- **GIVEN** `performance.memory` is present
- **WHEN** a session samples at `SAMPLE_INTERVAL_MS`
- **THEN** each sample records `usedJSHeapSize`, and the final report states the settled-median growth
  and whether `window.gc` was available.

#### Scenario: heap measurement unavailable
- **GIVEN** `performance.memory` is undefined
- **WHEN** a heap-asserting scenario starts
- **THEN** it fails with "heap measurement unavailable (non-Chromium)" and does not silently pass.

### Requirement: long exploration session
An N-minute exploration session (default 10 min) MUST keep heap growth within the heap ceiling and keep
the live-resource budget within budget.

#### Scenario: exploration heap growth ceiling
- **GIVEN** a session where the player holds movement keys in a fixed pattern for `SESSION_MS`
  (sampling every `SAMPLE_INTERVAL_MS`, forcing GC when available)
- **WHEN** the session ends and settles
- **THEN** `median(last 5 settled heap) − median(first 5 settled heap) ≤ 8 MiB` and the settled
  `evaluateResourceBudget` report is within budget.

#### Scenario: exploration GPU-resource plateau
- **GIVEN** the same exploration session
- **WHEN** the player stops and the world settles
- **THEN** `renderer.info.memory.geometries` settles to a plateau and the plateau at the end differs
  from the plateau after settling the first minute by at most 4 geometries; `info.memory.textures` does
  not grow beyond its first-settled value, and `info.programs` grows by at most a small fixed allowance
  (≤ 4) — shader programs are compiled lazily as new terrain/light configurations render, so a constant
  small allowance is expected, but never per-chunk unbounded growth (which would indicate a leak).

### Requirement: build and chunk-churn session
A sustained build/break loop MUST keep the chunk queues and mesh-geometry count bounded.

#### Scenario: bounded queues under churn
- **GIVEN** a session that repeatedly places and breaks blocks in a loop for `SESSION_MS`
- **WHEN** sampled at `SAMPLE_INTERVAL_MS`
- **THEN** `pendingGeneration + pendingMesh` never exceeds the `maxPendingJobs` budget
  (`CONFIG.maxQueueSize` + the loaded-chunk-bounded retry queue) in any sample and the settled budget
  report is within budget.

#### Scenario: geometry bounded under churn
- **GIVEN** the same churn session
- **WHEN** it settles
- **THEN** `renderer.info.memory.geometries` does not grow beyond `2 × loadedChunks + allowance` (the
  `maxMeshGeometries` ceiling) and the end plateau exceeds the first-settled plateau by at most 4.

### Requirement: idle simulation session
An idle simulation session (mobs, items, orbs ticking) MUST keep entity/item/orb counts bounded.

#### Scenario: live entity counts bounded
- **GIVEN** an idle session where the world is loaded and simulating but no input is given
- **WHEN** sampled over `SESSION_MS`
- **THEN** `activeEntities` stays within its budget, item entities stay within `maxItemEntities`, and
  the settled budget report is within budget.

### Requirement: teleport cycling
Repeatedly teleporting the player across the world MUST NOT grow live resources across cycles.

#### Scenario: plateau stable across teleports
- **GIVEN** a session that teleports the player to a deterministic grid of far coordinates (setting
  `game.player.position`) and, each time, waits for `#loading` hidden and `loadedChunks` to settle to a
  stable plateau (queues drained, count stable)
- **WHEN** sampled after each settle for ≥ 8 cycles
- **THEN** the `loadedChunks` value after each settle stays within the residency ceiling `maxLoadedChunks`
  and no cycle grows the plateau by more than 4 over the previous cycle (warm-up cycles may only
  decrease or hold) — no monotonic growth — and the live `meshGeometries` stays within the
  `maxMeshGeometries` budget every cycle (the tight single-session geometry plateau is asserted in the
  exploration scenario; cross-teleport geometry jitters with mesh create/dispose churn and is not a leak
  signal on its own).

### Requirement: world-reload cycling
Repeatedly reloading the page MUST NOT grow the JS heap across reloads (a leaked `WebGLRenderer` keeps
GPU wrapper objects alive in the JS heap).

#### Scenario: heap bounded across reloads
- **GIVEN** a session that calls `page.reload()` and waits for the world to be ready, repeated for ≥ 6
  reloads, forcing GC before each settled heap sample
- **WHEN** the settled heap is compared across reloads
- **THEN** `median(last 3 reload settled heap) − median(first 3 reload settled heap) ≤ 8 MiB`; the
  `renderer.info.memory.*` of each fresh renderer is also recorded and reported.

### Requirement: block-entity accumulation
Leaving / reloading the chunks that own block entities MUST return the live block-entity count to
baseline. In the single-player browser world block entities are not wired in (see `design.md`
reconciliation), so the live count is `0` at baseline and MUST remain `0` (bounded) across
away-and-back and reload cycles; the owning-chunk-unload lifecycle itself is validated headlessly
against `BlockEntityManager`.

#### Scenario: away-and-back returns to baseline
- **GIVEN** a session whose live block-entity count is `0` at baseline (single-player does not
  instantiate block entities)
- **WHEN** the player teleports far away (owning/visited chunks unload) and back, and the page reloads,
  for ≥ 3 cycles
- **THEN** the live block-entity count after each return is `0` — never greater than baseline and never
  growing across cycles — and the settled budget report is within budget. The headless
  `BlockEntityManager` lifecycle (add N → `removeChunk` → count returns to baseline across repeated
  away-and-back cycles) is asserted in `tests/unit/MemoryResourceBudget.test.ts`.

### Requirement: GPU-context restore
A WebGL context loss/restore MUST NOT permanently add GPU resources.

#### Scenario: plateau stable across restore
- **GIVEN** a running game whose canvas fires `webglcontextlost` and `webglcontextrestored` (the
  `Renderer` disposes and recreates the `WebGLRenderer`)
- **WHEN** the world re-settles after the restore
- **THEN** `renderer.info.memory.geometries`, `info.memory.textures`, and `info.programs` settle to
  plateaus that differ from the pre-restore plateaus by at most 4 geometries / 1 texture / 1 program,
  and the game is still rendering (no fatal error state).

### Requirement: failure behavior
A system error that stops the tick process MUST NOT grow live resources while the game is erroring.

#### Scenario: bounded resources on error
- **GIVEN** a session that injects a failing update (the test-only `Game.failSimulation()` hook throws in
  the next `update`, which the `GameLoop` catches and routes to the recoverable error state)
- **WHEN** sampled after the error is surfaced
- **THEN** the game is in the error state (fatal UI, stopped loop), and `loadedChunks`, `pendingJobs`,
  and `meshGeometries` do not exceed their budgets in any subsequent sample; the budget report stays
  within budget.

## Error and failure behavior

- Heap measurement unavailable → scenario fails with the documented error (never silent pass).
- Forced-GC unavailable → scenario continues, records "gc: unavailable", and the growth rule still
  applies to settled medians.
- A `pageerror`/console error that is not part of the intended failure scenario → scenario fails.
- Any budget dimension out of budget in a settled sample → scenario fails, printing the full series and
  the offending dimension (budget vs actual).

## Performance and resource bounds

Scenarios are CI-time cost, not runtime cost. Sampling reads already-accumulated counters
(`world.getStats()`, `renderer.info`, `performance.memory`) and adds no measurable game cost. Session
durations (10-min exploration default) and the time-independent growth rule are chosen so the suite is
practical under software-WebGL headless Chromium while still catching per-cycle leaks.

## Compatibility and migration

Additive: one new e2e file plus (optionally) a `--js-flags=--expose-gc` launch arg in
`playwright.config.ts`. No production behavior change; no stored data or format change.

## Security and integrity

Scenarios run against a local `vite preview` build with the `VITE_E2E` hook; no external network, no
credentials, no destructive actions beyond the in-page test world.

## Observability

On failure each scenario prints the full sample series (timestamps, heap, GPU counters, budget verdict)
plus a summary line (forced-GC availability, session wall-time, settled-median growth per rule) so a
reviewer can trace the growth curve and identify the exact leaking dimension.

## Verification mapping

- `tests/e2e/memory-stress.spec.ts` — one scenario per Requirement (measurement method, exploration
  heap + GPU, build/churn, idle simulation, teleport cycling, world-reload cycling, block-entity
  accumulation, context restore, failure behavior), each using a shared `sampleLiveResources(page)`
  helper that imports `evaluateResourceBudget` from `memory-resource-budgets`.
