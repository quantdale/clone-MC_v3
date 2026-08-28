# Spec: save-queue-saturation

## Contract

Saturation drives the dirty-save queue (038 `DirtySaveQueue`) at worst-case volume and MUST enforce
the per-call write limit (`drain(sink, limit)`), MUST be no-loss (a failed write is re-queued and
retried, never dropped), MUST preserve FIFO order, and MUST hold a measurable throughput budget. The
sink is injected so the harness can simulate slow and failing persistence deterministically.

## Definitions

- **Dirty unit**: a `SaveUnit` (keyed, kinded, world-scoped payload) marked via `markDirty`.
- **Drain**: one `drain(sink, limit)` call that writes at most `limit` pending units in FIFO order.
- **Throughput budget**: `maxUnitsPerSecond` at a given `sinkWriteMillis` (per-unit sink latency).
- **No-loss**: every unit marked dirty is eventually written successfully (accounting for retries),
  or is still pending when the run ends; none is silently dropped.

## Invariants

- `maxPendingUnits`, `maxUnitsPerSecond`, `iterations`, and `sinkWriteMillis` are positive finite
  numbers (validated).
- A single drain MUST NOT write more than `limit` units.
- Re-marking an already-pending key updates its payload but keeps its original FIFO position.
- A unit removed before its write starts is re-queued at the end on failure; no unit is lost.
- Deterministic suites use an injectable clock and a deterministic sink (fixed latency, scripted
  failures).

## Requirements

### Requirement: per-call write limit
`drain(sink, limit)` MUST write at most `limit` units per call, no more.

#### Scenario: limit honored
- **GIVEN** a queue with 1000 pending units and `limit=64`
- **WHEN** one drain runs against a counting sink
- **THEN** exactly 64 writes occur and the queue retains 936 pending units.

#### Scenario: non-positive limit is a no-op
- **GIVEN** `limit=0` or a non-finite `limit` with pending units
- **WHEN** drain runs
- **THEN** zero writes occur and the queue is unchanged.

### Requirement: no-loss under a failing sink
When a sink write rejects, the unit MUST be re-queued for a later drain and MUST eventually be
written successfully when the sink recovers.

#### Scenario: transient failure retried
- **GIVEN** a sink that fails the first 3 writes to a particular unit, then succeeds
- **WHEN** the queue is drained repeatedly until empty
- **THEN** every unit is written exactly once successfully and no unit is lost.

#### Scenario: permanent failure stays pending
- **GIVEN** a sink that always rejects a particular unit
- **WHEN** the queue is drained repeatedly
- **THEN** the failing unit remains pending (never silently dropped) and successful units still
  complete.

### Requirement: FIFO order and re-mark semantics
Drains MUST write units in FIFO (insertion) order, and re-marking an existing key MUST keep its
original position while updating its payload.

#### Scenario: insertion order preserved
- **GIVEN** units marked A, B, C in that order
- **WHEN** the queue is drained
- **THEN** the sink observes A, then B, then C.

#### Scenario: re-mark keeps position
- **GIVEN** units A, B, C where B is re-marked with a new payload before draining
- **WHEN** the queue is drained
- **THEN** the sink observes A, then B (with the new payload), then C.

### Requirement: throughput budget
`runSaveSaturation` MUST mark `iterations` units, drain them in bounded batches through the injected
sink, and evaluate the achieved units-per-second against `maxUnitsPerSecond`.

#### Scenario: throughput within budget
- **GIVEN** a sink of `sinkWriteMillis` and a config whose `maxUnitsPerSecond` is below the achieved
  rate
- **WHEN** `runSaveSaturation` runs
- **THEN** the report's `withinBudget` is true and the throughput entry names an achieved rate at or
  above the budget.

#### Scenario: throughput budget violation
- **GIVEN** a slow sink whose achieved rate falls below `maxUnitsPerSecond`
- **WHEN** `runSaveSaturation` runs
- **THEN** the throughput entry has `withinBudget: false` and the report's `withinBudget` is false.

### Requirement: bounded pending
The queue MUST NOT grow beyond `maxPendingUnits` across marking and draining; over-marking is rejected
or bounded by the harness so pending units cannot grow without bound.

#### Scenario: pending capped
- **GIVEN** `maxPendingUnits=10000` and `20000` distinct marks in a single run
- **WHEN** marking and draining proceed
- **THEN** the observed `size` never exceeds `maxPendingUnits` and every accepted unit is eventually
  drained.

### Requirement: determinism
Identical units, identical sink latency/failure schedules, and identical scripted clocks MUST produce
identical drain counts and write orders.

#### Scenario: scripted sinks agree
- **GIVEN** two queues with identical units, sinks, and scripted clocks
- **WHEN** each drains to empty
- **THEN** the write sequences and per-drain counts are identical.

## Error and failure behavior

- `validateSaveSaturationConfig` throws a descriptive error for non-finite, non-positive, or
  non-numeric fields, and for non-object input.
- A rejecting sink never causes a silent drop; the failing unit is re-queued (no-loss).
- Invalid save units (bad key/kind) are rejected at the queue boundary and MUST NOT be drained as if
  valid.

## Performance and resource bounds

Drains are O(limit) per call and O(pending) to snapshot the batch; re-queue is O(1). Wall-clock
throughput suites use the documented protocol: discard one warmup run, then measure the median of at
least 3 runs via `performance.now()`. Starting budgets are validated constants; actual rates and any
tuning are recorded in `verification.md`.

## Compatibility and migration

Additive and read-only over `DirtySaveQueue`; no change to the queue's public API, unit shape, or
persistence semantics. No migration.

## Security and integrity

No-loss and bounded-pending invariants protect against data loss and unbounded memory growth under
saturation. All config inputs validated.

## Observability

Reports name the throughput dimension with budget vs achieved rate, plus the number of units lost
(which MUST be zero). The sink records the exact write order for FIFO assertions.

## Verification mapping

- `tests/unit/SaveQueueSaturation.test.ts` — per-call limit (incl. no-op limit), no-loss under
  transient/permanent sink failure, FIFO order and re-mark semantics, throughput budget and verdict,
  bounded pending, scripted-sink determinism, config validation.
