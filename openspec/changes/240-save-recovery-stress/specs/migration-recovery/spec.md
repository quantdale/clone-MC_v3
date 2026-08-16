# Spec: migration-recovery

## Contract

The save layer MUST recover worlds created by older schema/data versions without data loss and MUST refuse
unsafe migrations. Reopening a database at an older `WORLD_DB_VERSION` (1..4) at the current version (5)
MUST create every missing object store and preserve all prior records. The `DataMigrationChain` data-version
migrations MUST reject gaps, duplicates, downgrades, and unknown versions (never misreading a
mis-versioned record), and an archive/world at an unsupported version MUST be refused.

## Definitions

- **Schema version**: the IndexedDB `WORLD_DB_VERSION` (currently `5`), upgraded by
  `ensureWorldStores` on open.
- **Store ladder**: the object stores added at each schema version — `world-metadata` (v1),
  `chunk-sections` (v2), `block-entities` (v3), `entities` (v4), `player-state` (v5).
- **Data version**: a record's `schemaVersion`/`version` field migrated by `DataMigrationChain`.
- **Unsafe migration**: a GAP (non-contiguous step), a DUPLICATE step, a DOWNGRADE (record newer than the
  chain), or an UNKNOWN_VERSION (below base or with no step).

## Invariants

- Opening an older-schema database at version 5 creates all five stores and preserves prior stored data.
- `DataMigrationChain.register` rejects GAP/DUPLICATE/non-contiguous steps.
- `DataMigrationChain.migrate` rejects DOWNGRADE and UNKNOWN_VERSION and never mutates its input.
- An archive at an unsupported `version` is refused by `validateWorldArchive`.
- Migration is idempotent: reopening an already-migrated database adds no stores and loses no data.

## Requirements

### Requirement: schema upgrade creates all stores and preserves data
Reopening a database first created at `WORLD_DB_VERSION = n` (1..4) at the current version MUST create
every store in the ladder above `n` and MUST preserve all records written before the upgrade.

#### Scenario: v1 world upgraded to v5
- **GIVEN** an in-memory factory with a `world-metadata` store (v1) containing one metadata record
- **WHEN** the repositories open at `WORLD_DB_VERSION = 5`
- **THEN** all five stores exist, and the pre-upgrade metadata record is still readable and valid.

#### Scenario: every older version upgrades
- **GIVEN** databases seeded at each of `WORLD_DB_VERSION = 1, 2, 3, 4`
- **WHEN** each is reopened at version 5
- **THEN** each reopen succeeds, all stores exist, and any prior records survive.

### Requirement: migration is idempotent
Reopening a database that is already at the current schema MUST NOT add stores or alter data.

#### Scenario: reopen at current version is a no-op
- **GIVEN** a database already at version 5 with records in all five stores
- **WHEN** it is opened again at version 5
- **THEN** the store count is unchanged and all records are still present and valid.

### Requirement: unsafe migration chains are refused at registration
`DataMigrationChain.register` MUST reject a step that is a duplicate from-version, is non-contiguous, or
skips a required intermediate version, with the matching `DataMigrationError.kind`.

#### Scenario: gap and duplicate rejected
- **GIVEN** a chain at base version 1
- **WHEN** a `1→3` step, a `3→4` step, and a duplicate `1→2` step are registered
- **THEN** each register call throws `DataMigrationError` with kind `GAP` (first two) or `DUPLICATE`
  (third), and no invalid step is recorded.

### Requirement: unsafe migrations are refused at migrate time
`DataMigrationChain.migrate` MUST throw `DataMigrationError` with kind `DOWNGRADE` for a record newer than
the chain's `currentVersion` and `UNKNOWN_VERSION` for a record below `baseVersion` or with no registered
step, and MUST NOT mutate its input in any case.

#### Scenario: downgrade and unknown rejected, input untouched
- **GIVEN** a chain with current version 2 and a base version 1
- **WHEN** `migrate` is called with a version-3 record, a version-0 record, and then a valid version-1
  record
- **THEN** the version-3 and version-0 calls throw `DOWNGRADE` and `UNKNOWN_VERSION` respectively, the
  version-1 record migrates to version 2, and the input records are unchanged by all three calls.

### Requirement: unsupported archive versions are refused
`validateWorldArchive` MUST reject an archive whose `version` is not the current `WORLD_ARCHIVE_VERSION`
(1), before any import writes occur.

#### Scenario: future archive version rejected
- **GIVEN** a `WorldArchive` with `version: 2`
- **WHEN** it is validated and then imported
- **THEN** `validateWorldArchive` throws and no store is written for that import.

## Error and failure behavior

- `DataMigrationError` kinds surface exactly the unsafe condition (GAP / DUPLICATE / DOWNGRADE /
  UNKNOWN_VERSION); the matrix asserts the specific kind.
- An archive rejected at validation never reaches `WorldArchiver.importWorld`'s write loop.

## Performance and resource bounds

Upgrade cost is bounded by `ensureWorldStores` (store creation is O(number of missing stores)); data
migration is per-record and linear in the number of applied steps. No hot-path impact.

## Compatibility and migration

This axis *is* the migration contract: it validates the existing forward schema upgrade (v1..4 → v5) and
the data-version chain semantics without changing `WORLD_DB_VERSION`, `WORLD_ARCHIVE_VERSION`, or stored
shapes.

## Security and integrity

Refusing unsafe migrations and mis-versioned records prevents silent misreading and downgrade corruption;
preserving prior data on upgrade prevents upgrade data loss — the integrity guarantees of this axis.

## Observability

`detail` cites the schema version upgraded from, the stores created, the data-version input/current
versions, and the exact `DataMigrationError.kind` for refusal scenarios.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Schema upgrade creates all stores and preserves data | v1 world upgraded to v5; v1..4 each upgrade |
| Migration is idempotent | reopen at v5 adds no stores, preserves data |
| Unsafe chains refused at registration | GAP + DUPLICATE register calls throw |
| Unsafe migrations refused at migrate time | DOWNGRADE + UNKNOWN_VERSION throw; input untouched |
| Unsupported archive versions refused | version-2 archive rejected before import |
