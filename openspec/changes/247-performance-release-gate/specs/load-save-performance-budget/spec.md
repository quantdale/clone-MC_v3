# Spec: load-save-performance-budget

## Contract

The load and save domains of the release gate. A declared tier MUST load the canonical world
snapshot within `maxLoadMs` and flush the canonical dirty set within `maxSaveFlushMs` when driven
by the headless `ServerSaveLifecycle` (234) through a wall-time-instrumented, in-memory
`SaveLoadBoundary`. The measurement MUST record `bundle.load.loadMs` and `bundle.save.saveFlushMs`.
Only a successful load (outcome `'loaded'`) and a successful drain-to-empty `saveAndClose`
(`pendingCount === 0`, state `'closed'`) are valid measurements; any failure is a not-within/error
outcome. Boundary equality counts as within budget; a malformed actual is a violation. This spec
defines the measurement and its per-tier budgets; it introduces no production behavior and does not
modify the 234 lifecycle.

## Definitions

- **Canonical world snapshot (`CANONICAL_WORLD_SNAPSHOT`)**: a `PersistedWorldSnapshot` of 289 chunk
  columns × 24 sections, plus 1 metadata record, 1 player-state record, 289 block-entity chunks,
  and 289 entity chunks, returned by the timing boundary's `readWorld`.
- **Canonical dirty set (`CANONICAL_SAVE_DIRTY`)**: 512 dirty chunk-column units plus 1 metadata and
  1 player-state unit marked dirty on a fresh lifecycle, drained to empty via `flush()` then
  `saveAndClose()` with `limitPerDrain` 64.
- **Load dimension**: `maxLoadMs`. **Save dimension**: `maxSaveFlushMs`.
- **Timing boundary**: a `SaveLoadBoundary` whose `readWorld`/`write`/`writePlayerState` run
  synchronously-resolved in-memory operations and record wall-clock elapsed for the measured phase.

## Invariants

- Load measurement is valid only for outcome `'loaded'`; a `'created'` (empty) result or a thrown
  load is invalid.
- Save measurement is valid only when `flush()` then `saveAndClose()` complete with
  `pendingCount === 0` and state `'closed'`; a failed drain (storage gate down, re-queued unit, or a
  `saveAndClose` throw) is invalid.
- Per-dimension evaluation: `loadMs <= maxLoadMs` and `saveFlushMs <= maxSaveFlushMs`; boundary
  equality is within budget.

## Requirements

### Requirement: REQ-LS1 Per-tier load/save budgets

A declared tier MUST have exactly these load/save budgets (authoritative source:
`DEFAULT_RELEASE_BUDGETS`):

| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| maxLoadMs | 1200 | 600 | 300 | 150 |
| maxSaveFlushMs | 1500 | 750 | 375 | 190 |

#### Scenario: the tier's load/save budgets are the evaluation rows
- **GIVEN** a `Medium` measurement with `loadMs = 600` and `saveFlushMs = 750`.
- **WHEN** the load and save dimensions are evaluated for `Medium`.
- **THEN** both report `withinBudget: true` (boundary equality) and the load/save contribution to
  the overall verdict is within budget.

