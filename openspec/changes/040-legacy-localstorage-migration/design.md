# Design: 040-legacy-localstorage-migration

## Context / current state

The game persists two localStorage artifacts per seed:
- `voxel-game-edits-v1:${seed}` — `WorldEditSnapshot`: `{ version: 1, seed, edits: [{ chunk:
  [cx, cy, cz], changes: [[sectionLocalIndex, legacyBlockId]] }] }`. Only cells the player changed are
  recorded (an overlay on generated terrain). Legacy id `0` is air.
- `voxel-game-state-v1:${seed}` — `GameSaveSnapshot`: `{ version: 1, seed, player: { position:
  [x,y,z], yaw, pitch }, inventory, survival }`.

034-039 built `voxel-world-db` (v4) with four stores and a save queue/autosave layer; nothing imports
these legacy artifacts.

## Target state

`voxel-world-db` at v5 has a fifth store `player-state` (keyPath `key` = `worldId`). A
`LegacyLocalStorageMigrator` reads the legacy keys for a seed, validates them, converts the edit
overlay into per-chunk `SerializedChunkColumn` records and the game snapshot into a `PlayerStateRecord`,
and persists them through `ChunkSectionRepository`/`PlayerStateRepository`. Legacy keys are left
untouched.

## Invariants

- `WORLD_DB_VERSION = 5`; `WORLD_PLAYER_STATE_STORE = 'player-state'`; `ensureWorldStores` creates all
  five stores idempotently.
- `PlayerStateRecord.key === worldId`; validator rejects malformed records (bad position/yaw/pitch,
  missing inventory/survival); nothing partial is written.
- Migrated `SerializedChunkColumn`s are valid per 024/022 contracts (version 1; sections keyed by
  in-column index; paletted containers version 1, capacity 4096, bits ≥ 4) and must round-trip through
  `ChunkColumn.deserialize` with a block-state registry.
- Conversion is registry-free: palette `[0, ...changedIds]` with storage initialized to `0` (air) and
  changed cells set to their palette ordinals.
- Migration is non-destructive: legacy storage is only read.
- A malformed legacy snapshot aborts that record's import with the error reported; other records still
  import.

## API and data model

```ts
// src/storage/WorldMetadata.ts (changed)
export const WORLD_DB_VERSION = 5;                       // was 4
export const WORLD_PLAYER_STATE_STORE = 'player-state';  // NEW

// src/storage/PlayerStateRecord.ts (NEW)
export interface PlayerStateRecord {
  key: string;                    // = worldId
  worldId: string;
  seed: number;
  position: [number, number, number];
  yaw: number;
  pitch: number;
  inventory: unknown;             // InventorySnapshot payload (restored/validated by the game)
  survival: unknown;              // SurvivalSnapshot payload
}
export function validatePlayerStateRecord(input: unknown): PlayerStateRecord;

// src/storage/PlayerStateRepository.ts (NEW)
export class PlayerStateRepository {
  constructor(opts: { factory?: IdbFactoryLike; dbName?: string; dbVersion?: number });
  open(): Promise<void>;
  putPlayerState(record: PlayerStateRecord): Promise<void>;
  getPlayerState(worldId: string): Promise<PlayerStateRecord | null>;
  deletePlayerState(worldId: string): Promise<void>;
  listPlayerStates(): Promise<PlayerStateRecord[]>;
  close(): void;
}

// src/storage/LegacyLocalStorageMigrator.ts (NEW)
export interface StorageLike { getItem(key: string): string | null; }
export interface LegacyEditSnapshot {
  version: 1; seed: number;
  edits: Array<{ chunk: [number, number, number]; changes: Array<[number, number]> }>;
}
export interface LegacyPlayerSnapshot {
  version: 1; seed: number; worldId?: string;
  player: { position: [number, number, number]; yaw: number; pitch: number };
  inventory: unknown; survival: unknown;
}
export interface LegacyMigrationReport {
  seed: number;
  importedColumns: number;   // distinct (chunkX, chunkZ) columns written
  importedEdits: number;     // total cell edits accepted
  playerStateImported: boolean;
  errors: string[];          // per-record failures (validation/storage)
}
export const LEGACY_EDIT_STORAGE_PREFIX = 'voxel-game-edits-v1:';
export const LEGACY_STATE_STORAGE_PREFIX = 'voxel-game-state-v1:';
export function editsToSerializedChunkColumn(entryGroups: Array<{ cy: number; changes: Array<[number, number]> }>, chunkX: number, chunkZ: number): SerializedChunkColumn;
export function buildSectionContainer(changes: Array<[number, number]>, capacity?: number): SerializedPalettedContainer;
export class LegacyLocalStorageMigrator {
  constructor(opts: { storage: StorageLike; chunkSections: ChunkSectionRepository; playerStates: PlayerStateRepository; worldIdForSeed?: (seed: number) => string });
  migrate(seed: number): Promise<LegacyMigrationReport>;
}
```

## Control / data flow

