# Spec: composed-game-dispose

## Contract

The composed game (`Game` + `World` + mesh worker pool/client) shuts down
cleanly: `dispose()` at every level is idempotent, terminates/joins
workers, fires no post-dispose state-mutating callbacks, and leaves no
pending Game timers, rAF loops, or global listeners. Generation workers
require no termination because no production path composes a worldgen
runtime (only test harness support does).

## Definitions

- **Composed game**: the `Game` instance owning a `World`, which owns an
  optional `WorkerPool` + `MeshWorkerClient` pair (active only when
  `workerMeshing` is enabled; production default is synchronous).
- **Post-dispose callback**: any result/failure/rejection/timeout callback
  for a job pending when `dispose()` ran.
- **Leaked handle**: a live `Worker`, pending `setTimeout`, active rAF
  loop, or attached window/document/canvas listener owned by the game.

## Invariants

- I-1: after `dispose()` returns, no owned callback fires again for jobs
  pending at dispose time.
- I-2: every `dispose()` is idempotent (second call is a silent no-op).
- I-3: post-dispose submissions never enqueue work on a terminated pool.

## Requirements

### Requirement: IDM-1 — Idempotent dispose at every composed level

`Game.dispose()`, `World.dispose()`, and `MeshWorkerClient.dispose()`
MUST each be safe to call twice: the second call MUST be a silent no-op
that throws nothing and frees nothing twice.

#### Scenario: IDM-1.1 — Double Game dispose

- **GIVEN** a booted game
- **WHEN** `dispose()` is called twice in a row
- **THEN** neither call throws
- **AND** resource-dispose counts do not increase on the second call.

#### Scenario: IDM-1.2 — Double World dispose

- **GIVEN** a constructed world (worker meshing both on and off)
- **WHEN** `dispose()` is called twice in a row
- **THEN** neither call throws
- **AND** worker `terminate()` is invoked exactly once per slot.

#### Scenario: IDM-1.3 — Double mesh-client dispose

- **GIVEN** a `MeshWorkerClient` with pending jobs
- **WHEN** `dispose()` is called twice
- **THEN** neither call throws and no callback fires on either call.

### Requirement: TERM-1 — Workers terminated on dispose

`World.dispose()` MUST terminate every composed mesh worker (via
`WorkerPool.dispose()`, which MUST invoke `terminate()` on each slot and
fail outstanding jobs exactly once) and MUST dispose the mesh client
before dropping it. No production Game/World path composes a worldgen
runtime, so no generation worker termination is required (documented
equivalent shutdown).

#### Scenario: TERM-1.1 — Pool slots terminated

- **GIVEN** a world with worker meshing enabled over fake workers
- **WHEN** `dispose()` runs
- **THEN** every fake worker observes `terminate()`
- **AND** the pool reports `workerCount: 0`.

#### Scenario: TERM-1.2 — Client disposed before dropped

- **GIVEN** a world with pending mesh jobs
- **WHEN** `dispose()` runs
- **THEN** the client's `pendingCount` is 0 afterwards
- **AND** every pending wall-clock timeout is cleared.

### Requirement: NOCB-1 — No post-dispose callbacks mutate state

`MeshWorkerClient.dispose()` MUST abandon pending jobs without invoking
result callbacks; any worker message arriving after dispose MUST resolve
as stale (`handleMessage` returns `null`, pool failure paths are no-ops);
`requestSection` after dispose MUST throw a descriptive Error instead of
enqueueing. World batch completion paths MUST NOT attach geometry after
dispose.

#### Scenario: NOCB-1.1 — Deferred delivery after dispose is swallowed

- **GIVEN** a mesh job submitted to a deferred fake worker
- **WHEN** the world is disposed and the worker delivery is then flushed
- **THEN** no geometry attaches to the world
- **AND** no callback throws.

#### Scenario: NOCB-1.2 — Submit after dispose fails fast

- **GIVEN** a disposed mesh client
- **WHEN** `requestSection` is called
- **THEN** it throws an Error naming the disposed client
- **AND** no job is enqueued on the pool.

#### Scenario: NOCB-1.3 — Message after dispose is stale

- **GIVEN** a disposed mesh client
- **WHEN** `handleMessage` receives a well-formed result for a former job
- **THEN** it returns `null` and invokes nothing.

#### Scenario: NOCB-1.4 — Game UI inert after dispose

