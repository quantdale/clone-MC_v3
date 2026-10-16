# Proposal: 041-save-schema-migrations

## Problem

034-040 persist versioned records (e.g. `SerializedChunkColumn.version = 1`, `WorldMetadata.schemaVersion = 1`),
but nothing migrates a stored record's *data version* forward in a controlled way. As future changes
evolve record shapes, older saves must be upgraded deterministically — ordered, gap-checked, and
refusing to downgrade — before they are used. IndexedDB *schema* versioning exists (`WORLD_DB_VERSION`
+ `ensureWorldStores`), but record-level *data* migration is missing.

## Goals

- Provide an ordered, typed data-migration framework: `DataMigration<T>` steps + `DataMigrationChain<T>`
  that applies contiguous `fromVersion → toVersion` steps in order.
- Reject structural mistakes deterministically: gaps in the chain, duplicate steps, non-contiguous
  steps, downgrades, and unknown current versions.
- Provide typed chains for the versioned record families already persisted: `WorldMetadata`
  (`schemaVersion`) and `SerializedChunkColumn` (`version`), plus `needsMigration`/`currentVersion`
  helpers so consumers know when a record must be migrated.
- Be pure, registry-free, and fully unit-testable (no IndexedDB required).

## Non-goals

- IndexedDB schema versioning (`WORLD_DB_VERSION`) — already handled by 034-040.
- Running migrations automatically inside repositories (consumers call the chain when loading records;
  wiring into the load path is a later consumer change).
- Record families without a version field (e.g. block-entity/entity/player-state envelopes carry no
  data version yet; they will gain one when their frameworks land and can then join the chains).
- Any schema change to the stores.

## Preconditions

- Change 040 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 040 baseline (570 unit / 19 e2e).
- `WorldMetadata.schemaVersion` and `SerializedChunkColumn.version` fields exist and are stable.

## Dependencies

- 034 `WorldMetadata` (`schemaVersion`); 024/035 `SerializedChunkColumn` (`version`).

## Proposed change

- `src/storage/DataMigration.ts` (NEW): `DataMigration<T>` (`fromVersion`, `toVersion`, `migrate`),
  `DataMigrationError` (kinds: GAP / DUPLICATE / DOWNGRADE / UNKNOWN_VERSION), and
  `DataMigrationChain<T>` (`register`, `migrate(record, getVersion)`, `currentVersion`,
  `needsMigration`, `steps`). A chain requires contiguous steps starting at the base version (1).
- Typed chains: `WORLD_METADATA_MIGRATIONS` (currently empty; base `schemaVersion = 1`) and
  `CHUNK_COLUMN_MIGRATIONS` (currently empty; base `version = 1`) with `migrateWorldMetadata(record)`
  / `migrateChunkColumn(record)` helpers that migrate to the latest known version (identity when
  current).
- `tests/unit/DataMigration.test.ts` (NEW).

## Compatibility and migration

No `WORLD_DB_VERSION` change. The framework is additive; empty chains mean identity for current
records. Future changes register steps via `register` before records of those versions can be loaded.

## Risks

- A migration step that throws mid-chain must leave the caller's record untouched (the chain works on
  the value it is given and throws; the caller keeps its original record).
- Non-contiguous registration is the main correctness hazard; `register` enforces contiguity eagerly.
- Downgrade attempts (record newer than target) must be rejected, never silently truncated.

## Rollback strategy

Revert the commit; the framework is additive and touches no persisted data.

## Definition of Done

- `DataMigrationChain` applies ordered contiguous steps; `migrate` returns `{ record, appliedSteps }`.
- Registration rejects gaps/duplicates/non-contiguous steps; `migrate` rejects downgrades and unknown
  current versions.
- Typed chains for `WorldMetadata` and `SerializedChunkColumn` exist with helpers.
- Unit tests cover ordered application, error kinds, identity on current records, and the typed chains.
- Full gate green; 041 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 041 suite; E2E stays 19/19.
