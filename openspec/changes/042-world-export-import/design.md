# Design: 042-world-export-import

## Context / current state

Five stores hold a world's data behind five injectable repositories: `WorldMetadataRepository`,
`ChunkSectionRepository`, `BlockEntityRepository`, `EntityRepository`, `PlayerStateRepository`. Each
record family already has a strict validator. Nothing serializes a whole world.

## Target state

A `WorldArchiver` reads a world's records from all five stores into a validated `WorldArchive` (JSON
serializable) and restores a validated archive back into the stores. Import is atomic-with-respect-to-
validation: the archive is fully validated before the first write, and `playerState.worldId` is
normalized to the archive's `worldId`.

## Invariants

- `WorldArchive.format === 'voxel-world'`, `version === 1`, `worldId` non-empty, `exportedAt` finite.
- `metadata`/`playerState` are `null` or valid records; the four arrays contain only valid records.
- `validateWorldArchive` throws before any repository write on any violation.
- `importWorld` writes `metadata`, each column (via `putColumn`), each block-entity/entity chunk (via
  `putChunkEntities`), and `playerState` (keyed by the archive's `worldId`).
- `exportWorld` never writes.

## API and data model

```ts
// src/storage/WorldArchive.ts
export const WORLD_ARCHIVE_FORMAT = 'voxel-world';
export const WORLD_ARCHIVE_VERSION = 1;
export interface BlockEntityChunkPayload { chunkX: number; chunkZ: number; entities: SerializedBlockEntity[]; }
export interface EntityChunkPayload { chunkX: number; chunkZ: number; entities: SerializedEntity[]; }
export interface WorldArchive {
  format: 'voxel-world';
  version: 1;
  exportedAt: number;
  worldId: string;
  metadata: WorldMetadata | null;
  playerState: PlayerStateRecord | null;
  columns: SerializedChunkColumn[];
  blockEntityChunks: BlockEntityChunkPayload[];
  entityChunks: EntityChunkPayload[];
}
export function validateWorldArchive(input: unknown): WorldArchive;

// src/storage/WorldArchiver.ts
export interface WorldArchiverDeps {
  metadata: WorldMetadataRepository;
  chunkSections: ChunkSectionRepository;
  blockEntities: BlockEntityRepository;
  entities: EntityRepository;
  playerStates: PlayerStateRepository;
}
export interface WorldImportReport {
  worldId: string;
  columns: number;
  blockEntityChunks: number;
  entityChunks: number;
  metadataImported: boolean;
  playerStateImported: boolean;
}
export class WorldArchiver {
  constructor(deps: WorldArchiverDeps);
  exportWorld(worldId: string): Promise<WorldArchive>;
  importWorld(archive: WorldArchive): Promise<WorldImportReport>;
}
```

## Control / data flow

1. `exportWorld(worldId)`: open all repos; `metadata = await metadata.getMetadata(worldId)`;
   `playerState = await playerStates.getPlayerState(worldId)`; `columns = await
   chunkSections.listColumns(worldId)`; `blockEntityChunks = (await blockEntities.listChunks(worldId))
   .map(({ chunkX, chunkZ, entities }) => ({ chunkX, chunkZ, entities }))`; same for entities; stamp
   `exportedAt: Date.now()`; return the archive.
2. `importWorld(archive)`: `const valid = validateWorldArchive(archive)`; open all repos; if
   `valid.metadata` → `putMetadata`; for each column → `putColumn(valid.worldId, col)`; for each
   block-entity chunk → `putChunkEntities(valid.worldId, chunkX, chunkZ, entities)`; same for entity
   chunks; if `valid.playerState` → `putPlayerState({ ...valid.playerState, key: valid.worldId,
   worldId: valid.worldId })`; return the report.

## Detailed behavior

- `validateWorldArchive`: object; `format === 'voxel-world'`; `version === 1`; `worldId` non-empty
  string; `exportedAt` finite number; `metadata`/`playerState` null-or-valid (reusing their
  validators); `columns`/`blockEntityChunks`/`entityChunks` arrays; each column validated via
  `validateSerializedChunkColumn`; each chunk payload validated via integer `chunkX`/`chunkZ` +
  per-entity `validateSerializedBlockEntity`/`validateSerializedEntity`. No coercion.
- Import overwrites existing records for the same world (documented restore semantics).
- `exportWorld` on a world with no records produces an empty archive (null metadata/playerState, empty
  arrays) — valid and importable.

## Failure modes

- `validateWorldArchive` throws with a descriptive message; nothing is written.
- A repository read/write failure propagates (export: no archive; import: aborts mid-way — validated
  archive + per-write failures are reported by the repositories' normal error behavior).

## Compatibility / migration

No `WORLD_DB_VERSION` change. Archives are versioned (`version: 1`) so future format changes can be
migrated (041-style chains or a new archive version).

## Performance / resource constraints

Export/import cost is proportional to stored records; single-shot operations, no per-frame work.

## Testing seams

- `tests/unit/WorldArchiver.test.ts` with in-memory `IDBFactory` mocks for all five repositories:
  - export contains every record written to the five stores;
  - import restores every record into fresh stores and reports counts;
  - export→import→export produces equal archives (ignoring `exportedAt`);
  - validation rejection: bad format/version/worldId, malformed column, malformed chunk payload, bad
    playerState — nothing written after rejection;
  - import normalizes a playerState whose `worldId` differs from the archive's `worldId`.

## Observability / debugging

`WorldImportReport` is the import audit trail; the archive is JSON serializable for inspection.

## Affected files / symbols

- `src/storage/WorldArchive.ts` — NEW.
- `src/storage/WorldArchiver.ts` — NEW.
- `tests/unit/WorldArchiver.test.ts` — NEW.

## Rejected alternatives

- *Archive via `getAll` per store and manual rebuild*: exactly what the archiver does; the archiver
  exists to enforce the validated format and normalization.
- *Import into a new worldId*: cross-world renaming adds merge semantics; the narrow contract is
  restore-to-same-world.

## Downstream dependencies

043 (quota recovery) and 240 (save-recovery stress) exercise export/import as part of the save
lifecycle.
