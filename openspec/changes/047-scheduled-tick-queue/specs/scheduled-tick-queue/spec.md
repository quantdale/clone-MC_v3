# Spec: scheduled-tick-queue

## Contract

The game MUST be able to schedule per-position block/fluid ticks at exact future game ticks,
deterministically and persistence-ready. A `ScheduledTickQueue` MUST deduplicate by position, MUST
pop due entries in `(due tick, insertion order)` order, MUST support `has`/`cancel`/`clear`/`size`,
and MUST round-trip through a validated, versioned serialized form without partial mutation on
rejection.

## Definitions

- **ScheduledTick**: `{ x, y, z, tickTime }` — one pending per-position tick due at absolute game tick
  `tickTime`.
- **seq**: a monotonic insertion counter used to break due-tick ties deterministically.

## Invariants

- At most one entry per `(x, y, z)`; re-scheduling updates `tickTime` in place.
- `tick(nowTick)` returns exactly the entries with `tickTime <= nowTick`, ordered by `(tickTime, seq)`,
  and removes them.
- `cancel` is idempotent; `has` reflects pending state.
- `serialize` → `deserialize` round-trips exactly; a rejected payload leaves the queue unchanged.
- `schedule`/`scheduleIn` throw on non-integer or non-finite inputs.

## Requirements

### Requirement: schedule and pop due ticks
`tick(nowTick)` MUST return exactly the entries due at `<= nowTick` and remove them from the queue.

#### Scenario: threshold pop
- **GIVEN** entries scheduled at ticks `5`, `10`, `15`
- **WHEN** `tick(10)` runs
- **THEN** the two entries at `5` and `10` are returned, `size` is `1`, and a later `tick(15)` returns
  the last entry.

### Requirement: deterministic ordering
Entries MUST be ordered by `(tickTime, seq)` — ties by insertion order.

#### Scenario: tie-breaking
- **GIVEN** `schedule(A, 10)`, `schedule(B, 5)`, `schedule(C, 10)` in that order
- **WHEN** `tick(10)` runs
- **THEN** the order is `B (5)`, `A (10)`, `C (10)`.

### Requirement: position dedupe
Scheduling an already-pending position MUST update its due tick without adding a second entry.

#### Scenario: re-schedule
- **GIVEN** `schedule(P, 10)`
- **WHEN** `schedule(P, 20)` runs
- **THEN** `size` is `1`, `tick(10)` returns nothing, and `tick(20)` returns `P` once.

### Requirement: scheduleIn
`scheduleIn(x, y, z, delayTicks, currentTick)` MUST schedule at `currentTick + delayTicks`.

#### Scenario: relative scheduling
- **GIVEN** `currentTick = 100`
- **WHEN** `scheduleIn(x, y, z, 3, 100)` runs
- **THEN** `tick(102)` returns nothing and `tick(103)` returns the entry.

### Requirement: cancel and clear
`cancel(x, y, z)` MUST remove a pending entry (idempotent); `clear()` MUST empty the queue.

#### Scenario: removal
- **GIVEN** entries at `P1` and `P2`
- **WHEN** `cancel(P1)` twice and `clear()` run
- **THEN** `has(P1)` is false after cancel, `size` is `0` after clear.

### Requirement: persistence round-trip with validation
`serialize`/`deserialize` MUST round-trip exactly; malformed payloads MUST be rejected without
changing the queue.

#### Scenario: round-trip and rejection
- **GIVEN** a queue with two entries
- **WHEN** `serialize()` then `deserialize(data)` on a fresh queue, and `deserialize({ version: 2 })`
  on the original
- **THEN** the fresh queue equals the original's state, and the original queue is unchanged after the
  rejected deserialize (which throws).

## Error and failure behavior

- `schedule`/`scheduleIn` with non-integer or non-finite coordinates/due ticks throw `RangeError`.
- `deserialize` with a malformed payload throws `Error`; the queue is untouched.

## Performance and resource bounds

Scheduling is O(1); `tick` is O(n log n) in pending entries. No per-frame work beyond the consumer's
tick loop.

## Compatibility and migration

Additive; versioned serialized shape (`version: 1`) for future migrations.

## Security and integrity

Full validation before deserialize prevents corrupt pending-tick state from entering the simulation.

## Observability

`size`/`has` expose pending work; the serialized form is inspectable.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Schedule and pop due ticks | threshold pop removes due entries |
| Deterministic ordering | (tickTime, seq) with tie-break |
| Position dedupe | re-schedule updates time, single entry |
| scheduleIn | due at current + delay |
| Cancel and clear | idempotent cancel; clear empties |
| Persistence round-trip with validation | round-trip equality; malformed rejected, queue unchanged |
