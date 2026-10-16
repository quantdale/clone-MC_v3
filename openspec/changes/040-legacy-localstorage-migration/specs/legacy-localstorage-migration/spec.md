# Spec: legacy-localstorage-migration

## Contract

The game MUST be able to import its legacy `localStorage` saves (sparse edit overlay +
player/inventory/survival state) into the new `voxel-world-db` layer. A `player-state` object store
MUST exist (database at `WORLD_DB_VERSION`), a `PlayerStateRepository` MUST round-trip
`PlayerStateRecord`s, and a `LegacyLocalStorageMigrator` MUST read the legacy keys for a seed, validate
them, convert the edit overlay into `SerializedChunkColumn` records and the game snapshot into a
`PlayerStateRecord`, and persist them through the 035 repository and the player-state repository.
Migration MUST be non-destructive (legacy storage is only read) and MUST report per-record errors
without partial writes.

## Definitions

- **Legacy edit key**: `voxel-game-edits-v1:${seed}` holding a `WorldEditSnapshot`
  (`version 1`, `seed`, `edits` of `{ chunk: [cx, cy, cz], changes: [[sectionLocalIndex, blockId]] }`).
- **Legacy state key**: `voxel-game-state-v1:${seed}` holding a `GameSaveSnapshot`
  (`version 1`, `seed`, `player.position/yaw/pitch`, `inventory`, `survival`).
- **PlayerStateRecord**: `{ key, worldId, seed, position: [x,y,z], yaw, pitch, inventory, survival }`.
- **Migrated column**: a 024 `SerializedChunkColumn` whose sections are 022 paletted containers built
  from the edited cells with air (legacy id `0`) for untouched cells.

## Invariants

- `WORLD_DB_VERSION = 5`; `WORLD_PLAYER_STATE_STORE = 'player-state'`; `ensureWorldStores` creates all
  five stores idempotently.
- `PlayerStateRecord.key === worldId`; `validatePlayerStateRecord` rejects malformed records.
- Migrated containers: version `1`, capacity `4096`, `bitsPerEntry >= 4`, palette `[0, ...changedIds]`,
  storage initialized to air with edited cells set.
- A malformed legacy record MUST NOT be partially written.
- `migrate(seed)` MUST NOT throw out of the method for storage/validation failures; it reports them.
- Legacy storage is read-only; keys are never removed or overwritten by the migrator.

## Requirements

### Requirement: player-state store and repository
The database MUST be at `WORLD_DB_VERSION` with a `player-state` store (keyPath `key`); the repository
MUST support put/get/delete/list round-trips by `worldId`.

#### Scenario: store created and round-trips
- **GIVEN** a repository backed by a fresh in-memory `IDBFactory`
- **WHEN** `open()` resolves and a valid `PlayerStateRecord` is put then gotten
- **THEN** `getPlayerState` returns the record with the same fields; absent keys return `null`.

### Requirement: player-state validation
`validatePlayerStateRecord` MUST reject non-object input, non-integer `seed`, a `position` that is not
three finite numbers, non-finite `yaw`/`pitch`, or missing `inventory`/`survival`.

#### Scenario: malformed record rejected
- **GIVEN** a record with `position: [1, 2]` (or missing `survival`)
- **WHEN** `validatePlayerStateRecord` is called
- **THEN** it throws, and the repository writes nothing.

### Requirement: edit-overlay conversion
`editsToSerializedChunkColumn` MUST group per-chunk edits by section and produce a valid
`SerializedChunkColumn` (version 1) whose paletted containers round-trip through `ChunkColumn.deserialize`.

#### Scenario: converted column round-trips
- **GIVEN** edited cells for two sections of one `(chunkX, chunkZ)`
- **WHEN** converted to a `SerializedChunkColumn` and deserialized with a default block-state registry
- **THEN** the edited cells have the migrated block ids, untouched cells are air, and
  `chunkX`/`chunkZ`/`minSectionY`/`sectionCount` match the input.

### Requirement: migration imports both artifacts
`migrate(seed)` MUST import the legacy edits into `chunk-sections` and the legacy state into
`player-state`, returning a truthful report.

#### Scenario: end-to-end import
- **GIVEN** in-memory storage with both legacy keys for `seed = 7` and mock-backed repositories
- **WHEN** `migrate(7)` runs
- **THEN** the report shows the imported column count / edit count and `playerStateImported: true`, the
  chunk-sections store contains the migrated columns, and the player-state store contains the record.

### Requirement: errors reported, no partial writes
Malformed legacy data MUST be reported in `report.errors` and MUST NOT write a partial record.

#### Scenario: malformed state rejected
- **GIVEN** a legacy state value that is not JSON (or fails validation)
- **WHEN** `migrate(seed)` runs
- **THEN** `report.errors` contains the failure, `playerStateImported` is `false`, and the player-state
  store stays empty; valid edits still import.

### Requirement: v4→v5 migration preserves prior stores
Opening the database at `WORLD_DB_VERSION` after a v4 open MUST add `player-state` while preserving the
four prior stores and their records.

#### Scenario: in-place upgrade
- **GIVEN** a v4 database with records in all four prior stores
- **WHEN** a repository opens at version `5`
- **THEN** all five stores exist and the prior records are still readable.

## Error and failure behavior

- `getItem` throws → error entry in the report; other reads continue.
- Malformed JSON / failed validation → error entry; that artifact is skipped; other artifacts import.
- Repository write failure → error entry; other writes continue.
- Missing legacy keys → silently skipped (no error), zero counts in the report.

## Performance and resource bounds

One-time per seed; work proportional to edited cells + distinct columns; one write per migrated column
and one per player state. No per-frame work.

## Compatibility and migration

`WORLD_DB_VERSION` is the migration pivot; v4→v5 adds `player-state` via `ensureWorldStores`. Legacy
keys are never modified, so the import is repeatable and reversible.

## Security and integrity

Per-record validation prevents corrupt legacy data from entering the stores; non-destructive import
preserves the source of truth until the game retires it.

## Observability

`LegacyMigrationReport` (`importedColumns`, `importedEdits`, `playerStateImported`, `errors`) is the
migration audit trail.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Player-state store and repository | open creates store; put/get/absent-null/delete/list |
| Player-state validation | malformed position/seed/missing fields throw; put rejects |
| Edit-overlay conversion | container + column round-trip through `ChunkColumn.deserialize` |
| Migration imports both artifacts | end-to-end migrate with in-memory storage + mocks |
| Errors reported, no partial writes | malformed state → error entry, empty player-state store, edits still import |
| v4→v5 migration preserves prior stores | seeded v4 DB upgraded at v5 keeps all stores + records |
