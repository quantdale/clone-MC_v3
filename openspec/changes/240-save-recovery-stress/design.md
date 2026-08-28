# Design: 240-save-recovery-stress

## Context / current state

The persistent world save stack under `src/storage/` (034-043) is implemented and unit-verified:

- **Repositories (034-037, 040)**: `WorldMetadataRepository`, `ChunkSectionRepository`,
  `BlockEntityRepository`, `EntityRepository`, `PlayerStateRepository`. All share the `voxel-world-db`
  IndexedDB database at `WORLD_DB_VERSION = 5`, with stores `world-metadata` (v1), `chunk-sections` (v2),
  `block-entities` (v3), `entities` (v4), `player-state` (v5). `ensureWorldStores` creates any missing
  store idempotently on open, so a database opened at an older version is migrated forward in place.
  Repositories validate records on write (`validateWorldMetadata`, `validateSerializedChunkColumn`,
  `validatePlayerStateRecord`, block-entity/entity validators) and throw on invalid input.
- **038** `DirtySaveQueue` (bounded, ordered, de-duplicated) + `RepositorySaveSink` (routes `SaveUnit` by
  `kind`; an unknown kind or missing repository rejects so the queue re-queues rather than drops).
- **039** `AutosaveCoordinator` (injectable `TimerLike`/`EventTargetLike`; periodic bounded `tick`, idle
  no-op, pagehide/`visibilitychange`(hidden) `flush()` with a zero-progress guard, wake-on-dirty re-arm).
- **041** `DataMigrationChain<T>` (contiguous `fromVersion → toVersion` steps; rejects GAP / DUPLICATE /
  DOWNGRADE / UNKNOWN_VERSION; pure `migrate`). Current `WORLD_METADATA_MIGRATIONS` and
  `CHUNK_COLUMN_MIGRATIONS` chains are identity (base version 1).
- **042** `WorldArchiver` (export is read-only; import validates the whole archive via
  `validateWorldArchive` before the first write and normalizes `playerState.worldId` to the archive
  `worldId`) + `WorldArchive` format `voxel-world`, version 1.
- **043** `StorageHealthMonitor` (`ok → degraded → failed` from consecutive probe outcomes; `canWrite()`
  false only when `failed`; listeners fire on change; `reset()`) + `classifyStorageError`
  (`quota`/`private-mode`/`unavailable`/`unknown`) + `createWorldStorageProbe` (reserved `__probe__`
  round-trip, cleaned up in `finally`).
- **040** `LegacyLocalStorageMigrator` (non-destructive localStorage → world-db import; per-artifact
  errors collected, never throws out of `migrate`).

The **live game** (`src/engine/Game.ts`) still uses the legacy localStorage path (`saveEdits` /
`savePlayerState`, `onPageHide` → `saveEdits`) and does **not** yet drive `AutosaveCoordinator` /
`StorageHealth` / `WorldArchiver`; wiring is change 234's concern. The recovery-matrix harness therefore
stresses the persistence layer contracts directly, over the in-memory `IdbFactoryMock`
(`tests/unit/IdbFactoryMock.ts`), not through `Game`.

**Change 234** (`234-server-world-persistence`) has since landed and `src/simulation/ServerSaveLifecycle.ts`
exists and is VERIFIED. It is a `WorldTickProcess` `TickSystem` state machine (`unloaded -> loading ->
running -> flushing -> closed`) that owns a server world's persistence: `load` reads through an injected
`SaveLoadBoundary` and decodes/validates via a shared `WorldSaveCodec` (all-or-nothing rollback);
`markDirty`/`tick` drain a bounded batch on a tick cadence; `flush`/`saveAndClose` drain to empty with a
zero-progress guard; writes are fenced by an injected `storageGate.canWrite()` (false -> no writes, units
pending) and failures are recorded as classified `SaveFailure` entries. This package treats that lifecycle
**by contract**: the abrupt-close axis is extended with a server-save scenario that drives
`ServerSaveLifecycle` over the same in-memory repositories (via a `SaveLoadBoundary` double), proving that a
server-owned save also survives abrupt termination (acknowledged writes durable; pending-at-kill units
absent, never corrupt) and that its `storageGate` fenced drain never writes while gated.

## Target state

A headless, deterministic **save-recovery matrix** harness that stresses the 034-043 layer (and 234 by
contract) across the five axes of `CHANGE_SEQUENCE.md` 240 and returns a machine-readable, reproducible
report:

- **Abrupt close**: simulate a process/tab kill *without* calling `flush()` and *without* the pagehide
  listener firing, then reopen and verify autosave drained up to the crash point; verify a pagehide flush
  persists the remainder and that a partial flush (zero-progress guard) never drops units.
