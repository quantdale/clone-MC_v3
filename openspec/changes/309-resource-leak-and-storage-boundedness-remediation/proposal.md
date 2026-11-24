# Proposal: 309-resource-leak-and-storage-boundedness-remediation

## Problem

During the repository-wide audit and preceding Change 308 verification, three resource leaks and boundedness defects were identified:

1. **DirtySaveQueue epoch-map unbounded memory retention**: In `src/storage/DirtySaveQueue.ts`, `this.epochs` records a monotonic generation for every key marked dirty. Although successful drains remove units from `this.pending`, un-superseded keys are never pruned from `this.epochs`, nor is `this.epochs` cleared on queue clear. In a 10,000 distinct-key probe, `this.epochs` permanently retained 10,000 entries after all writes succeeded. Over extended gameplay involving streaming across many chunks, this is an unbounded memory leak.

2. **Wither skull Three.js material leak and per-tick allocation churn**: In `src/engine/Game.ts` `syncWitherPresentation()`, skull presentation destroys and recreates skull meshes every tick. It disposes `mesh.geometry`, but NEVER calls `(mesh.material as THREE.Material).dispose()`. Furthermore, it allocates new `SphereGeometry(0.15, 6, 6)` and new `THREE.MeshLambertMaterial` instances on every single frame/tick for up to 12 skulls (up to 240–720 allocations per second). In Three.js, un-disposed materials leak compiled WebGL shader programs and GPU resources until the browser WebGL context crashes. In addition, when withers die or despawn (`!present.has(id)`), the wither group is removed from the parent without disposing any child mesh geometries or materials.

3. **Incomplete resource teardown in Game.dispose()**: In `src/engine/Game.ts` `dispose()`, several critical subsystems that allocate GPU buffers, Three.js geometries/materials, canvas event listeners, and browser hardware resources are never disposed. Specifically:
   - `this.renderer.dispose()` is never called, leaving the Three.js `WebGLRenderer` and canvas context event listeners active.
   - `this.audio.dispose()` is never called, leaving the Web Audio `AudioContext` unclosed.
   - `this.interaction.dispose()` is never called, leaking the target outline line segments geometry and material.
   - `this.environment.dispose()` is never called, leaking sky and cloud geometries/materials.
   - `this.lighting.dispose()` is never called.
   - `this.passiveMobRenderer.dispose()` and `this.hostileMobRenderer.dispose()` are never called, leaking mob geometries/materials.
   - `this.raiderRenderer.dispose()` and `this.splashPotionRenderer.dispose()` are never called, leaking raider and splash bottle geometries/materials.
   - `this.worldLife.dispose()` is never called, leaking entity geometries/materials.
   - Remaining wither groups and skull meshes are never disposed.

## Goals

1. Bound `DirtySaveQueue` memory by ensuring `this.epochs` entries are cleaned up when writes succeed without supersession and on queue clear.
2. Eliminate the WebGL material leak and per-tick allocation thrashing in `syncWitherPresentation()` by reusing static shared skull geometries/materials and properly disposing child meshes when withers despawn.
3. Complete `Game.dispose()` teardown so all allocated WebGL, AudioContext, DOM listeners, and Three.js resources are properly and idempotently released.
4. Prove all fixes with deterministic failing-first tests and maintain 100% green baseline gates.

## Non-goals

No save schema or format changes, no gameplay rebalancing, no visual regression changes, no dependency changes. Change 258 remains BLOCKED under its existing owner deferral; no hardware GPU evidence is claimed.

## Preconditions

Change 308 is VERIFIED (7/7, 100%) and published to `origin/main` at `d2daeadb4808c981dff2ba2adc0e01cd239110de`. Worktree is clean. Change 258 remains BLOCKED.

## Dependencies

Existing `DirtySaveQueue`, `Game.ts`, `Renderer.ts`, Three.js, and Vitest test harnesses.

## Proposed change

1. In `src/storage/DirtySaveQueue.ts`:
   - Delete `this.epochs` entry for a key when its write finishes and has not been superseded (`this.epochs.get(key) === entry.epoch`).
   - Clear `this.epochs` on `clear()` when no write is in flight.
   - Expose a public getter `retainedEpochCount` to observe and verify boundedness.
2. In `src/engine/Game.ts`:
   - Introduce cached/shared static geometry and materials for wither skulls and clean up wither child meshes, geometries, and materials upon wither despawn.
   - Wire all missing subsystem `.dispose()` calls into `Game.dispose()`: `renderer`, `audio`, `interaction`, `environment`, `lighting`, `passiveMobRenderer`, `hostileMobRenderer`, `raiderRenderer`, `splashPotionRenderer`, `worldLife`, and wither meshes/groups.
3. Add deterministic unit tests verifying:
   - 10,000 distinct-key writes leave `retainedEpochCount === 0`.
   - Skull presentation reuses shared geometry/material and wither removal disposes child resources.
   - `Game.dispose()` executes complete, idempotent subsystem teardown.

## Compatibility and migration

Purely additive and internal lifecycle/memory management improvements. No serialized data, database format, public API, or visual golden changes.

## Risks

Improper epoch pruning could re-introduce supersession races if an epoch is deleted while a concurrent drain or mark is in flight. The implementation must delete an epoch entry strictly under the drain mutex after confirming the generation has not changed.

## Rollback strategy

Revert the change commits cleanly.

## Definition of Done

- Failing-first tests reproduce all three defect categories and pass after remediation.
- 100% tasks checked.
- All baseline gates (`verify:deps`, `validate-state`, `typecheck`, `lint`, `npm test`, `build`, `verify:all`, `test:perf:multiplayer`) pass.
- State and manifest reconciled and published.

## Advancement gate

100% task completion, all mandatory requirements verified, required tests pass, no regression or memory leak blockers. Change 258 remains BLOCKED.
