# Spec: audit-data-loss

## Contract

The data-loss audit verifies that committed player progress and world state are not silently
lost: transactional save/recovery guarantees, crash and pagehide flush behavior, quota/private-
mode handling, import/export integrity, migration correctness, and eviction policies. It relies
on the save-recovery stress evidence from change 240 and the transactional-autosave work from 39,
and reconciles the legacy `AUDIT-005` (edit-overlay eviction) consequence and related storage
concerns against the current tree.

## Definitions

- **Committed progress**: any player edit, inventory/container state, player/entity/block-entity
  state, or advancement/stat that the game has accepted and the user would expect to survive a
  close, crash, or reload.
- **Silent loss**: committed progress lost without a user-visible warning or error.
- **Crash window**: the interval between accepting a mutation and durably persisting it.

## Invariants

- Any path that silently loses committed progress is a `blocking` finding, regardless of trigger
  frequency.
- A data-loss claim is `confirmed` only with a headless save/reload or crash-recovery observation
  or a direct code citation; otherwise it is `low`/`blocked`.

## Requirements

### Requirement: REQ-D1 — Transactional save/recovery guarantees
The audit MUST verify the transactional autosave and crash-recovery guarantees (change 240
matrix) still hold: a crash during a save does not corrupt the last good state, and the recovery
path restores the newest valid snapshot.

#### Scenario: partial-write crash recovery
- **GIVEN** the autosave/save-sink path and 240 recovery evidence,
- **WHEN** the audit verifies crash safety,
- **THEN** it MUST confirm a partial write is detected and the previous good state is restored
  (citing 240 evidence or a probe), and that a crash does not present a corrupt world as valid.

#### Scenario: recovery restores newest valid snapshot
- **GIVEN** multiple valid snapshots and a simulated crash,
- **WHEN** recovery runs,
- **THEN** it MUST select the newest valid snapshot (not an older or partially written one);
  selecting an older valid snapshot while a newer one exists is a finding (data-loss of the
  delta), `blocking` if the delta includes committed progress.

### Requirement: REQ-D2 — No silent loss on normal paths
The audit MUST verify that normal teardown paths — `pagehide`/`beforeunload` flush, world close,
dimension/player save — flush committed progress, and that any bounded cache (edit overlay, dirty
queue, block/entity stores) does not evict committed-but-unsaved progress silently.

#### Scenario: pagehide flush
- **GIVEN** the pagehide/beforeunload flush policy (change 39),
- **WHEN** the audit verifies it,
- **THEN** it MUST confirm pending dirty units are flushed or a user-visible warning is shown if
  flush is not possible; silent loss on tab close is `blocking`.

#### Scenario: eviction of committed-but-unsaved progress
- **GIVEN** an eviction path that drops a dirty unit before it is persisted,
- **WHEN** the audit inspects it,
- **THEN** it MUST confirm eviction never silently discards unsaved committed progress; if it does,
  the finding is `blocking` and MUST reference `AUDIT-005`'s current status.

### Requirement: REQ-D3 — Quota and private-mode failure handling
The audit MUST verify that storage failures — quota exhaustion, private/incognito mode, blocked
persistence — are detected and surfaced, using change 43/240 evidence.

#### Scenario: quota exhaustion
- **GIVEN** a full/blocked storage backend (change 43/240 scenarios),
- **WHEN** the audit verifies handling,
- **THEN** it MUST confirm the failure is detected and the user is informed (or progress is
  preserved in-memory with a warning), rather than silently dropping saves; silent drop is
  `blocking`.

#### Scenario: private-mode detection boundary
- **GIVEN** a browser where persistence is unavailable but quota reads succeed,
- **WHEN** the audit inspects the seam,
- **THEN** it MUST confirm the audit records whether the detection seam distinguishes this case
  and classifies the consequence; an undetected persistence failure that silently loses saves is
  `blocking`.

### Requirement: REQ-D4 — Import/export and migration integrity
The audit MUST verify that world export/import and save-schema migrations preserve data: a
round-trip export→import restores the world, and a migration does not drop or corrupt records.

#### Scenario: export/import round-trip
- **GIVEN** the archive export/import path (change 42),
- **WHEN** the audit verifies integrity,
- **THEN** it MUST confirm export→import restores the same world state (citing 42/240 evidence or a
  probe); data dropped in the round-trip is `blocking`.

#### Scenario: migration preserves records
- **GIVEN** an ordered schema migration path (change 41),
- **WHEN** the audit verifies a migration,
- **THEN** it MUST confirm the migration runs exactly once and preserves all records it is not
  explicitly deleting; a migration that silently drops records is `blocking`.

#### Scenario: boundary — migration of an already-migrated world
- **GIVEN** a world already at the latest schema version,
- **WHEN** load runs,
- **THEN** it MUST NOT re-apply or corrupt via re-running migrations, and MUST be confirmed by the
  audit as idempotent; re-application that alters data is `blocking`.

## Error and failure behavior

- Any save/recovery error that is swallowed (no log, no user signal) is a finding and `blocking`
  if it implies silent loss.
- A recovery path that itself corrupts the archive is `blocking`.

## Performance and resource bounds

Data-loss review is static plus headless save/reload probes; probes are bounded and do not
persist to a real user profile.

## Compatibility and migration

The audit verifies migration integrity but introduces no migration.

## Security and integrity

Imported data integrity is cross-referenced from `security` (REQ-S3); data-loss is about
preserving genuine progress, not validating hostile input.

## Observability

Data-loss findings are traceable by ID; each cites the save/reload/migration path and its
evidence.

## Verification mapping

- REQ-D1 → crash-recovery evidence (240) recorded.
- REQ-D2 → pagehide/eviction flush evidence; `AUDIT-005` reconciled.
- REQ-D3 → quota/private-mode evidence (43/240) recorded.
- REQ-D4 → export/import round-trip and migration-idempotence evidence recorded.
