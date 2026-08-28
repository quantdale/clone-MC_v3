# Tasks: 240-save-recovery-stress

> All tasks complete. `src/storage/SaveRecoveryMatrix.ts` (harness + seams), the shared in-memory fixture
> (`tests/unit/saveRecoveryFixture.ts`), and the matrix + per-axis unit suites are implemented; the full
> baseline gate passes. Change 234's `ServerSaveLifecycle` was reconciled (task 1.2) — see `design.md` and
> `verification.md`. Publication to `origin/main` is deferred to the orchestrator per this session's
> instructions (task 4.3 push step not performed here).

## 1. Baseline and characterization

- [x] 1.1 Confirm entry gate (239 VERIFIED, advancement allowed, baseline green, 034-043 present) and characterize persistence seams read-only (`IdbFactoryMock` older-`WORLD_DB_VERSION` pre-seeding; `AutosaveCoordinator`/`StorageHealth`/`WorldArchiver` API surfaces match `design.md`); record `session_start_head` and any drift.
- [x] 1.2 Reconcile with change 234: read 234's final server save lifecycle (`src/simulation/ServerSaveLifecycle.ts`, now present and VERIFIED), extend the abrupt-close contract to cover a server-owned save (`abrupt-close.server-save-lifecycle` scenario + a focused `saveAndClose`→reload test), and amend `design.md`/`specs` accordingly.

## 2. Implementation

- [x] 2.1 Add `src/storage/SaveRecoveryMatrix.ts` types and public API (`RecoveryAxis`, `RecoveryResult`, `RecoveryMatrixReport`, `SaveRecoveryFixture`, `SaveRecoveryMatrixDeps`, `SaveRecoveryMatrix` with `runAll`/`runAbruptClose`/`runPartialWrite`/`runMigration`/`runQuota`/`runImportExport`).
- [x] 2.2 Implement failure-injection seams: `createFaultySaveSink` (`failNextWrites`/`failAllWrites`/`corruptNextWrites`/`failKeys`) and `withStorageFailure` (quota/private-mode/unavailable classification) over a real sink/repositories, plus `createGatedSaveSink` (043 write gate at the 039 drain boundary).
- [x] 2.3 Implement the abrupt-close axis (acknowledged-write durability, no-partial-record on kill, pagehide flush, stuck-flush leaves failing unit pending, clean coordinator lifecycle, plus a 234 server-save scenario) and the partial-write axis (re-queue-and-retry, invalid-payload rejection leaves store clean, corrupt-record read rejection, per-unit write atomicity).
- [x] 2.4 Implement the migration axis (schema upgrade v1..4 → v5 preserves data and creates stores; idempotent reopen; GAP/DUPLICATE/DOWNGRADE/UNKNOWN_VERSION refusal; unsupported archive version refused).
- [x] 2.5 Implement the quota axis (injected failures classify; degraded→failed→recovery; write gate; autosave pauses on failed and resumes on recovery; listeners/reset).
- [x] 2.6 Implement the import/export axis (complete+valid export, round-trip stability, atomic rejection of malformed archives, worldId normalization, read-only export).

## 3. Focused unit tests

- [x] 3.1 `tests/unit/SaveRecoveryMatrix.test.ts`: full five-axis coverage, determinism (two runs equal), `allPass` semantics, no-swallow failure reporting, seams drive assertions.
- [x] 3.2 `tests/unit/abrupt-close-recovery.test.ts`: drain-then-kill durability, no-partial-record on kill, pagehide drains all (incl. real dispatch), stuck flush leaves failing unit pending, clean lifecycle, 234 server-save reconciliation.
- [x] 3.3 `tests/unit/partial-write-recovery.test.ts` + `tests/unit/migration-recovery.test.ts`: re-queue/retry, invalid-payload rejection, corrupt-read rejection, atomic per-unit write; schema upgrades v1..4→v5, idempotent reopen, chain kind refusals, unsupported archive version.
- [x] 3.4 `tests/unit/quota-recovery.test.ts` + `tests/unit/import-export-recovery.test.ts`: classification, transitions/recovery, write gate + pause/resume, listeners/reset; export completeness, round-trip stability, atomic rejection, worldId normalization, read-only export.

## 4. Edge/failure, integration, and final gate

- [x] 4.1 Edge/failure coverage: a unit whose write always fails across a flush (zero-progress guard), corrupt record already in the store at read time, quota failure injected mid-drain/import, and an unsupported archive version — each asserts no loss, no partial write, and no silent acceptance.
- [x] 4.2 Run the full matrix twice and record the report as evidence; update `verification.md` mapping every scenario id to a requirement and PASS/FAIL row (all 25 scenarios PASS).
- [x] 4.3 Run the baseline gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`), record evidence, mark tasks done, commit impl+tests+dir, update `PROGRAM_STATE.json`/`PROGRAM_STATE.md`, and advance. Push to `origin/main` is deferred to the orchestrator per session instructions.