- **Partial write**: inject failing/corrupting `SaveSink` writes; verify failed units stay queued and are
  retried (no silent loss) and that a corrupt record is rejected on write/read so it never enters or is
  trusted from the store.
- **Migration**: build a database at each older `WORLD_DB_VERSION` (1..4), reopen at 5, verify missing
  stores are created and prior data survives; verify the data-version migration chains reject GAP /
  DOWNGRADE / UNKNOWN_VERSION and that mis-versioned records are refused rather than misread.
- **Quota**: wrap repositories/probe with quota/private-mode fault injectors; verify
  `ok → degraded → failed`, `canWrite()` gating, autosave pause on `failed`, and recovery to `ok`.
- **Import/export**: export→import→export stability; malformed/tampered archives rejected atomically
  (no partial writes across all five stores); `worldId` normalization.

The harness must be deterministic (two identical runs produce identical reports), headless (no browser,
uses `IdbFactoryMock` + fake timers), and additive (no change to 034-043 behavior, schema, or stored
shape).

## Invariants

- **No silent data loss**: a unit that fails to write stays pending and is retried; a scenario that
  simulates a crash may lose only units never acknowledged as written.
- **No partial validation writes**: a malformed record/archive is rejected before any store mutation.
- **Version safety**: migration never accepts a downgrade, a gap, or an unknown version; reopening an
  older-schema database always produces the current schema with prior data intact.
- **User-safe write gate**: `canWrite()` is false exactly when storage status is `failed`; a failed
  status pauses autosave writes.
- **Determinism**: the same scenario inputs yield the same matrix report across runs.
- The harness leaves no residue: `__probe__` records and scenario worlds are cleaned up; no real browser
  storage is touched.

## API and data model

The following sketches describe intent; normative contracts are in `specs/`. Two refinements were made
during implementation reconciliation (see "Rejected alternatives / Downstream dependencies"): the fixture
abstraction replaces a bare `() => WorldArchiverDeps` (so scenarios can reopen repositories over the *same*
in-memory database and seed older-schema databases / raw corrupt records), and the quota axis wires a
`createGatedSaveSink` (043 `canWrite()` gate at the 039 drain boundary) because 039's `AutosaveCoordinator`
does not itself consult a storage gate.

```ts
// src/storage/SaveRecoveryMatrix.ts (NEW)
import type { DirtySaveQueue, SaveSink, SaveUnit } from './DirtySaveQueue';
import type { StorageProbe } from './StorageHealth';
import type { WorldArchiverDeps } from './WorldArchiver';
import type { AutosaveCoordinator } from './AutosaveCoordinator';

export type RecoveryAxis = 'abrupt-close' | 'partial-write' | 'migration' | 'quota' | 'import-export';

export interface RecoveryResult {
  scenarioId: string;
  axis: RecoveryAxis;
  outcome: 'pass' | 'fail';
  detail: string;      // deterministic, time-stable human-readable evidence
}

export interface RecoveryMatrixReport {
  results: RecoveryResult[];
  allPass: boolean;
  deterministic: true; // guaranteed by the harness contract
}

// Fault-injectable save sink (wraps a real SaveSink).
export interface FaultySaveSinkOptions {
  sink: SaveSink;
  failNextWrites?: number;    // reject the next N writes, then pass through
  failAllWrites?: boolean;    // reject every write
  corruptNextWrites?: number; // reject the next N writes (re-queue), then pass through
  failKeys?: string[];        // keys whose writes ALWAYS reject
}
export function createFaultySaveSink(opts: FaultySaveSinkOptions): FaultySaveSink;

// Quota/private-mode/unavailable repository wrapper: put* methods reject with a classified error.
export function withStorageFailure(
  deps: WorldArchiverDeps,
  failure: 'quota' | 'private-mode' | 'unavailable',
): WorldArchiverDeps;

// 043 write gate at the 039 drain boundary (a drain while canWrite() is false rejects -> re-queue,
// so no repository write occurs and no unit is dropped).
export function createGatedSaveSink(inner: SaveSink, gate: { canWrite(): boolean }): SaveSink;

// Fixture abstraction supplied by the caller (backed by tests/unit/IdbFactoryMock.ts): a set of five
// repositories plus the operations the matrix needs (reopen over the same DB, seed an older schema,
// seed a raw corrupt metadata record).
export interface SaveRecoveryFixture {
  deps: WorldArchiverDeps;
  openAll(): Promise<void>;
  reopen(): SaveRecoveryFixture;                                  // fresh repos, same underlying DB
  upgradeFromSchema(olderVersion: number, worldId: string): Promise<SaveRecoveryFixture>;
  putRawMetadata(record: unknown): Promise<void>;                 // unvalidated seed (corrupt-record tests)
}

export interface SaveRecoveryMatrixDeps {
  makeRepositories: () => SaveRecoveryFixture;                    // fresh in-memory fixture per scenario
  makeCoordinator: (queue: DirtySaveQueue, sink: SaveSink) => AutosaveCoordinator; // MUST use limitPerTick = 2
}

export class SaveRecoveryMatrix {
  constructor(deps: SaveRecoveryMatrixDeps);
  async runAll(): Promise<RecoveryMatrixReport>;
  async runAbruptClose(): Promise<RecoveryResult[]>;
  async runPartialWrite(): Promise<RecoveryResult[]>;
  async runMigration(): Promise<RecoveryResult[]>;
  async runQuota(): Promise<RecoveryResult[]>;
  async runImportExport(): Promise<RecoveryResult[]>;
}
```

