# Spec: recovery-matrix-harness

## Contract

The save layer MUST have a headless, deterministic recovery matrix that stresses the persistent world
save stack (034-043, and change 234's server save lifecycle by contract) across the five axes of change
240 — abrupt close, partial write, migration, quota, import/export — and reports a machine-readable,
reproducible PASS/FAIL result per scenario. `SaveRecoveryMatrix.runAll()` MUST run every axis scenario
over fresh in-memory repositories, produce a `RecoveryMatrixReport` whose `deterministic` field is always
`true`, and set `allPass` to `true` only when every scenario passes. Failure-injection seams
(`createFaultySaveSink`, `withStorageFailure`, corrupt-record/archive injectors) MUST exist so each
scenario is reproducible without a browser.

## Definitions

- **Recovery axis**: one of `abrupt-close`, `partial-write`, `migration`, `quota`, `import-export`.
- **Recovery matrix**: the ordered set of all scenario runners across the five axes.
- **Scenario**: a single `(id, axis, name)` whose runner asserts one recovery contract and returns a
  `RecoveryResult`.
- **Fixture**: a fresh set of five repositories created by `makeRepositories()` for one scenario, so
  failures never leak across scenarios.
- **Deterministic**: two invocations with identical inputs and no wall-clock/timer dependence produce
  byte-identical reports.

## Invariants

- `runAll()` runs axes in the fixed order: abrupt-close, partial-write, migration, quota, import-export.
- Every scenario uses its own fixture; no shared mutable repository state across scenarios.
- Matrix output is time-stable: the report contains no timestamp or wall-clock value.
- `allPass === true` iff every `RecoveryResult.outcome === 'pass'`.
- A scenario that fails MUST still be reported (with `detail`), never swallowed or skipped silently.

## Requirements

### Requirement: full five-axis coverage
`runAll()` MUST run at least one scenario for each of the five axes and include every result in the
returned report.

#### Scenario: all axes present
- **GIVEN** a `SaveRecoveryMatrix` over in-memory repositories
- **WHEN** `runAll()` resolves
- **THEN** the report contains at least one `RecoveryResult` whose `axis` is each of the five axes, and
  no result carries an axis outside that set.

### Requirement: deterministic reports
Two `runAll()` invocations over identical fixtures MUST produce reports whose results (scenario id,
outcome, detail) are identical, and `report.deterministic` MUST be `true`.

#### Scenario: repeated runs agree
- **GIVEN** a `SaveRecoveryMatrix` with fixed dependencies
- **WHEN** `runAll()` is invoked twice
- **THEN** the two reports have the same length and each `RecoveryResult` (scenarioId, outcome, detail)
  at the same index is equal, and both reports set `deterministic` to `true`.

### Requirement: allPass semantics
`allPass` MUST be `true` exactly when every `RecoveryResult.outcome` is `'pass'`.

#### Scenario: all-pass and failure reports
- **GIVEN** a matrix whose scenarios all pass
- **WHEN** `runAll()` resolves
- **THEN** `allPass` is `true`; after replacing one result's outcome with `'fail'` in an equivalent
  harness, `allPass` is `false`.

### Requirement: failure-injection seams
The harness MUST expose `createFaultySaveSink` (fail/corrupt the next N writes or all writes) and
`withStorageFailure` (make repository writes reject with a classified `quota` / `private-mode` /
`unavailable` failure), and these seams MUST be usable to drive scenario assertions.

#### Scenario: seams drive assertions
- **GIVEN** a `FaultySaveSink` configured with `failAllWrites: true`
- **WHEN** a partial-write scenario drains the queue through it
- **THEN** the scenario observes rejected units still pending and reports a deterministic result.

### Requirement: no-swallow failure reporting
A failing scenario MUST appear in the report with `outcome: 'fail'` and a non-empty `detail`; `runAll()`
MUST NOT throw merely because a scenario's assertion failed.

#### Scenario: failure surfaced not thrown
- **GIVEN** a matrix whose abrupt-close scenario is forced to fail
- **WHEN** `runAll()` runs
- **THEN** it resolves with `allPass: false` and the report includes the failed scenario with a
  non-empty `detail`.

## Error and failure behavior

- A thrown exception inside a scenario runner is converted to a `fail` result with the exception message
  as `detail`; it does not abort `runAll()`.
- `createFaultySaveSink` with `failNextWrites: n` rejects exactly the next `n` writes then passes
  through; with `corruptNextWrites: n` it also returns a unit that is rejected by repository validation
  (to exercise re-queue-and-retry).
- `withStorageFailure` classifies its injected rejection through `classifyStorageError`, so the quota
  axis observes the same kinds 043 produces.

## Performance and resource bounds

Each scenario uses one small in-memory database; the full matrix performs a bounded number of repository
round-trips (O(units + stores) per scenario) and must complete within the normal `npm test` budget.

## Compatibility and migration

Additive under `src/storage/`. No `WORLD_DB_VERSION`, stored-shape, or 034-043 API change. The matrix
reads/writes only through existing repository/sink/probe contracts and the in-memory mock factory.

## Security and integrity

The deterministic matrix is the evidence surface that the save layer never silently loses or corrupts
data across the five recovery axes; `allPass` is the integrity gate for 240.

## Observability

`RecoveryMatrixReport` (scenarioId, axis, outcome, detail, allPass) is the audit surface; `verification.md`
maps every scenario id to a requirement and evidence row.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Full five-axis coverage | matrix report contains all five axes |
| Deterministic reports | two `runAll()` runs byte-equal per result |
| allPass semantics | all-pass → true; a fail → false |
| Failure-injection seams | faulty sink / failure wrapper drive a partial-write and quota scenario |
| No-swallow failure reporting | forced-fail scenario yields `fail` + `detail`, `runAll` resolves |
