# Spec: reset-save-integrity

## Contract

A reset failure MUST NOT silently discard unsaved data. An intentional successful reset MUST NOT be undone by stale queued writes. Clearing a save queue MUST invalidate stale requeue attempts without losing newer marks.

## Definitions

A pending save is a dirty unit and any corresponding in-memory overlay not yet known durable. An old in-flight save is a unit whose sink write began before clear/reset. A later mark is a new dirty generation recorded after that boundary.

## Invariants

No database schema, user save format, unrelated gameplay, dependency or golden changes. Change 258 remains BLOCKED; no hardware GPU evidence is claimed. Existing world isolation and atomic reset failure reporting remain.

## Requirements

### Requirement: R1 failure preserves dirty state

If reset fails during snapshot, deletion or rollback, pending dirty units and their overlays MUST remain available for subsequent flush/retry; pending units MUST NOT be discarded before success. New units received while reset is in progress MUST also remain recoverable after failure.

#### Scenario: dirty chunk edit and delete failure
- **GIVEN** a real persistence facade with an unsaved chunk-edit snapshot
- **WHEN** a reset delete fails
- **THEN** reset reports failure, the pending edit remains retrievable and a subsequent successful flush durably writes it.

#### Scenario: snapshot failure and new mark
- **GIVEN** pending work and a reset blocked at snapshot
- **WHEN** another save is marked and the snapshot fails
- **THEN** both latest dirty snapshots remain recoverable and autosave or explicit flush can retry them.

### Requirement: R2 successful reset fences queued writes

A successful reset MUST wait for or otherwise fence all pre-reset in-flight queued writes before deletion can complete. Pending work invalidated by a successful user-confirmed reset MUST NOT re-create the reset world's records afterwards. Concurrent reset calls MUST NOT run overlapping destructive transactions.

#### Scenario: delayed queued write
- **GIVEN** an in-flight queued write whose completion is controlled by a test
- **WHEN** a reset is requested and the delayed write eventually completes
- **THEN** reset cannot report success until stale queued writes cannot recreate the world
- **AND** the reset world's durable records remain absent after all pre-reset queue operations settle.

#### Scenario: repeated reset
- **GIVEN** a reset in progress or completed
- **WHEN** another reset is requested
- **THEN** no overlapping destructive transaction corrupts the world and the result is deterministic and truthful.

### Requirement: R3 clear cannot resurrect cancelled failures

`DirtySaveQueue.clear()` MUST prevent a pre-clear in-flight failure from requeueing that cleared generation. It MUST NOT delete, overwrite or suppress a newer mark made after clear.

#### Scenario: clear while write fails
- **GIVEN** one in-flight queued write
- **WHEN** the queue is cleared and that write fails
- **THEN** the old unit is not pending afterwards.

#### Scenario: clear then mark newer
- **GIVEN** an old in-flight queued write
- **WHEN** the queue is cleared, the key is re-marked with a new payload, and the old write fails
- **THEN** the new payload remains pending and is written by the next successful drain.

### Requirement: R4 fence direct raw metadata writes and preserve existing behavior

Existing failed-write retry, concurrent drain, world-scoped reset, rollback and recovery tests MUST pass. Direct saves to the same raw metadata record MUST commit in submission order so a delayed older write cannot overwrite a newer save. A reset MUST fence pre-existing direct raw metadata saves before it deletes world records, and MUST defer raw saves arriving during the reset until its outcome is known. On failure the latest deferred save for each raw record MUST be retried using a snapshot captured at the save call; on success those reset-invalidated saves MUST NOT recreate records.

#### Scenario: older raw save completes late
- **GIVEN** a delayed first raw save and a later save to the same metadata record
- **WHEN** both writes settle
- **THEN** the durable record contains the later save, even if the first write was delayed.

#### Scenario: delayed raw metadata save
- **GIVEN** a real raw game-mode save whose write is delayed before it reaches IndexedDB
- **WHEN** reset is requested and the write is released
- **THEN** reset waits for the pre-existing write and the game-mode record remains absent after reset.

#### Scenario: raw save during a failed reset
- **GIVEN** reset is held before its snapshot and a new raw save is requested
- **WHEN** the snapshot fails
- **THEN** the deferred raw save is retried and its latest value is durably observable.

#### Scenario: deferred payload mutated by caller
- **GIVEN** a raw payload deferred during a reset
- **WHEN** the caller mutates the original payload before the reset fails
- **THEN** the retried save contains the snapshot captured at the save call, not the later mutation.

#### Scenario: existing recovery behavior
- **GIVEN** the existing storage and reset suites
- **WHEN** they run after the fix
- **THEN** successful reset, fault rollback, queue retry and other-world isolation continue to pass.

### Requirement: R5 flush waits for pre-existing queue writes

A flush MUST NOT report success or prune a pending overlay while a pre-existing queued sink write is still in flight, even when the pending-map size is temporarily zero. It MUST wait for that write and report failures or preserve retryable pending state truthfully. Outstanding-state checks MUST include in-flight keys as well as pending keys, counting a re-marked in-flight key only once.

#### Scenario: concurrent flush on an in-flight chunk write
- **GIVEN** a first flush blocked in the chunk-edit sink after removing its unit from the pending map
- **WHEN** a second flush is requested
- **THEN** the second flush does not complete before the first write settles, and the in-memory edit overlay remains available until that write commits
- **AND** after release the exact edit is durably observable.

#### Scenario: persistent failure with overlapping flushes
- **GIVEN** two flushes overlap while a queued sink continues to reject the same chunk edit
- **WHEN** both flushes finish
- **THEN** both report pending failure and the overlay and dirty unit remain recoverable.

## Error and failure behavior

Failures return structured errors, do not claim success, and leave unsaved data recoverable. No stale clear-invalidated generation is resurrected.

## Performance and resource bounds

No busy wait; synchronization is bounded by existing write promises and queue batches. No new unbounded generation map is permitted. Existing epoch-map retention measured at 10,000 entries after 10,000 successful distinct saves is separately tracked and not claimed fixed here.

## Compatibility and migration

No save-format or database migration. Intentional successful resets still discard the selected world's data; failed resets do not silently discard pending edits.

## Security and integrity

Never create or restore another world's records during selected-world reset. No false success or stale pre-reset write may corrupt the reset boundary.

## Observability

Failure paths preserve existing recovery UI errors. Deterministic tests inspect pending queue and durable records, including after controlled in-flight writes settle.

## Verification mapping

| Requirement | Evidence |
| --- | --- |
| R1 | Failing-first real `GamePersistence` fault-injection test, snapshot/delete/new-mark and retry/durable proofs |
| R2 | Gated in-flight queue write and concurrent-reset integration tests; world isolation |
| R3 | Failing-first gated queue clear/failure/new-mark tests |
| R4 | Failing-first delayed raw-save resurrection and deferred-on-failure tests; storage unit/integration suite, full mandatory gates and browser persistence/reset tests |
| R5 | Failing-first gated concurrent-flush test of completion timing, overlay retention and durable record |