Focused per-axis helpers (e.g. `abruptCloseAfterUnits`, `reopenAtSchemaVersion(n)`, `boundaryOver`,
`createIdentityCodec`) are internal; only the matrix API and the seams above are public.

## Control / data flow

1. `runAll()` runs the five axis runners in a fixed order (`abrupt-close`, `partial-write`, `migration`,
   `quota`, `import-export`), each with a fresh `makeRepositories()` fixture, and collects results.
2. **Abrupt close**: mark N units through a coordinator, call `coordinator.tick()` for two bounded drains
   (`limitPerTick = 2`), then *drop* the coordinator without `flush()` (simulating a kill); `fixture.reopen()`
   fresh repositories on the same in-memory factory and assert the drained subset is present and the rest is
   simply absent (not corrupt). A second scenario calls `coordinator.flush()` (the pagehide flush path) and
   asserts a full drain; a stuck-flush scenario proves the zero-progress guard; a lifecycle scenario asserts
   idempotent start/stop and re-arm on a counting timer/target; a server-save scenario drives
   `ServerSaveLifecycle` over a `SaveLoadBoundary` double to prove the server-owned save also survives abrupt
   termination.
3. **Partial write**: wrap the sink with `createFaultySaveSink`; drain, assert failed units re-queue and
   retry on the next drain; write a corrupt record payload and assert the repository rejects it and the
   store holds no partial record; seed a corrupt stored metadata record via `fixture.putRawMetadata` and
   assert the shared validator rejects it (the trusting read/load path).
4. **Migration**: `fixture.upgradeFromSchema(v, worldId)` seeds a database at each older `WORLD_DB_VERSION`
   (`1..4`) and reopens at `WORLD_DB_VERSION = 5`, asserting all stores exist and prior records survive; an
   idempotent scenario reopens a v5 database with no data loss; pure `DataMigrationChain` scenarios assert
   GAP/DUPLICATE/DOWNGRADE/UNKNOWN_VERSION refusals; `validateWorldArchive` refuses an unsupported version.
5. **Quota**: `withStorageFailure(deps, kind)` makes `put*` reject with a classified error (asserted through
   `classifyStorageError`); a scripted probe drives `ok → degraded → failed → ok`; `createGatedSaveSink`
   fences the 039 drain: while `canWrite()` is false a drain performs no repository writes and units stay
   pending, and recovers on a successful probe; listener change-notification and `reset()` are asserted.
6. **Import/export**: export a populated world, import into a fresh fixture, re-export, assert stability
   (modulo `exportedAt`/`updatedAt`); import malformed/tampered archives and assert atomic rejection;
   assert `worldId` normalization and read-only export.
7. `runAll()` returns the report; `allPass` is true iff every scenario passes.

## Detailed behavior

- Each scenario creates its own repositories via `makeRepositories()` so failures never leak across
  scenarios; scenario worlds use distinct `worldId`s.
- Abrupt-close "loss" is strictly bounded: a scenario asserts that exactly the units acknowledged by
  `drain` (returned written count) are durable, and no *corrupt* or *partial* unit exists after reopen.
- The harness asserts against the **existing** 034-043 contracts; it must not invent new persistence
  semantics. If a scenario fails because a 034-043 contract is unmet, the result is `fail` with a precise
  `detail`, and the defect is tracked (fixed here only if it blocks the matrix; otherwise filed for a
  dedicated change).
- Timers/event targets are fake (`vi.useFakeTimers()` + fake `EventTargetLike`), matching the 039 test
  seam, so no real wall-clock time enters matrix output (keeps it deterministic and time-stable).
