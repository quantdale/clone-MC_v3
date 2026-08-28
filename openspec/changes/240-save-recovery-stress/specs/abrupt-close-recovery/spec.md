# Spec: abrupt-close-recovery

## Contract

The save layer MUST survive an abrupt process/tab termination (browser kill, power loss, force close)
without silent data loss or corruption: any save unit acknowledged as written by `DirtySaveQueue.drain`
MUST be durable after a reopen, units still pending at the moment of the kill MAY be lost but MUST NOT be
partially or corruptly persisted, and a normal pagehide/`visibilitychange`(hidden) flush MUST persist the
remainder before unload. The matrix MUST simulate abrupt close (no `flush()` and no pagehide listener) and
a graceful pagehide flush over the 039 `AutosaveCoordinator` and assert reopen consistency.

## Definitions

- **Acknowledged write**: a unit the `AutosaveCoordinator`/`DirtySaveQueue` counted in a `tick`/`drain`
  return value (i.e. `sink.write` resolved).
- **Abrupt close**: termination without `flush()` and without the pagehide/visibilitychange listener
  firing.
- **Graceful close**: termination where the pagehide (or `visibilitychange`→hidden) listener fires and
  `flush()` runs best-effort.
- **Reopen**: constructing fresh repositories over the same in-memory factory and reading the stores.

## Invariants

- No acknowledged unit is missing or corrupt after reopen.
- No pending-at-kill unit appears partially written (a record is either fully present and valid, or
  absent).
- A graceful flush drains all writable units; a unit whose write always fails remains pending and is
  never silently dropped (zero-progress guard terminates the flush).
- The simulation leaves the coordinator stopped and no pending timer/listener handles after each
  scenario.

## Requirements

### Requirement: acknowledged writes survive abrupt close
After an abrupt close, every unit counted in a completed `tick`/`drain` MUST be present and valid in the
reopened stores.

#### Scenario: drain-then-kill persists acknowledged subset
- **GIVEN** 5 units marked, `limitPerTick = 2`, and the coordinator advanced 2 ticks (writing 4 units)
- **WHEN** the coordinator is dropped without `flush()` and repositories are reopened on the same factory
- **THEN** exactly the 4 acknowledged units are present and each passes the repository's validator, and
  the 1 unacknowledged unit is absent (not corrupt).

### Requirement: pending-at-kill units leave no partial record
A unit still pending when the process is killed MUST NOT be persisted partially; a reopen MUST show it
either fully valid or absent.

#### Scenario: no partial record on kill
- **GIVEN** a world-metadata unit marked but not yet drained
- **WHEN** the process is killed abruptly and repositories reopen
- **THEN** either the metadata record is fully valid (passes `validateWorldMetadata`) or no metadata
  record for that `worldId` exists.

### Requirement: graceful pagehide flush persists the remainder
A pagehide/`visibilitychange`(hidden) flush MUST drain all writable pending units before unload.

#### Scenario: pagehide drains all units
- **GIVEN** 5 units marked and `limitPerTick = 2`
- **WHEN** the pagehide listener fires (graceful close)
- **THEN** all 5 units are written and present and valid after reopen.

### Requirement: graceful flush never drops a failing unit
A unit whose write always fails MUST remain pending when the flush terminates (zero-progress guard); the
scenario MUST NOT report it as lost or as written.

#### Scenario: stuck flush leaves failing unit pending
- **GIVEN** one unit whose write always rejects, plus several writable units
- **WHEN** the pagehide flush runs
- **THEN** the writable units are written, the failing unit remains pending (present in the queue), and
  the flush terminates (does not hang).

### Requirement: coordinator lifecycle is clean after simulation
After each abrupt-close/graceful scenario, `coordinator.stop()` MUST clear the interval and listeners, and
re-running the coordinator over the same queue MUST not double-register handles.

#### Scenario: stop is idempotent and re-arm is safe
- **GIVEN** a coordinator that was started, stopped, and restarted via `markDirty`
- **WHEN** the scenario inspects timer/listener registration counts on a fake target
- **THEN** only one interval and one listener registration per event exist, and `stop()` leaves zero.

## Error and failure behavior

- `sink.write` rejection during a graceful flush → unit re-queued (038 semantics) and retried by a later
  tick; the flush's zero-progress guard prevents an infinite loop.
- Abrupt-close simulation MUST NOT call `flush()` or the flush listener; only the interval `tick` may
  have run.

## Performance and resource bounds

Per scenario: at most `limitPerTick` writes per drain and a bounded number of drains; reopen is a handful
of repository reads. Negligible runtime.

## Compatibility and migration

Uses the 039 coordinator and 038 queue as-is; no schema/API change. Reopen reads through the current
`WORLD_DB_VERSION` repositories, so abrupt-close scenarios implicitly run at the current schema.

## Security and integrity

Acknowledged-write durability and no-partial-record semantics are the no-data-loss guarantees this axis
proves; they are the core integrity contract for crash recovery.

## Observability

Each scenario reports the acknowledged vs. persisted counts and the pending-at-kill count in `detail` so
`verification.md` can cite exact numbers.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Acknowledged writes survive abrupt close | drain 4/5, kill, reopen → 4 present & valid, 1 absent |
| Pending-at-kill units leave no partial record | killed unit fully valid or absent |
| Graceful pagehide flush persists the remainder | pagehide drains all 5, valid after reopen |
| Graceful flush never drops a failing unit | failing unit stays pending; flush terminates |
| Coordinator lifecycle is clean after simulation | one interval/listener; stop leaves zero |
