# Proposal: 240-save-recovery-stress

## Problem

The persistent world save stack (034-043) provides the individual recovery primitives — crash-resistant
autosave (`AutosaveCoordinator`, 039), failure classification and user-safe gating (`StorageHealth`, 043),
data/schema migration (`DataMigration`, 041; `WORLD_DB_VERSION` upgrade, 034-040), atomic validated
import/export (`WorldArchiver`, 042), and non-destructive legacy migration (`LegacyLocalStorageMigrator`,
040). Each primitive is unit-tested in isolation. Nothing, however, exercises the *combined* save/recovery
behavior under the real failure conditions a player can hit: an abrupt tab close or browser kill mid-drain,
a partial or corrupt write, an old-version world being reopened, storage quota exhaustion or private mode,
and export→import round-trips. There is no single, deterministic, headless recovery matrix that proves, per
scenario, that the save layer never loses data and always recovers to a consistent world.

## Goals

- Build a headless, deterministic **save-recovery matrix** harness that drives the real persistence layer
  (034-043, and change 234's server save lifecycle by contract) through the five recovery axes named in
  `CHANGE_SEQUENCE.md`: **abrupt close**, **partial write**, **migration**, **quota**, and
  **import/export**.
- Provide injectable fault/condition simulation so each scenario is reproducible and passes/fails
  deterministically without a browser: abrupt-close without `flush()`, failing/partial `SaveSink` writes,
  corrupt/mis-versioned records, quota/private-mode repository behavior, and malformed archives.
- Prove the data-integrity invariants of the existing layer hold under stress: no silent data loss,
  no partial writes on validation failure, no downgrade/unknown-version acceptance, and a user-safe write
  gate when storage is provably broken.
- Emit a machine-readable matrix report (per-scenario PASS/FAIL) that `verification.md` can map to
  evidence, so the change is verifiable and repeatable.

## Non-goals

- Implementing new save primitives beyond what 034-043 provide. This change adds the recovery-matrix
  harness and failure-injection doubles only; it does not rework autosave, health, migration, or
  archive logic unless the matrix proves a contract is already broken (then the defect is tracked and
  fixed in this change only if it blocks the matrix; otherwise deferred to a dedicated change).
- Deterministic input replay or state hashing across a full simulation session — that is change 241
  (`241-deterministic-replay-suite`), which depends on this matrix's harness conventions but is not
  implemented here.
- Full survival progression under save/load — change 242 (`242-survival-progression-e2e`).
- Reworking how the live browser game (`src/engine/Game.ts`, currently using the legacy localStorage
  path) wires to the IndexedDB layer; that wiring is change 234's concern. This change only *stresses*
  the persistence layer contracts those consumers rely on.

## Preconditions

- Change 239 (`239-long-session-memory-stress`) is VERIFIED and advancement to 240 is allowed.
- Changes 034-043 are VERIFIED and present in `src/storage/`.
- Change 234 (`234-server-world-persistence`) is being implemented concurrently; its server save lifecycle
  is not yet present in `src/`. This package references it **by contract** and records a mandatory
  reconciliation step (see `design.md` "Rejected alternatives / Downstream dependencies").
- Baseline gate green at the 239 baseline (unit + 22 e2e).

## Dependencies

- 038 `DirtySaveQueue` / `SaveSink`, 039 `AutosaveCoordinator`, 040 `LegacyLocalStorageMigrator`, 041
  `DataMigrationChain`, 042 `WorldArchiver` / `WorldArchive`, 043 `StorageHealthMonitor` /
  `createWorldStorageProbe`.
- The five repositories (034-040) and `ensureWorldStores` schema-upgrade routine.
- `tests/unit/IdbFactoryMock.ts` (in-memory `IdbFactoryLike`) as the repository substrate.
- Change 234 server save lifecycle by contract (reconciled at implementation).

## Proposed change

- `src/storage/SaveRecoveryMatrix.ts` (NEW): a headless harness exposing
  `runRecoveryMatrix(deps): Promise<RecoveryMatrixReport>`, with per-axis scenario runners
  (`runAbruptClose`, `runPartialWrite`, `runMigration`, `runQuota`, `runImportExport`), a
  `FaultySaveSink`, quota/private-mode repository wrappers, corrupt-record and mis-versioned archive
  injectors, and a deterministic matrix report.
- `tests/unit/SaveRecoveryMatrix.test.ts` (NEW): runs the full matrix and asserts every scenario is
  present, deterministic (two runs agree), and satisfies each recovery contract.
- Optionally `tests/unit/abrupt-close-recovery.test.ts`, `partial-write-recovery.test.ts`,
  `migration-recovery.test.ts`, `quota-recovery.test.ts`, `import-export-recovery.test.ts` for focused
  per-axis coverage (see `tasks.md`).
- No change to `WORLD_DB_VERSION`, stored shapes, or the 034-043 API. The harness consumes existing
  contracts.

## Compatibility and migration

No `WORLD_DB_VERSION` change and no stored-data shape change. The harness is additive: it reads/writes
only through the existing repositories and the in-memory mock factory. Migration scenarios create
databases at older schema versions and reopen them at the current version, verifying the existing
upgrade path rather than altering it.

## Risks

- The matrix could reveal a latent contract violation in 034-043. Mitigation: scenarios assert only the
  contracts 034-043 already promise (no new semantics invented here), and any discovered defect is
  tracked explicitly rather than silently accommodated.
- Quota/private-mode simulation depends on repository behavior that the in-memory mock does not model
  (the mock never throws quota). Mitigation: the harness wraps repositories/sink with fault injectors
  that reject on demand, independent of the mock's native behavior.
- Concurrent change 234 may reshape the server save lifecycle contract. Mitigation: reference it by
  contract, keep the matrix's abrupt-close scenarios on the 039 coordinator, and record a reconciliation
  step so the implementing agent re-validates against 234's final shape.

## Rollback strategy

Revert the change commit. The harness and its tests are additive under `src/storage/` and
`tests/unit/`; reverting leaves 034-043 and the live game untouched.

## Definition of Done

- `runRecoveryMatrix` runs every scenario for all five axes headlessly and returns a deterministic,
  machine-readable report.
- Each axis satisfies its recovery contract (see `specs/`): no silent data loss under abrupt close;
  corrupt/partial records are detected and rejected without partial writes; migration refuses
  gaps/downgrades/unknown versions and preserves prior data on upgrade; quota/private-mode degrade to a
  user-safe gate and recover on success; import/export round-trips are stable and malformed archives are
  rejected atomically.
- Two identical matrix runs produce identical reports (determinism).
- `verification.md` maps every scenario to a PASS/FAIL row.
- Full baseline gate green; 240 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass. Unit count
grows by the 240 suites; E2E stays at its 239 baseline count.
