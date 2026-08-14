/**
 * Portable, validated world archive format (042). A `WorldArchive` (format `voxel-world`, version 1)
 * holds one world's persisted records from all five stores: metadata, player state, chunk columns,
 * block-entity chunks, and entity chunks. It is JSON-serializable and fully validated before any
 * import write, so a malformed archive can never partially enter the stores.
 */
import type { WorldMetadata } from './WorldMetadata';
import { validateWorldMetadata } from './WorldMetadata';
import type { PlayerStateRecord } from './PlayerStateRecord';
import { validatePlayerStateRecord } from './PlayerStateRecord';
import type { SerializedChunkColumn } from '../world/ChunkColumn';
import { validateSerializedChunkColumn } from './ChunkSectionRepository';
import type { SerializedBlockEntity } from './BlockEntityRecord';
import { validateSerializedBlockEntity } from './BlockEntityRecord';
import type { SerializedEntity } from './EntityRecord';
import { validateSerializedEntity } from './EntityRecord';

/** Archive format identifier. */
export const WORLD_ARCHIVE_FORMAT = 'voxel-world';

/** Archive format version; bump with migration rules when the shape changes. */
export const WORLD_ARCHIVE_VERSION = 1;

/** A chunk's block entities in archive form (storage `key`/`worldId` omitted; derived on import). */
export interface BlockEntityChunkPayload {
  chunkX: number;
  chunkZ: number;
  entities: SerializedBlockEntity[];
}

/** A chunk's entities in archive form (storage `key`/`worldId` omitted; derived on import). */
export interface EntityChunkPayload {
  chunkX: number;
  chunkZ: number;
  entities: SerializedEntity[];
}

/** One world's full persisted state, portable across databases/devices. */
export interface WorldArchive {
  format: 'voxel-world';
  version: 1;
  /** Epoch millis when the archive was exported. */
  exportedAt: number;
  /** Owning world identifier; the import target key. */
  worldId: string;
  /** World metadata, or `null` when absent. */
  metadata: WorldMetadata | null;
  /** Player state, or `null` when absent. */
  playerState: PlayerStateRecord | null;
  /** Per-chunk-column serialized block-state data. */
  columns: SerializedChunkColumn[];
  /** Per-chunk block-entity groups. */
  blockEntityChunks: BlockEntityChunkPayload[];
  /** Per-chunk entity groups. */
  entityChunks: EntityChunkPayload[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isChunkPayload<T>(
  input: unknown,
  validateEntity: (e: unknown) => T,
): { chunkX: number; chunkZ: number; entities: T[] } | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  if (!isInteger(r.chunkX) || !isInteger(r.chunkZ)) return null;
  if (!Array.isArray(r.entities)) return null;
  try {
    return { chunkX: r.chunkX as number, chunkZ: r.chunkZ as number, entities: r.entities.map(validateEntity) };
  } catch {
    return null;
  }
}

/**
 * Validate an unknown value as a `WorldArchive`. Returns the same value (narrowed) on success;
 * throws a descriptive `Error` on any invalid field. Does not coerce types.
 */
export function validateWorldArchive(input: unknown): WorldArchive {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorldArchive: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (r.format !== WORLD_ARCHIVE_FORMAT) {
    throw new Error(`WorldArchive: format must be '${WORLD_ARCHIVE_FORMAT}'`);
  }
  if (r.version !== WORLD_ARCHIVE_VERSION) {
    throw new Error(`WorldArchive: unsupported version ${String(r.version)}`);
  }
  if (typeof r.worldId !== 'string' || r.worldId.length === 0) {
    throw new Error('WorldArchive: worldId must be a non-empty string');
  }
  if (!isFiniteNumber(r.exportedAt)) {
    throw new Error('WorldArchive: exportedAt must be a finite number');
  }

  if (r.metadata !== null && r.metadata !== undefined) {
    validateWorldMetadata(r.metadata);
  }
  if (r.playerState !== null && r.playerState !== undefined) {
    validatePlayerStateRecord(r.playerState);
  }

  if (!Array.isArray(r.columns)) {
    throw new Error('WorldArchive: columns must be an array');
  }
  const columns = (r.columns as unknown[]).map((c) => validateSerializedChunkColumn(c));

  if (!Array.isArray(r.blockEntityChunks)) {
    throw new Error('WorldArchive: blockEntityChunks must be an array');
  }
  const blockEntityChunks: BlockEntityChunkPayload[] = [];
  for (const raw of r.blockEntityChunks as unknown[]) {
    const payload = isChunkPayload(raw, validateSerializedBlockEntity);
    if (!payload) throw new Error('WorldArchive: malformed blockEntityChunks entry');
    blockEntityChunks.push(payload);
  }

  if (!Array.isArray(r.entityChunks)) {
    throw new Error('WorldArchive: entityChunks must be an array');
  }
  const entityChunks: EntityChunkPayload[] = [];
  for (const raw of r.entityChunks as unknown[]) {
    const payload = isChunkPayload(raw, validateSerializedEntity);
    if (!payload) throw new Error('WorldArchive: malformed entityChunks entry');
    entityChunks.push(payload);
  }

  return {
    format: WORLD_ARCHIVE_FORMAT as 'voxel-world',
    version: WORLD_ARCHIVE_VERSION as 1,
    exportedAt: r.exportedAt as number,
    worldId: r.worldId as string,
    metadata: (r.metadata as WorldMetadata | undefined) ?? null,
    playerState: (r.playerState as PlayerStateRecord | undefined) ?? null,
    columns,
    blockEntityChunks,
    entityChunks,
  };
}
