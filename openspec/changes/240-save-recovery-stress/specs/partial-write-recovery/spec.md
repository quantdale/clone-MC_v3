# Spec: partial-write-recovery

## Contract

The save layer MUST detect and recover from partial and corrupt writes without data loss or store
pollution. A `SaveSink` write that fails MUST leave its unit pending and retryable (never silently
dropped); a record that fails repository validation MUST be rejected on write and on read so a corrupt
record never enters the store or is trusted from it; and a partially-written unit MUST NOT leave the store
in a state that later reads treat as valid.

## Definitions

- **Partial write**: a `SaveUnit` whose `sink.write` rejects partway (e.g. the underlying repository
  throws after opening a transaction), or a payload that is structurally incomplete.
- **Corrupt record**: a persisted value that fails its repository's validator
  (`validateWorldMetadata`, `validateSerializedChunkColumn`, block-entity/entity validators,
  `validatePlayerStateRecord`) or a `WorldArchive` that fails `validateWorldArchive`.
- **Re-queue**: the 038 `DirtySaveQueue.drain` behavior of restoring a failed unit to the pending set for
  a later retry.

## Invariants

- A rejected `sink.write` never loses the unit; it is re-queued at the end of the pending set.
- A write whose payload fails validation rejects and does not persist any partial record.
- A corrupt record read from a store is not treated as valid; the validating read/load path (shared
  `validate*` functions / 234 codec load / 042 archive validation) reports the validation failure rather
  than returning bad data. (The 034-037 raw repository `get*` methods are unvalidated passthroughs by
  design.)
- Retrying a failed unit eventually persists it when the underlying failure clears.

## Requirements

### Requirement: failed writes re-queue and retry
A `SaveSink.write` that rejects MUST leave the unit pending, and a subsequent `drain`/`tick` MUST retry
and persist it once the failure clears.

#### Scenario: transient write failure retried
- **GIVEN** a queue with units `a` (fails once via `createFaultySaveSink(failNextWrites: 1)`) and `b`
- **WHEN** the queue drains once and then again
- **THEN** the first drain writes `b` and re-queues `a`, and the second drain writes `a`; no unit is
  dropped.

### Requirement: invalid payloads are rejected, not persisted
A `SaveUnit` whose `payload` fails the target repository's validator MUST reject on write, and the store
MUST NOT contain any record for that unit after the rejection.

#### Scenario: corrupt payload leaves store clean
- **GIVEN** a chunk-sections unit whose payload has a non-integer `version`
- **WHEN** the sink writes it
- **THEN** the write rejects and `listColumns(worldId)` contains no record for that `(chunkX, chunkZ)`.

### Requirement: corrupt records are never trusted on read
A record already in a store that fails its validator MUST be surfaced as invalid by the validating read/load
path (the shared `validate*` functions used by the 234 `WorldSaveCodec.decode`/`ServerSaveLifecycle.load` and
the 042 `validateWorldArchive`) rather than returned as valid data. The 034-037 raw repository `get*`
methods are unvalidated passthroughs by design; the matrix seeds a corrupt stored record and asserts the
shared validator rejects it, so no trusting consumer accepts it.

#### Scenario: corrupt stored record is rejected on read
- **GIVEN** a metadata store pre-seeded (via the fixture's raw seed) with a record whose `schemaVersion` is
  non-numeric
- **WHEN** the raw repository `get` returns that record and the shared `validateWorldMetadata` validator
  runs on it
- **THEN** `validateWorldMetadata` throws, so the validating read/load path reports a validation failure and
  does not return it as a valid `WorldMetadata`.

### Requirement: full-payload write is atomic per unit
A successful `sink.write` of a multi-field unit MUST persist the complete, valid record; a failure MUST
leave the store without a partial (half-written) record for that unit.

#### Scenario: no half-written column
- **GIVEN** a chunk-column unit whose repository rejects after opening the write
- **WHEN** the write is attempted and then a fresh read occurs
- **THEN** the store contains no column record at that key, and the unit remains pending for retry.

## Error and failure behavior

- Unknown `SaveUnitKind` or a missing repository in `RepositorySaveSink` → write rejects and the unit
  re-queues (038 semantics), never dropped.
- A validator throw inside the sink → write rejects, store untouched, unit re-queued.
- The matrix uses `createFaultySaveSink` (`failNextWrites`, `failAllWrites`, `corruptNextWrites`) to
  inject the partial/corrupt conditions deterministically.

## Performance and resource bounds

Per scenario: a small number of writes and reads over an in-memory store. No hot-path impact.

## Compatibility and migration

No schema/API change; asserts the existing 038 re-queue and repository-validation behavior. Corrupt-record
detection is the load-path guard for migration (see `migration-recovery`).

## Security and integrity

Re-queue-on-failure prevents silent data loss; validation-before-write and read-rejection prevent corrupt
data from entering or being trusted from the store — the core integrity guarantees of this axis.

## Observability

`detail` cites the rejected unit key/kind, whether it re-queued, and the post-write store state (present
valid / absent).

## Verification mapping

| Requirement | Test |
| --- | --- |
| Failed writes re-queue and retry | fail-once unit written on second drain |
| Invalid payloads rejected, not persisted | corrupt column payload → store clean |
| Corrupt records never trusted on read | corrupt stored record rejected on read |
| Full-payload write atomic per unit | rejected column write → no partial record, unit pending |
