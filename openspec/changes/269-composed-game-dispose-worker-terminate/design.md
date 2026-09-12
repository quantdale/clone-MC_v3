# Design: 269-composed-game-dispose-worker-terminate

## Context/current state

Audit of the composed teardown path (2026-09-12, tree at `9cab4d9`):

- `Game.dispose()` (`src/engine/Game.ts:1381-1447`): guarded by
  `this.disposed` (idempotent). Tears down: `loop.stop()` (cancels rAF),
  `tickDriver.pause()`, `toastTimer` + `resizeTimer` clears, all six
  content panels closed, durable saves flushed, `persistenceImpl.dispose()`
  (void, best-effort), health unsubscribe, `input.dispose()` (removes all
  canvas/document/window listeners), `detachTouchCapture()` (removes the
  four canvas pointer listeners), `resize`/`pagehide`/`blur`/
  `visibilitychange` removals, `world.dispose()`, and
  `materials`/`atlas`/`resources`/`hotbar` dispose (`resources` owns the
  `Renderer` — whose dispose removes the canvas context listeners — and
  the `GameAudio`). Gaps: (a) `start()` post-dispose restarts the rAF
  loop; (b) ten Game-level UI click/change listeners (recovery
  backup/reset, gamerule/recipebook/advancements/creative open, gamemode
  chip + select, hardcore toggle, difficulty select) close over `this`
  with no disposed guard.
- `World.dispose()` (`src/world/World.ts:3462-3501`): cancels every worker
  batch (which cancels client jobs, clearing their timeouts), nulls the
  mesh client, disposes the pool (terminates workers, fails outstanding
  jobs once), disposes chunks/meshes/lights/queues. Gaps: (a) no
  `disposed` flag — idempotency is accidental; (b) the mesh client is
  nulled, never disposed; (c) `ensureWorkerMeshing`/`submitWorkerMeshJob`
  accept work after dispose.
- `MeshWorkerClient` (`src/rendering/WorkerMeshing.ts:894-1156`): owns
  per-job `setTimeout` handles, pool correlations, and five bookkeeping
  maps. Has `cancel`/`cancelByToken` but **no `dispose()`** and no
  post-dispose submit guard.
- `WorkerPool.dispose()` (`src/engine/WorkerPool.ts:329-347`): idempotent,
  fails queued + in-flight once each, nulls handlers, `terminate()`s
  every slot. Already proven (`WorkerPool.test.ts:274`). Unchanged.
- `WorldgenWorkerClient.dispose()` / `createWorldgenWorkerRuntime`
  (`src/worldgen/WorkerWorldgen.ts:311-330,490-498`): idempotent,
  cancels every owned job **without firing callbacks**, then the pool is
  terminated (client-then-pool order). Proven
  (`WorkerWorldgen.test.ts:555-557`). **No production Game/World path
  composes a worldgen runtime** (only `WorkerSaturationHarness` test
  support does) — so there is no generation worker to terminate in the
  composed game; the mesh pool is the only worker owner. This is the
  documented equivalent shutdown for the "generation workers if any"
  scope.
- `GamePersistence.dispose()` (`src/storage/GamePersistence.ts:1072`):
  idempotent async; post-dispose capture/save are safe no-ops. Unchanged.
- UI panels (`src/ui/*`): element-scoped listeners only (no global
  listeners, timers, or rAF). Owned by Game, hidden at dispose, die with
  the page. Documented equivalent shutdown — no per-panel dispose added.

## Target state

- `MeshWorkerClient.dispose(): void` — idempotent; for every pending job:
  clear its timeout, cancel its pool correlation, drop bookkeeping via the
  existing `abandon()` path (which fires **no** callback); clear the
  residual maps; set `disposed`. Post-dispose: `requestSection` throws
  `Error('MeshWorkerClient.requestSection: client is disposed')` (mirroring
  `WorldgenWorkerClient.submit`); `handleMessage` returns `null`;
  `cancel`/`cancelByToken` return `false`/`0`.
- `World`: new `private disposed = false`; `dispose()` early-returns on
  second call; disposes `workerClient` before nulling; `ensureWorkerMeshing`
  returns `false` when disposed; `submitWorkerMeshJob` returns immediately
  when disposed.
- `Game`: `start()` early-returns when disposed; each of the ten
  Game-level UI click/change listener bodies no-ops when disposed (guard
  inside the existing closure — no handler-identity or field plumbing, no
  pre-dispose behavior change).
- Tests + R-6 CLOSED + C269 matrix row. No gameplay, tick, meshing,
  persistence, or worker-protocol behavior change.

## Invariants

- I-1: After any `dispose()` returns, no owned callback (result, failure,
  rejection, timeout) fires again for jobs pending at dispose time.
- I-2: `dispose()` is idempotent for Game, World, MeshWorkerClient,
  WorkerPool (existing), WorldgenWorkerClient (existing), GamePersistence
  (existing): second call is a silent no-op and never double-frees.
- I-3: Post-dispose submissions throw (clients) or no-op (World entry
  points); they never enqueue work on a terminated pool.
- I-4: Late worker messages after dispose resolve as stale (`null`) and
  mutate nothing.

## API and data model

```ts
// WorkerMeshing.ts — new method on MeshWorkerClient
dispose(): void;                    // idempotent, fires no callbacks
readonly isDisposed / private disposed: boolean;  // internal flag
```

```ts
// World.ts — new flag + two guards
private disposed = false;
dispose(): void;                    // early return when disposed
private ensureWorkerMeshing(): boolean;   // false when disposed
private submitWorkerMeshJob(...): void;   // no-op when disposed
```

