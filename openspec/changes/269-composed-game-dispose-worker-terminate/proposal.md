# Proposal: 269-composed-game-dispose-worker-terminate

## Problem

Certification debt **R-6** retains one open residual: the composed-Game
dispose/worker-terminate path has no end-to-end proof. The 257 campaign closed
the corruption/player-state/reset subset with real IndexedDB harnesses; the
risk register explicitly defers "composed-Game dispose/worker terminate" to
later hardening. Concretely:

- `MeshWorkerClient` (`src/rendering/WorkerMeshing.ts`) has **no `dispose()`**.
  `World.dispose()` nulls its reference after cancelling batches, but the
  client itself owns per-job wall-clock timeouts and pool correlations with no
  explicit teardown or post-dispose submit guard.
- `World.dispose()` (`src/world/World.ts:3462`) works by accident, not by
  contract: no `disposed` flag, no guard on the worker-meshing entry points.
- `Game.dispose()` (`src/engine/Game.ts:1381`) is guarded and tears down the
  loop, timers, and window/document/canvas listeners, but `start()` can
  resurrect the rAF loop post-dispose and the ten Game-level UI click/change
  listeners can still mutate game state after teardown.

## Goals

- Audit `Game.dispose()` and the world/worker teardown paths (`MeshWorker`
  pool/client, generation workers if composed).
- Guarantee dispose is idempotent and terminates/joins workers so no
  post-dispose callbacks mutate state or leak handles.
- Guarantee no pending timers/rAF/listeners from Game keep the page alive
  after dispose (workers terminated or documented equivalent shutdown).
- Prove it with unit/integration tests (double-dispose safety + worker
  terminate, mock or real Worker per repo patterns) plus a focused e2e
  harness feasible without headed GPU.
- Close R-6 (or narrow the residual explicitly if something irreducible
  remains).

## Non-goals

- No gameplay behavior retune (movement, meshing output, tick order, save
  format all byte-identical pre/post dispose-path changes).
- No 258 headed work: no FPS measurement, no GPU evidence, 258 stays BLOCKED.
- Reopening 259–268 is forbidden unless a dispose/worker regression blocks
  the 269 teardown path.
- No new worker features (pool sizing, new job kinds, generation workers).

## Preconditions

- 258 stays **BLOCKED** at 40/100 (headed hardware-WebGL certification
  deferred by owner decision 2026-09-11).
- 259–268 stand **VERIFIED**; 269 is the sole ACTIVE implementation change
  (CHANGE_SEQUENCE_OVERRIDES.md authorization 2026-09-12).
- Session start `9cab4d9fcb92dcc37f53b2fb13bdaf6f797d2936` (fetched; local
  HEAD equals `origin/main`).

## Dependencies

- `src/engine/WorkerPool.ts` (dispose terminates + fails outstanding, proven
  idempotent by `tests/unit/WorkerPool.test.ts`).
- `src/worldgen/WorkerWorldgen.ts` (`WorldgenWorkerClient.dispose` cancels
  without firing callbacks; `createWorldgenWorkerRuntime` dispose order is
  client-then-pool — the precedent this change mirrors for the mesh client).
- `src/storage/GamePersistence.ts` (async dispose already idempotent;
  post-dispose capture/save are safe no-ops, proven by
  `tests/unit/GamePersistence.test.ts`).

## Proposed change

1. Add `MeshWorkerClient.dispose()`: idempotent; clears every pending
   wall-clock timeout; cancels owned pool jobs; drops all bookkeeping
   **without** invoking result callbacks; post-dispose `requestSection`
   throws and `handleMessage` returns `null`.
2. Harden `World.dispose()`: explicit `disposed` flag + early return;
   dispose the mesh client before nulling it; refuse worker-meshing entry
   (`ensureWorkerMeshing` → false, `submitWorkerMeshJob` no-op) after
   dispose.
3. Harden `Game.dispose()` contract: `start()` is a no-op after dispose
   (rAF cannot resurrect); the ten Game-level UI click/change listeners
   no-op after dispose (no post-dispose state mutation).
4. Tests: new `MeshWorkerClientDispose` unit suite; new `WorldDispose`
   unit/integration suite (double-dispose safety + worker terminate via the
   repo's fake-worker pattern); new focused `tests/e2e/game-dispose.spec.ts`
   (boot → double dispose → no page errors, feasible headless).
5. Close R-6 with evidence pointer; add `PARITY_MATRIX.md` C269 row.

## Compatibility and migration

No stored, network, or public API data changes. `dispose()` additions are
new methods / early-return guards only; every existing call site keeps its
current behavior before dispose is invoked.

## Risks

- Over-guarding could silence legitimate re-init (e.g. context-restore
  paths). Mitigation: guards apply only after the terminal `dispose()`
  flag; `handleContextRestored` recreates the renderer, it never reuses a
  disposed Game/World.
- E2E flakiness on software WebGL. Mitigation: the dispose spec asserts only
  JS-level facts (clean double dispose, zero page errors), not pixels.

## Rollback strategy

Revert the 269 commits; the dispose path returns to its current
works-by-accident state with R-6 reopened. No migration to unwind.

## Definition of Done

- `MeshWorkerClient.dispose()` exists, is idempotent, and never fires
  result callbacks.
- `World.dispose()` twice + `Game.dispose()` twice are safe; workers are
  terminated (fake-worker `terminate` observed in unit; pool terminate
  path unchanged and already proven).
- No post-dispose callback mutates World/Game state (unit proof via
  deferred fake-worker delivery after dispose).
- No pending Game timers/rAF/listeners after dispose (code audit +
  e2e harness green).
- R-6 reads CLOSED by Change 269 (or narrowed with explicit residual).
- Full baseline gate green: `validate-state`, `typecheck`, `lint`,
  unit `test`, `build`, `test:e2e` (focused dispose spec at minimum;
  full suite if time permits without headed GPU).

## Advancement gate

Target 100% task completion plus all MUST/SHALL verified and required
tests green. Floor 90% only via an explicit Advancement Exception proving
every incomplete task is non-blocking and implements/verifies no
MUST/SHALL requirement. 258 MUST NOT be marked VERIFIED by this track.