- **GIVEN** a disposed game (e2e harness)
- **WHEN** UI open paths are invoked (click handlers / direct calls)
- **THEN** no panel opens and no game state mutates
- **AND** `start()` after dispose does not restart the rAF loop.

### Requirement: NOLK-1 — No pending timers/rAF/listeners after dispose

After `Game.dispose()` returns: the rAF loop MUST be stopped (and MUST
NOT be restartable via `start()`); the toast and resize timers MUST be
cleared; the window `resize`/`pagehide`/`blur`, document
`visibilitychange`, canvas pointer, and `InputManager` listeners MUST be
removed (existing behavior, covered by regression); renderer context
listeners MUST be removed via `resources.dispose()` (existing behavior).
Panels own element-scoped listeners only and are hidden — documented
equivalent shutdown requiring no per-panel dispose.

#### Scenario: NOLK-1.1 — Loop stays stopped

- **GIVEN** a disposed game in the e2e harness
- **WHEN** `start()` is called and several frames elapse
- **THEN** no update/render work runs (no errors, no state change).

#### Scenario: NOLK-1.2 — Double dispose in a real browser is clean

- **GIVEN** a booted game in headless Chromium (software WebGL)
- **WHEN** `dispose()` is evaluated twice
- **THEN** no page error or console error is produced
- **AND** the page remains responsive.

### Requirement: CERT-1 — R-6 closed with evidence

The risk register R-6 row MUST read CLOSED by Change 269 with an evidence
pointer to this change's `verification.md`, and `PARITY_MATRIX.md` MUST
carry a C269 row citing it. If any residual cannot be closed, it MUST be
narrowed explicitly in the R-6 row instead.

#### Scenario: CERT-1.1 — Register and matrix updated

- **GIVEN** the 269 work complete
- **WHEN** the reviewer reads the risk register and parity matrix
- **THEN** R-6 cites Change 269 closure evidence and C269 cites the 269
  verification file.

## Error and failure behavior

- `MeshWorkerClient.requestSection` after dispose throws
  `Error('MeshWorkerClient.requestSection: client is disposed')`.
- `MeshWorkerClient.handleMessage` after dispose returns `null` for any
  input (never throws).
- `MeshWorkerClient.cancel` after dispose returns `false`;
  `cancelByToken` after dispose returns `0`.
- `World.submitWorkerMeshJob` / `ensureWorkerMeshing` after dispose are
  silent no-ops / `false` (World owns its lifecycle; callers must not
  crash).
- `Game.start()` after dispose is a silent no-op.
- No `dispose()` at any level throws.

## Performance and resource bounds

The dispose path is terminal and cold: no frame/tick budget applies.
`MeshWorkerClient.dispose()` is O(pending jobs) map cleanup. This change
introduces zero new timers, listeners, workers, or allocations on any hot
path (guards are single boolean checks).

## Compatibility and migration

No stored-data, wire-protocol, or public-API changes. The only new API is
`MeshWorkerClient.dispose()`; all other edits are early-return guards.
Existing callers (`main.ts`, tests) behave byte-identically until dispose
is invoked.

## Security and integrity

Post-dispose callbacks are a state-integrity hazard (use-after-teardown
writes). NOCB-1 closes it three-deep (batch failed flag → empty client
maps → terminated pool). No new attack surface: no network, storage, or
permission changes.

## Observability

`WorkerPool.stats().workerCount === 0` and mesh-client
`pendingCount === 0` after dispose remain the debugging surface; tests
assert both. No new telemetry added.

## Verification mapping

- IDM-1 → `tests/unit/WorldDispose.test.ts` (double dispose, terminate
  once) + `tests/unit/MeshWorkerClientDispose.test.ts` (double dispose)
  + `tests/e2e/game-dispose.spec.ts` (double dispose clean).
- TERM-1 → `tests/unit/WorldDispose.test.ts` (fake-worker terminate
  observed, `workerCount: 0`, `pendingCount: 0`).
- NOCB-1 → `tests/unit/MeshWorkerClientDispose.test.ts` (no callbacks,
  throw on submit, null on message) +
  `tests/unit/WorldDispose.test.ts` (deferred delivery attaches nothing)
  + `tests/e2e/game-dispose.spec.ts` (UI inert, start inert).
- NOLK-1 → code audit (existing removals) + `start()` guard unit/e2e +
  `tests/e2e/game-dispose.spec.ts` (zero page errors).
- CERT-1 → risk-register + matrix diff inspection.