```ts
// Game.ts — two guards
start(): void;                      // no-op when disposed
// ten UI listener closures: if (!this.disposed) ... // no-op when disposed
```

No stored-data, wire-protocol, or public-API shape changes.

## Control/data flow

Dispose order (unchanged, now explicit): Game cancels loop/timers →
closes panels → flushes saves → disposes persistence → unsubscribes →
disposes input/listeners → `World.dispose()` [cancel batches →
`workerClient.dispose()` (clear timeouts, cancel pool jobs, drop maps,
no callbacks) → null client → `pool.dispose()` (fail outstanding once —
each failure lands on an already-abandoned client job and is a no-op —
terminate all slots) → free meshes/lights/queues] → dispose GPU
resources via `ResourceManager` (Renderer context listeners removed,
audio closed).

Late-result safety is three-deep: batch `failed` flag → client maps
empty (`complete`/`reject` find no callback) → pool terminated (no
messages can arrive).

## Detailed behavior

- `MeshWorkerClient.dispose()`: cancel every owned pool correlation first
  (`abandon()` only drops client-side bookkeeping, so skipping this would
  orphan in-flight pool jobs until pool dispose); then iterate
  `[...this.tokens.keys()]` and `abandon()` each (clears timeout, cancels
  protocol record, deletes all five maps); then clear
  `poolJobs`/`callbacks`/`rejectionCallbacks`/`requests`/`tokens`/
  `timeoutHandles` defensively; set `disposed = true`. No callback map
  is read for invocation — `abandon` never invokes.
- `World.dispose()`: `if (this.disposed) return; this.disposed = true;`
  first; `this.workerClient?.dispose()` before `= null`. Guards added at
  `ensureWorkerMeshing` and `submitWorkerMeshJob` heads.
- `Game.start()`: `if (this.disposed) return;` before the `started`
  check. UI listeners: wrap each body (`openGamerule`, `openRecipeBook`,
  `openAdvancements`, `openCreative`, `toggleGameMode`,
  `setGameModeFromText`, `setHardcore`, `setDifficultyFromText` branch,
  `onRecoveryBackup`, `onRecoveryReset` call sites) with a disposed
  early-out inside the closure.

## Failure modes

- Double dispose: silent no-op at every level (I-2); unit-proven.
- Dispose with in-flight worker jobs: jobs fail once via pool dispose;
  client abandon swallows; no throw out of `dispose()` (pool dispose
  never throws; client abandon never throws).
- Dispose racing a still-pending persistence open/flush: persistence
  dispose is best-effort and never throws; Game already fires it void.
- `requestSection` after dispose: throws a descriptive Error (fail-fast,
  mirrors the worldgen client) rather than enqueueing onto a dead pool.

## Compatibility/migration

None: additive method + early-return guards. Existing dispose callers
(`main.ts` error path, e2e, unit) keep exact behavior.

## Performance/resource constraints

Dispose path is terminal and cold; no hot-path budget applies. `dispose()`
itself is O(pending jobs) map cleanup. No new timers, listeners, or
workers are introduced — the change strictly reduces outstanding handles.

## Testing seams

- Fake workers per repo pattern (`WorkerPool.test.ts` FakeWorker,
  `World.test.ts` DeferredMeshWorker + `workerFactory` injection,
  `WorkerWorldgen.test.ts` fake factory with `terminated` flags).
- `MeshWorkerClient` accepts an injected pool (constructor `opts.pool`),
  so unit tests drive dispose semantics with a stub pool — no real
  Workers, no DOM.
- `World` accepts `workerFactory` + `workerMeshing: true`, so the
  integration test observes real `terminate()` calls on fake workers.
- E2E `game-dispose.spec.ts` reuses the `waitForGame` boot helper from
  `game.spec.ts` and drives double dispose through the existing
  `__voxelGame` seam — no new production seams.

## Observability/debugging

No new telemetry. Existing `WorkerPool.stats()` (`workerCount: 0` after
dispose) and the client `pendingCount` (0 after dispose) remain the
debugging surface; tests assert both.

## Affected files/symbols

- `src/rendering/WorkerMeshing.ts` — `MeshWorkerClient.dispose` (new),
  disposed guards on `requestSection`/`handleMessage`/`cancel`/
  `cancelByToken`.
- `src/world/World.ts` — `disposed` flag, `dispose()` early return +
  `workerClient.dispose()`, guards on `ensureWorkerMeshing` /
  `submitWorkerMeshJob`.
- `src/engine/Game.ts` — `start()` guard, ten UI listener disposed
  guards.
- `tests/unit/MeshWorkerClientDispose.test.ts` (new),
  `tests/unit/WorldDispose.test.ts` (new),
  `tests/e2e/game-dispose.spec.ts` (new).
- `openspec/hardening/.../risk-register.md` (R-6 → CLOSED),
  `PARITY_MATRIX.md` (C269 row), program state files.

## Rejected alternatives

- Removing button listeners by handler identity: requires ten new
  fields + constructor wiring for zero additional safety over closure
  guards (page-owned elements cannot keep the page alive past itself).
- Per-panel `dispose()` methods: panels own no global handles; hidden
  + Game-owned is sufficient (documented equivalent shutdown).
- Awaiting `persistenceImpl.dispose()` in `Game.dispose()`: would make
  dispose async and ripple to `main.ts`; current void best-effort flush
  is the 257-certified behavior — untouched.

## Downstream dependencies

None: no later change consumes dispose internals. The 258 track is
unaffected (no worker-policy, sizing, or meshing-path change).
