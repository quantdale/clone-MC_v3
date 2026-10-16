# Spec: fluid-tick-dispatch

## Contract

`FluidTickDispatcher` MUST schedule fluid ticks with relative delays on a caller-provided 047
`ScheduledTickQueue` (dedicated to fluid ticks), MUST dispatch due ticks to a caller-supplied
handler in the queue's deterministic `(tickTime, insertion)` order, MUST process at most a
validated `maxPerTick` per `tick()` call (deferring excess at their original due tick), and MUST
report processed/deferred/pending counts. It MUST NOT interpret fluid state. Identical scripted
schedules MUST produce identical order and reports.

## Definitions

- **Handler**: `(x, y, z, dueTick) => void` — owns flow semantics (078/079).
- **Deferral**: popping a due entry and re-scheduling it at its original due tick (fresh insertion
  order, deterministic).
- **Budget**: `maxPerTick` — positive integer, validated at construction.

## Invariants

- Dispatch order equals the queue's `(tickTime, seq)` order.
- At most `maxPerTick` handler invocations per `tick()`.
- Deferred entries keep their original due tick.
- `schedule` delegates relative scheduling and position dedupe to 047.
- The dispatcher never reads or writes fluid state.

## Requirements

### Requirement: scheduling
`schedule(x, y, z, delayTicks, currentTick)` MUST schedule the position at
`currentTick + delayTicks` with 047 semantics (dedupe, integer validation).

#### Scenario: relative scheduling and dedupe
- **GIVEN** a position scheduled at delay 5 from tick 0, then again at delay 10 from tick 0
- **WHEN** the queue is inspected
- **THEN** exactly one entry exists, due at tick 10.

### Requirement: deterministic dispatch order
`tick(nowTick)` MUST invoke the handler for each due entry in `(tickTime, insertion)` order.

#### Scenario: mixed due times
- **GIVEN** entries scheduled at due ticks 5, 3, 5 (in that insertion order)
- **WHEN** `tick(5)` runs
- **THEN** the handler sees positions in order 3, first-5, second-5.

### Requirement: bounded dispatch
`tick(nowTick)` MUST invoke at most `maxPerTick` handlers and MUST defer the excess at their
original due ticks.

#### Scenario: budget exceeded
- **GIVEN** `maxPerTick = 2` and three due entries at tick 4
- **WHEN** `tick(4)` runs
- **THEN** the report is `{ processed: 2, deferred: 1, pending: 1 }`, the first two entries ran in
  order, and the third still fires on the next `tick(4)` (or later) call.

#### Scenario: budget within
- **GIVEN** three due entries and `maxPerTick = 5`
- **WHEN** `tick(4)` runs
- **THEN** the report is `{ processed: 3, deferred: 0, pending: 0 }`.

### Requirement: handler contract
The handler MUST receive the position and the entry's due tick; self-rescheduling MUST work.

#### Scenario: handler arguments and re-schedule
- **GIVEN** an entry due at tick 7 at (1, 2, 3)
- **WHEN** `tick(7)` runs and the handler re-schedules the same position 2 ticks later
- **THEN** the handler is called with (1, 2, 3, 7), and the position is pending again due at 9.

### Requirement: queue lifecycle
`pendingCount` and `clear` MUST reflect the underlying queue.

#### Scenario: lifecycle
- **GIVEN** scheduled entries
- **WHEN** `pendingCount` and `clear` run
- **THEN** `pendingCount` equals the queue size, and after `clear` it is 0.

### Requirement: budget validation
Construction MUST reject non-positive or non-integer `maxPerTick`.

#### Scenario: invalid budgets rejected
- **GIVEN** `maxPerTick` of 0, -1, 2.5, or NaN
- **WHEN** construction runs
- **THEN** it throws.

### Requirement: determinism
Identical scripted schedules MUST produce identical dispatch order and reports.

#### Scenario: scripted runs agree
- **GIVEN** two dispatchers with identical schedules and budgets
- **WHEN** both drain their queues with the same tick sequence
- **THEN** their reports and handler call logs are deeply equal.

## Error and failure behavior

- Invalid budget → construction error.
- Invalid positions/ticks → 047 validation errors propagate.
- Handler exceptions propagate (documented; the processed entry is already popped).

## Performance and resource bounds

`tick` is O(due log due) (047 sort) plus O(due); deferral re-inserts O(1). Bounded dispatch caps
per-tick fluid work.

## Compatibility and migration

Additive. The caller MUST provide a queue instance dedicated to fluid ticks (047 entries are
kind-less); documented in the module contract.

## Security and integrity

Not applicable: no I/O; inputs validated by 047 and the constructor.

## Observability

Reports expose processed/deferred/pending; handler call order is deterministic and test-asserted.

## Verification mapping

- `tests/unit/FluidTickDispatcher.test.ts` — scheduling/dedupe, deterministic order, budget
  exceeded/within, handler arguments and self-rescheduling, not-yet-due entries, pendingCount/
  clear, budget validation, scripted determinism.
