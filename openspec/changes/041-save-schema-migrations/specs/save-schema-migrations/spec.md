# Spec: save-schema-migrations

## Contract

The game MUST be able to migrate persisted records forward across data versions in a deterministic,
ordered, gap-checked way. A `DataMigrationChain<T>` MUST apply contiguous `fromVersion → toVersion`
steps in ascending order, MUST reject structurally invalid registrations and unsafe migrations
(downgrade / unknown version), MUST be pure (never mutate its input), and MUST report which steps were
applied. Typed chains MUST exist for the persisted `WorldMetadata` (`schemaVersion`) and
`SerializedChunkColumn` (`version`) record families.

## Definitions

- **DataMigration<T>**: `{ fromVersion, toVersion (= fromVersion + 1), migrate(record): T }`.
- **DataMigrationChain<T>**: an ordered registry of steps from a `baseVersion` upward with
  `register`/`migrate`/`needsMigration`/`currentVersion`.
- **MigrationResult<T>**: `{ record, appliedSteps: number[] }`.

## Invariants

- Steps are registered in strictly ascending, contiguous order from `baseVersion` (1 for both shipped
  chains).
- `toVersion === fromVersion + 1` for every step.
- `migrate` never mutates its input; a step that throws leaves the input untouched.
- `migrate` throws `DOWNGRADE` when the record's version exceeds the chain's `currentVersion`.
- `migrate` throws `UNKNOWN_VERSION` for a record version with no step and not equal to `currentVersion`.

## Requirements

### Requirement: ordered contiguous application
`migrate` MUST apply all steps between the record's version and the chain's `currentVersion`, in
ascending order, and MUST report the applied step versions.

#### Scenario: two-step migration
- **GIVEN** a chain with steps `1→2` (rename a field) and `2→3` (add a field), and a record at version `1`
- **WHEN** `migrate` runs
- **THEN** the result's `record` has the renamed/additive fields, `appliedSteps` is `[2, 3]`, and the
  chain's `currentVersion` is `3`.

### Requirement: identity on current records
A record whose version equals the chain's `currentVersion` MUST pass through unchanged.

#### Scenario: current record
- **GIVEN** a record at version `3` on a chain whose `currentVersion` is `3`
- **WHEN** `migrate` runs
- **THEN** `appliedSteps` is `[]` and the returned record equals the input.

### Requirement: registration validation
`register` MUST reject a step that skips versions (gap), duplicates an existing `fromVersion`, is
non-contiguous, or whose `toVersion` is not `fromVersion + 1`.

#### Scenario: gap rejected
- **GIVEN** a chain with step `1→2`
- **WHEN** a step `3→4` is registered
- **THEN** registration throws a `DataMigrationError` with kind `GAP`.

### Requirement: unsafe migrations rejected
`migrate` MUST throw `DOWNGRADE` when the record is newer than the chain, and `UNKNOWN_VERSION` when
the record's version has no step and is not current.

#### Scenario: downgrade and unknown version
- **GIVEN** a chain at `currentVersion = 3` and records at versions `5` (newer than the chain) and `0`
  (below the base version)
- **WHEN** `migrate` runs on each
- **THEN** the first throws `DOWNGRADE` and the second throws `UNKNOWN_VERSION`.

### Requirement: purity
A throwing step MUST leave the caller's original record object unchanged.

#### Scenario: aborted migration
- **GIVEN** a step `1→2` that throws
- **WHEN** `migrate` runs on a record at version `1`
- **THEN** it throws, and the input record's fields are unchanged.

### Requirement: typed chains for persisted families
`WORLD_METADATA_MIGRATIONS` and `CHUNK_COLUMN_MIGRATIONS` MUST exist (base version 1), with
`migrateWorldMetadata`/`migrateChunkColumn` helpers returning current records unchanged and
`needsMigration` false for them.

#### Scenario: current persisted records
- **GIVEN** a `WorldMetadata` with `schemaVersion = 1` and a `SerializedChunkColumn` with `version = 1`
- **WHEN** the helpers run
- **THEN** both return their inputs unchanged and `needsMigration` is `false`.

## Error and failure behavior

- `DataMigrationError` carries a `kind`: `GAP` | `DUPLICATE` | `DOWNGRADE` | `UNKNOWN_VERSION`.
- A step's `migrate` throwing propagates and aborts the chain (input untouched).

## Performance and resource bounds

Cost is proportional to the number of steps applied (0-2 for shipped chains); pure transformations,
no I/O.

## Compatibility and migration

No `WORLD_DB_VERSION` change. Chains are additive; empty chains are identity. Future shape changes
register steps before records of those versions can be loaded.

## Security and integrity

Gap/duplicate/downgrade rejection prevents corrupted or mis-versioned records from being silently
misread; purity prevents partial in-place mutation.

## Observability

`MigrationResult.appliedSteps` is the per-record migration audit trail.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Ordered contiguous application | two-step chain: appliedSteps [2, 3], fields migrated |
| Identity on current records | appliedSteps [], record equal |
| Registration validation | GAP / DUPLICATE / non-contiguous / toVersion !== fromVersion+1 throw |
| Unsafe migrations rejected | DOWNGRADE and UNKNOWN_VERSION throw |
| Purity | throwing step leaves input unchanged |
| Typed chains | helpers return current records unchanged; needsMigration false |
