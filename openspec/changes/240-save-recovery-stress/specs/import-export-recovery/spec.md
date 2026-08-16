# Spec: import-export-recovery

## Contract

The save layer MUST support portable world export/import that recovers cleanly under malformed, tampered,
and partial inputs. Export MUST produce a fully validated `WorldArchive` (format `voxel-world`, version 1)
containing every record of a world; import MUST validate the entire archive before the first write and
reject a malformed archive atomically (no store is written). Export→import→export MUST be stable apart from
the timestamp fields, and a mismatched `playerState.worldId` MUST be normalized to the archive's `worldId`
so no record leaks to another key.

## Definitions

- **Export**: `WorldArchiver.exportWorld(worldId)` — read-only; collects metadata, player state, chunk
  columns, block-entity chunks, and entity chunks into a `WorldArchive`.
- **Import**: `WorldArchiver.importWorld(archive)` — validates via `validateWorldArchive`, then writes.
- **Stability**: re-export equals the prior export after a round-trip, ignoring `exportedAt` and
  repository-stamped `metadata.updatedAt`.
- **Atomic rejection**: a malformed/tampered archive throws before any store write, leaving all five
  stores untouched for that import.

## Invariants

- `exportWorld` never writes to any store.
- `importWorld` validates the whole archive before the first write.
- A rejected import leaves all five stores with no new records (atomic).
- Round-trip stability holds apart from `exportedAt`/`updatedAt`.
- `playerState.worldId` (and `key`) are normalized to the archive `worldId` on import.

## Requirements

### Requirement: export is complete and valid
`exportWorld(worldId)` MUST return an archive whose `format`/`version` are current, whose `worldId` matches
the request, and which contains every metadata, player-state, column, block-entity-chunk, and entity-chunk
record belonging to that world; the result MUST pass `validateWorldArchive`.

#### Scenario: export captures all stores
- **GIVEN** a world populated in all five stores
- **WHEN** `exportWorld(worldId)` runs
- **THEN** the archive has the world's metadata, player state, all columns, all block-entity chunks, and
  all entity chunks, and `validateWorldArchive(archive)` returns the same value.

### Requirement: import round-trip is stable
Importing an exported archive into fresh repositories and re-exporting MUST reproduce the archive apart
from `exportedAt` and `updatedAt`, and the imported stores MUST contain every record.

#### Scenario: export → import → export stability
- **GIVEN** a populated source world
- **WHEN** it is exported, imported into fresh repositories, and re-exported
- **THEN** the two archives are equal after stripping `exportedAt`/`updatedAt`, and every imported store
  holds the corresponding records.

### Requirement: malformed archives are rejected atomically
`importWorld` MUST reject an archive that is malformed (bad format/version, invalid column, invalid
player-state, malformed chunk payload) before any write, and MUST leave all five stores with no records
from that import.

#### Scenario: rejected import writes nothing
- **GIVEN** a valid archive whose `format`, a column's `version`, and the player-state's `position` are
  each corrupted in turn
- **WHEN** each corrupted archive is imported into a fresh target
- **THEN** each import rejects, and the target's metadata, chunk, block-entity, entity, and player-state
  stores are all empty of new records.

### Requirement: player-state worldId normalization
On import, a `playerState` whose `worldId`/`key` does not match the archive's `worldId` MUST be written
under the archive's `worldId` and MUST NOT appear under the mismatched key.

#### Scenario: mismatched player state normalized
- **GIVEN** an archive whose `playerState.worldId`/`key` is set to `'other'` but whose `worldId` is
  `'world-7'`
- **WHEN** it is imported
- **THEN** the player state is readable under `'world-7'` and absent under `'other'`.

### Requirement: export is read-only
`exportWorld` MUST not mutate any store; re-exporting twice MUST not change the stores' contents.

#### Scenario: export leaves stores unchanged
- **GIVEN** a populated world
- **WHEN** `exportWorld` runs twice and the stores are compared before/after
- **THEN** the metadata, chunk, block-entity, entity, and player-state stores are unchanged.

## Error and failure behavior

- Malformed archive → `validateWorldArchive`/`importWorld` throws; import aborts before any write.
- Export with a missing record (e.g. no metadata) still yields a valid archive with that section `null`
  or empty; validation permits absent metadata/player state.
- An import write failure after validation (e.g. quota injection) is a partial-import condition handled by
  the persistence layer; the matrix covers atomic rejection of *validation* failures, which is the
  no-partial-write contract for untrusted archives.

## Performance and resource bounds

Export/import are linear in the number of records across the five stores. The matrix exercises a small
world; no hot-path impact.

## Compatibility and migration

No `WORLD_ARCHIVE_VERSION`/`WORLD_DB_VERSION` change. The axis asserts the existing `WorldArchiver` /
`WorldArchive` contracts; unsupported archive versions are rejected (see `migration-recovery`).

## Security and integrity

Atomic validation-before-write guarantees a malformed or tampered archive can never partially enter the
stores; `worldId` normalization prevents cross-world record leakage.

## Observability

`detail` cites record counts per store, the round-trip stability result, and which corruption was rejected
for each atomic-rejection case.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Export is complete and valid | populated world → archive with all stores, passes validation |
| Import round-trip is stable | export→import→export equal after stripping timestamps |
| Malformed archives rejected atomically | corrupt format/column/player-state each reject; stores empty |
| Player-state worldId normalization | mismatched worldId written under archive worldId only |
| Export is read-only | two exports leave all stores unchanged |