1. `migrate(seed)`:
   - `rawEdits = storage.getItem(LEGACY_EDIT_STORAGE_PREFIX + seed)`; if present and valid:
     group `edits` entries by `(chunkX, chunkZ)`; per column, convert each edited section `cy` into a
     paletted container and build a `SerializedChunkColumn` (`minSectionY = min cy`,
     `sectionCount = max cy - min cy + 1`); `await chunkSections.putColumn(worldId, column)` for each.
   - `rawState = storage.getItem(LEGACY_STATE_STORAGE_PREFIX + seed)`; if present and valid:
     build `PlayerStateRecord` and `await playerStates.putPlayerState(record)`.
   - Invalid/missing artifacts are skipped with a reported error (missing = skipped silently; malformed
     = error entry, no partial write).
2. Conversion details:
   - `buildSectionContainer(changes)`: `ids = unique(changed blockIds)`; `palette = [0, ...ids]`;
     `bitsPerEntry = max(MIN_PALETTE_BITS, ceil(log2(palette.length)))`; create a
     `PackedIntegerArray(bitsPerEntry, 4096)` (all zeros = air), `set` each changed index to its
     palette ordinal; return `{ version: PALETTED_CONTAINER_VERSION, capacity: 4096, bitsPerEntry,
     palette, storage: words }`.
   - `editsToSerializedChunkColumn`: groups per section; `sections[cy - minSectionY] =
     buildSectionContainer(...)`; returns `{ version: CHUNK_COLUMN_VERSION, chunkX, chunkZ,
     sectionCount, minSectionY, sections }`.
3. `worldIdForSeed` maps a seed to the world id used in the repositories (default `world-${seed}`);
   injectable so tests control the id.

## Detailed behavior

- Validation of the legacy edit snapshot: `version === 1`; integer `seed`; `edits` array; each entry's
  `chunk` is 3 integers; each `change` is `[integer index in [0, 4096), integer blockId >= 0]`.
  Invalid entries are skipped individually (reported), valid ones imported.
- Validation of the legacy player snapshot: `version === 1`; integer `seed`; `player.position` is
  3 finite numbers; `yaw`/`pitch` finite; `inventory` and `survival` present (not `undefined`).
- Section indices `cy` may be negative (future vertical worlds); `minSectionY` is the minimum edited
  `cy`, so the column's extent covers exactly the edited sections.
- Duplicate cell edits: later entries win (Map semantics during container build).
- `migrate` with no legacy data returns a report with zeros and no errors (idempotent, non-destructive).

## Failure modes

- Malformed edits JSON → one error entry; state still attempted.
- Malformed state JSON → one error entry; columns still imported.
- Repository write failure → error entry; other writes continue.
- Storage `getItem` throws (private mode) → error entry per read; migrator never throws out of `migrate`.

## Compatibility / migration

v4→v5 adds `player-state` via `ensureWorldStores` (verified by in-place migration test preserving the
four prior stores and their records). Legacy keys are never modified. Migrated columns document
air-fill semantics for un-edited cells; consumers merge with regenerated terrain.

## Performance / resource constraints

Migration is one-time per seed. Work is proportional to the number of edited cells + distinct columns;
per-column writes go through `ChunkSectionRepository` one at a time. No per-frame work.

## Testing seams

- `tests/unit/LegacyLocalStorageMigrator.test.ts`:
  - converter unit tests: `buildSectionContainer` produces a valid container (bits ≥ 4, palette
    `[0, ...ids]`, storage round-trips through `PackedIntegerArray`); `editsToSerializedChunkColumn`
    groups sections, and the result round-trips through `ChunkColumn.deserialize` with a default
    block-state registry and air defaults (edited cells present, untouched cells air).
  - `PlayerStateRepository` round-trip/validation/absent-null/delete/list.
  - migrator end-to-end: in-memory `StorageLike` with both legacy keys; mock-backed repositories;
    `migrate(seed)` imports columns + player state; report matches; malformed JSON reported without
    partial writes; missing keys produce an empty report.
  - v4→v5 migration: seed a v4 DB with the four prior stores + records, open at v5, assert all five
    stores and prior records survive.

## Observability / debugging

The report (`importedColumns`, `importedEdits`, `playerStateImported`, `errors`) is the migration
audit trail.

## Affected files / symbols

- `src/storage/WorldMetadata.ts`, `src/storage/WorldMetadataRepository.ts` — v5 + `player-state` store.
- `src/storage/PlayerStateRecord.ts`, `src/storage/PlayerStateRepository.ts` — NEW.
- `src/storage/LegacyLocalStorageMigrator.ts` — NEW (converters + migrator).
- `tests/unit/LegacyLocalStorageMigrator.test.ts` — NEW.

## Rejected alternatives

- *Migrate edits into the world's in-memory overlay at load* (status quo): leaves no durable record in
  the new layer and depends on the game runtime; 040's store-level import keeps the migration
  testable and independent of the renderer.
- *Require a `BlockStateRegistry` for conversion*: legacy ids are raw numbers and air is 0; a
  registry-free conversion keeps the migrator decoupled and deterministic.
- *Delete legacy keys after import*: destructive and risky (rollback); non-destructive import lets the
  game retire the keys at its own pace.

## Downstream dependencies

041 (schema migrations) and 042 (world export/import) build on the five-store schema; the game wiring
change later consumes migrated columns (merging over regenerated terrain) and the player-state record.