- **Read-path reconciliation**: the 034-037 raw repository `get*` methods are deliberately unvalidated
  passthroughs (they return whatever the store holds). Validation-on-read is enforced by the shared
  `validate*` functions, which the trusting read/load paths call: the 234 `WorldSaveCodec.decode`/`load`
  and the 042 `validateWorldArchive`. The partial-write corrupt-read scenario therefore seeds a corrupt
  stored record via `fixture.putRawMetadata` and asserts the shared validator rejects it (so no trusting
  consumer accepts it), rather than asserting the raw repository `get` throws.

## Failure modes

- A repository/sink that rejects → unit stays pending (038 re-queue) → scenario asserts retry, never a
  drop.
- Quota/private-mode rejection → `classifyStorageError` maps it; monitor degrades; `canWrite()` gates.
- Corrupt/mis-versioned record or archive → validation throws → atomic rejection (nothing written).
- A matrix bug (e.g. fixture leak) → scenario fails with `detail`; `runAll` still returns, reporting
  `allPass: false`, so the failure is visible in `verification.md` rather than swallowed.

## Compatibility / migration

No `WORLD_DB_VERSION` change; no stored-shape change; no 034-043 API change. Migration scenarios exercise
the existing forward upgrade (v1..4 → v5) and the data-version chains. Additive files only.

## Performance / resource constraints

The matrix runs headlessly in a unit suite; it creates one in-memory database per scenario and cleans up.
Total runtime must stay well within the normal `npm test` budget (each scenario is a small number of
repository round-trips over an in-memory `Map`). No hot-path or frame-budget impact.

## Testing seams

- `tests/unit/IdbFactoryMock.ts` provides `MockDatabase`/`MockStore`/`createIdbFactoryMock`, whose
  `databases` map can be pre-seeded to an older `WORLD_DB_VERSION` for migration scenarios.
- `createFaultySaveSink`, `withStorageFailure`, and corrupt/archive injectors are the failure seams.
- `vi.useFakeTimers()` for `AutosaveCoordinator` intervals; fake `EventTargetLike` for pagehide.
- Assertions target the matrix report plus, for focused per-axis tests, direct repository/store state.

## Observability / debugging

`RecoveryMatrixReport` is the audit surface: every scenario has a stable `id`, `axis`, PASS/FAIL, and a
`detail` string. `verification.md` maps each `id` to a requirement and a command/evidence row.

## Affected files / symbols

- `src/storage/SaveRecoveryMatrix.ts` — NEW harness (`RecoveryAxis`, `RecoveryResult`, `RecoveryMatrixReport`,
  `FaultySaveSinkOptions`, `SaveRecoveryFixture`, `SaveRecoveryMatrixDeps`, `createFaultySaveSink`,
  `withStorageFailure`, `createGatedSaveSink`, `SaveRecoveryMatrix`).
- `tests/unit/SaveRecoveryMatrix.test.ts` — NEW full-matrix + determinism + allPass + seams + no-swallow test.
- `tests/unit/abrupt-close-recovery.test.ts`, `tests/unit/partial-write-recovery.test.ts`,
  `tests/unit/migration-recovery.test.ts`, `tests/unit/quota-recovery.test.ts`,
  `tests/unit/import-export-recovery.test.ts` — NEW focused per-axis suites (see `tasks.md`).
- No changes to existing `src/storage/*.ts` modules, `Game.ts`, or any 034-043 file.

## Rejected alternatives

- *Browser-based E2E save/reload tests*: flaky, non-deterministic, and depend on `Game` wiring that 234
  owns. The matrix is headless and deterministic by construction.
- *Reimplementing failure injection inside `IdbFactoryMock`*: the mock should stay a faithful minimal
  IndexedDB double; quota/corruption are *persistence-layer* concerns best injected at the sink/repository
  boundary, which `createFaultySaveSink`/`withStorageFailure` do.
- *Asserting via the live `Game`*: `Game` still uses localStorage and does not expose the world-db layer;
  bypassing it keeps the matrix independent of 234's wiring (reconciled: the matrix covers 234's
  `ServerSaveLifecycle` directly through its `SaveLoadBoundary` seam instead).

## Downstream dependencies

- Change 241 (`241-deterministic-replay-suite`) reuses this matrix's harness conventions and its
  determinism guarantee as a foundation.
- Change 234's `ServerSaveLifecycle` was reconciled in this change: its abrupt-close recovery (acknowledged
  writes durable, pending-at-kill absent) and its `storageGate`-fenced drain are covered by the
  `abrupt-close.server-save-lifecycle` scenario (mandatory reconciliation step satisfied).
- Future recovery changes build on the matrix report as their evidence format.