#### Scenario: a load overrun on a higher tier fails the gate
- **GIVEN** a `High` load measurement with `loadMs = 350` (above `High`'s 300).
- **WHEN** the load dimension is evaluated.
- **THEN** `maxLoadMs` reports `withinBudget: false`, the report names it with budget vs actual, and
  the overall verdict is false.

### Requirement: REQ-LS2 Headless load measurement method

`bundle.load.loadMs` MUST be the real elapsed ms from the first `readWorld` call through the
resolved `LoadResult` of a `ServerSaveLifecycle.load(worldId, restore)` over
`CANONICAL_WORLD_SNAPSHOT` with outcome `'loaded'`. A `'created'` outcome or a thrown load MUST
produce an invalid load measurement.

#### Scenario: canonical snapshot loads within budget
- **GIVEN** a `Low` lifecycle over the timing boundary returning `CANONICAL_WORLD_SNAPSHOT`.
- **WHEN** `load(worldId, restore)` resolves with outcome `'loaded'`.
- **THEN** `bundle.load.loadMs` is a finite non-negative number, `LoadResult.columns === 289`, and
  the load measurement is valid.

#### Scenario: an empty (created) load is invalid
- **GIVEN** a boundary whose `readWorld` returns `null`.
- **WHEN** `load` resolves with outcome `'created'`.
- **THEN** the load measurement MUST be recorded as invalid (the load domain MUST NOT report within
  budget).

#### Scenario: a throwing load is invalid
- **GIVEN** a boundary whose `readWorld` throws (or a codec decode failure rolls the lifecycle back
  to `unloaded`).
- **WHEN** `load` is awaited.
- **THEN** it throws, the lifecycle state is not `'running'`, and the load measurement MUST be
  recorded as invalid.

### Requirement: REQ-LS3 Headless save measurement method

`bundle.save.saveFlushMs` MUST be the real elapsed ms for a fresh lifecycle with `CANONICAL_SAVE_DIRTY`
marked dirty to reach `pendingCount === 0` and state `'closed'` via `flush()` then `saveAndClose()`.
A failure to drain to empty MUST produce an invalid save measurement.

#### Scenario: canonical dirty set flushes within budget
- **GIVEN** a `Low` lifecycle over the timing boundary with `CANONICAL_SAVE_DIRTY` marked dirty.
- **WHEN** `flush()` then `saveAndClose()` resolve.
- **THEN** `bundle.save.saveFlushMs` is a finite non-negative number, `pendingCount === 0`, state is
  `'closed'`, and the save measurement is valid.

#### Scenario: a failed drain is invalid, never a pass
- **GIVEN** a boundary whose `write` rejects (or a storage gate that returns false).
- **WHEN** `flush()` then `saveAndClose()` run.
- **THEN** the failure is recorded as a `SaveFailure`, `saveAndClose` does not reach `'closed'`, and
  the save measurement MUST be recorded as invalid (the save domain MUST NOT report within budget).

### Requirement: REQ-LS4 Load/save budget violation

A load or save measurement that misses its ceiling MUST fail the corresponding domain and the gate.

#### Scenario: save overrun fails the gate
- **GIVEN** a `Low` save measurement with `saveFlushMs = 1600` (above `Low`'s 1500).
- **WHEN** the save dimension is evaluated.
- **THEN** `maxSaveFlushMs` reports `withinBudget: false`, the report names it with budget vs actual,
  and the overall verdict is false.

## Error and failure behavior

Load/save failures surface through the 234 lifecycle semantics (all-or-nothing load with rollback to
`unloaded`, re-queue-on-failure, classified `SaveFailure`, storage-gate fencing) and yield an
invalid measurement, so a failed load/save cannot produce a false pass. A malformed actual in the
bundle is a violation.

## Performance and resource bounds

The canonical fixtures are bounded (~868 load units, 514 dirty save units). The load/save ceilings
measure the lifecycle + codec + restore cost headlessly; real IndexedDB I/O is outside headless
scope (bounded by 239/240). Ceilings are not targets; actuals are recorded in `verification.md` and
may be tightened later, never loosened silently.

## Compatibility and migration

Additive. Measurement consumes the 234 lifecycle and boundary seam unchanged; no existing module or
public symbol changes, no persistence format change, no migration.

## Security and integrity

No real I/O in the headless measurement; all inputs validated. A failed or malformed measurement
cannot report a false pass.

## Observability

The gate report names any failing load/save dimension with budget vs actual; `SaveFailure` entries
and the lifecycle state are exposed by the 234 lifecycle; actuals are recorded in `verification.md`.

## Verification mapping

- `tests/unit/release-load-save-budget.test.ts` — REQ-LS1..REQ-LS4: per-tier rows, boundary within,
  load and save overrun failures, canonical-snapshot load bundle, `'created'`/throwing-load
  invalidity, canonical dirty-set flush, failed-drain invalidity.
