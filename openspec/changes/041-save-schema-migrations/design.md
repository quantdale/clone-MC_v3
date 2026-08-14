# Design: 041-save-schema-migrations

## Context / current state

Persisted records carry data versions: `SerializedChunkColumn.version` (`CHUNK_COLUMN_VERSION = 1`),
`WorldMetadata.schemaVersion` (1), paletted containers `version` (1). No code migrates a stored
record's data version forward. IndexedDB schema upgrades are handled by `WORLD_DB_VERSION` +
`ensureWorldStores` (034-040), which is orthogonal.

## Target state

A generic `DataMigrationChain<T>` owns an ordered, contiguous list of `DataMigration<T>` steps from a
base version upward. Loading code asks `needsMigration(record)`; when true it calls
`migrate(record, getVersion)` and receives the upgraded record plus the applied step versions. Typed
chains for `WorldMetadata` and `SerializedChunkColumn` ship with zero steps today (identity), and
future record-shape changes register steps.

## Invariants

- Steps are registered in strictly ascending, contiguous order starting from `1`: `fromVersion` of the
  first step must be `1`, and each next step's `fromVersion` must equal the previous step's `toVersion`.
- `migrate` applies every step whose `fromVersion` is within `[recordVersion, targetVersion)` in order.
- `migrate` with `recordVersion > targetVersion` throws `DOWNGRADE`.
- `migrate` with an unknown current version (no step starts there and it is not the target) throws
  `UNKNOWN_VERSION`.
- `register` with a duplicate or non-contiguous step throws `DUPLICATE` / `GAP`.
- Migration is pure: the chain never mutates its input record; `migrate` returns a new value.
- A throwing step aborts the chain; the caller keeps the original record.

## API and data model

```ts
// src/storage/DataMigration.ts
export interface DataMigration<T> {
  fromVersion: number;
  toVersion: number;   // must be fromVersion + 1
  migrate(record: T): T;
}
export type DataMigrationErrorKind = 'GAP' | 'DUPLICATE' | 'DOWNGRADE' | 'UNKNOWN_VERSION';
export class DataMigrationError extends Error {
  constructor(readonly kind: DataMigrationErrorKind, message: string);
}
export interface MigrationResult<T> {
  record: T;
  appliedSteps: number[];
}
export class DataMigrationChain<T> {
  constructor(readonly baseVersion: number);
  register(migration: DataMigration<T>): void;
  get currentVersion(): number;
  needsMigration(record: T, getVersion: (record: T) => number): boolean;
  migrate(record: T, getVersion: (record: T) => number): MigrationResult<T>;
  get steps(): readonly DataMigration<T>[];
}

// Typed chains (empty today; identity for current records)
export const WORLD_METADATA_MIGRATIONS: DataMigrationChain<WorldMetadata>;   // baseVersion = 1 (schemaVersion)
export const CHUNK_COLUMN_MIGRATIONS: DataMigrationChain<SerializedChunkColumn>; // baseVersion = 1 (version)
export function migrateWorldMetadata(record: WorldMetadata): WorldMetadata;
export function migrateChunkColumn(record: SerializedChunkColumn): SerializedChunkColumn;
```

## Control / data flow

1. A load path reads a persisted record (e.g. via `ChunkSectionRepository.getColumn`).
2. `migrateChunkColumn(record)`: `needsMigration`? → `migrate` → upgraded record; else identity.
3. `migrate` walks `recordVersion → currentVersion`: for each step whose `fromVersion === current`,
   `record = step.migrate(record)`; `appliedSteps.push(toVersion)`.
4. Steps are looked up in a `Map<number, DataMigration<T>>` keyed by `fromVersion`; registration
   validates contiguity against the previous step.

## Detailed behavior

- `register`: if `fromVersion !== this.currentVersion` → `GAP` (or `DUPLICATE` when already present);
  if `toVersion !== fromVersion + 1` → `GAP`. Otherwise insert and bump `currentVersion`.
- `migrate`: `current = getVersion(record)`; if `current < baseVersion` or unknown → `UNKNOWN_VERSION`;
  if `current > currentVersion` → `DOWNGRADE`; loop `while (current < currentVersion)` applying the
  step at `current`; a missing step at `current` → `GAP` (defensive; registration prevents it).
- `needsMigration`: `getVersion(record) !== currentVersion`.

## Failure modes

- Non-contiguous/duplicate registration → `DataMigrationError` with the exact kind.
- Record newer than the chain → `DOWNGRADE`.
- Record version with no step and not current → `UNKNOWN_VERSION`.
- A step's `migrate` throws → propagates; input record untouched (chain is pure).

## Compatibility / migration

No `WORLD_DB_VERSION` change. Chains are additive; empty chains are identity. Future record-shape
changes add steps and, if needed, bump per-record version constants.

## Performance / resource constraints

Migration runs once per loaded record, cost = number of steps applied (typically 0-2). Pure data
transformations; no I/O.

## Testing seams

- `tests/unit/DataMigration.test.ts`:
  - ordered application with two steps (v1→v2 renames a field, v2→v3 adds a field) and
    `appliedSteps` reporting;
  - identity when the record is current;
  - `register` errors: gap, duplicate, non-contiguous, `toVersion !== fromVersion + 1`;
  - `migrate` errors: downgrade, unknown version;
  - throwing step leaves input untouched;
  - typed chains: `migrateWorldMetadata`/`migrateChunkColumn` return the input unchanged (current
    version 1), `needsMigration` false.

## Observability / debugging

`MigrationResult.appliedSteps` is the migration audit trail per record.

## Affected files / symbols

- `src/storage/DataMigration.ts` — NEW framework + typed chains + helpers.
- `tests/unit/DataMigration.test.ts` — NEW tests.

## Rejected alternatives

- *VersionedCodec (019) per-version serializers*: 019 handles encode/decode compatibility; 041
  handles in-memory record shape migration between loaded versions. Complementary, not a substitute.
- *Automatic migration inside repositories*: repositories are registry-free and storage-typed;
  keeping migration at the load path leaves the boundary contract unchanged.
- *Big-bang switch statement over versions*: unmaintainable; ordered composable steps are the minimal
  scalable form.

## Downstream dependencies

Later content expansions (215-220) and save-schema changes register steps on these chains; 042
(world export/import) validates/upgrades records before writing archives.
