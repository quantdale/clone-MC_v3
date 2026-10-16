# Spec: transactional-autosave

## Contract

The game MUST persist dirty world-save units automatically and crash-resistantly by scheduling bounded
drains of a 038 `DirtySaveQueue` on a periodic interval and by flushing on tab close/hide. An
`AutosaveCoordinator` MUST own this policy: `start()` arms a single periodic interval (idempotent),
each interval fire drains at most `limitPerTick` units, `pagehide`/`visibilitychange`(hidden) trigger a
best-effort full `flush()`, `stop()` tears the interval and listeners down cleanly, and `markDirty`
enqueues units (and re-arms the interval if stopped). Timers and the flush event target MUST be
injectable so the coordinator is testable without a browser.

## Definitions

- **DirtySaveQueue / SaveSink / SaveUnit**: as defined by 038.
- **tick**: one scheduled drain of at most `limitPerTick` units.
- **flush**: a best-effort drain-to-empty with a zero-progress guard.
- **flushTarget**: the object on which `pagehide`/`visibilitychange` listeners are registered; `null`
  disables listener registration (manual `flush()` still available).

## Invariants

- `start()` is idempotent; exactly one interval exists while started.
- `stop()` clears the interval and removes the registered listeners.
- A `tick` performs at most `limitPerTick` `write` calls; an empty queue makes `tick` a no-op.
- `flush()` returns the number of units written and cannot loop forever (zero-progress guard).
- `markDirty(unit)` enqueues via `queue.markDirty` and re-arms the interval if stopped.
- Listeners are only registered when `flushTarget` is non-null.

## Requirements

### Requirement: periodic bounded autosave
The coordinator MUST drain the queue periodically, writing at most `limitPerTick` units per interval.

#### Scenario: bounded periodic drain
- **GIVEN** 3 units marked and a coordinator with `limitPerTick = 2`
- **WHEN** one interval elapses
- **THEN** exactly 2 units are written and 1 remains pending; after a second interval, the queue is empty.

### Requirement: idle ticks cost no writes
A `tick` with an empty queue MUST write nothing.

#### Scenario: empty queue tick
- **GIVEN** a coordinator with an empty queue
- **WHEN** `tick()` runs
- **THEN** the sink is not called and `tick()` returns `0`.

### Requirement: failed units retry on later ticks
Units whose write fails MUST remain pending and be retried by subsequent ticks.

#### Scenario: failing unit retried
- **GIVEN** units `a` (succeeds) and `b` (fails)
- **WHEN** a tick runs and then a second tick runs
- **THEN** `a` is written on the first tick, `b` is retried and written on the second.

### Requirement: pagehide / hidden flush
A `pagehide` (or `visibilitychange` to hidden) on the `flushTarget` MUST trigger a best-effort full
flush that drains all writable units.

#### Scenario: flush on pagehide
- **GIVEN** 5 units marked and `limitPerTick = 2`
- **WHEN** the `pagehide` listener fires
- **THEN** all 5 units are written (flush drains to empty in bounded loops).

#### Scenario: flush stops on persistent failure
- **GIVEN** a unit whose write always fails
- **WHEN** `flush()` runs
- **THEN** it terminates (zero-progress guard) without writing the failing unit, and the unit remains
  pending.

### Requirement: lifecycle
`start()`/`stop()` MUST manage the interval and listeners idempotently, and `markDirty` after `stop()`
MUST re-arm the interval.

#### Scenario: start/stop/re-arm
- **GIVEN** a coordinator with a fake timer and fake target
- **WHEN** `start()` is called twice, then `stop()` is called, then `markDirty` is called
- **THEN** only one interval exists, `stop()` clears it and removes listeners, and after `markDirty` an
  interval exists again.

## Error and failure behavior

- `sink.write` rejection → unit re-queued (038 semantics), never dropped; retried next tick.
- Interval callback rejection → swallowed (scheduler survives).
- `flushTarget` null → no listeners registered; manual `flush()` still works.
- `limitPerTick <= 0` → ticks write nothing; flush bails via zero-progress guard.

## Performance and resource bounds

Per-interval work is at most `limitPerTick` async writes. Idle ticks are one `size` check. `flush` is
bounded by a zero-progress guard (three consecutive no-progress drains end it).

## Compatibility and migration

No schema/version change; `WORLD_DB_VERSION` stays `4`. 039 layers above 034-038.

## Security and integrity

Periodic bounded draining reduces crash-window data loss; pagehide flush maximizes persistence on tab
close; re-queue-on-failure prevents silent data loss; the zero-progress guard prevents a hang.

## Observability

`size` exposes pending save work; `tick()`/`flush()` return written counts.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Periodic bounded autosave | fake timers: one interval writes ≤ limit, next interval drains the rest |
| Idle tick writes nothing | empty queue tick returns 0, sink untouched |
| Failed units retry | failing unit retried and written on a later tick |
| pagehide / hidden flush | listener fire drains to empty; zero-progress guard terminates stuck flush |
| Lifecycle | single interval; stop clears interval + listeners; markDirty re-arms |
