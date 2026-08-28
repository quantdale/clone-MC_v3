/**
 * Faithful per-chunk sparse edit record persisted in the world IndexedDB database (added at schema
 * version 6). This is the authoritative durable representation of live edits: one record per chunk,
 * holding every `[localIndex, blockId]` pair currently in the chunk's edit overlay, exactly mirroring
 * the runtime overlay model (`WorldEditSnapshot` entries). Unlike the air-filled archive conversion,
 * the sparse pairs preserve the distinction between "player dug this cell out" and "cell was never
 * touched", and no change index is ever truncated.
 */
import { CHUNK_BLOCK_COUNT } from '../world/WorldCoordinates';

/** Our record schema version (starts at 1). */
export const CHUNK_EDIT_RECORD_VERSION = 1;

/** A single chunk's full sparse edit snapshot, persisted under the composite `key`. */
export interface ChunkEditRecord {
  /** `${worldId}|${chunkX}|${chunkY}|${chunkZ}`. */
  key: string;
  /** Owning world identifier (also encoded in `key`). */
  worldId: string;
  /** Chunk X coordinate. */
  chunkX: number;
  /** Chunk Y coordinate. */
  chunkY: number;
  /** Chunk Z coordinate. */
  chunkZ: number;
  /** Sparse cell edits: `[localIndex, blockId]` pairs, localIndex over the full chunk volume. */
  changes: Array<[number, number]>;
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Validate an unknown value as a `ChunkEditRecord`. Returns the same value (narrowed) on success;
 * throws a descriptive `Error` on any invalid field. `key` defaults to the composite
 * `${worldId}|${cx}|${cy}|${cz}` when absent or empty; coordinates must be integers; `changes` must
 * hold at least one `[index, blockId]` pair with `0 <= index < CHUNK_BLOCK_COUNT` and a non-negative
 * integer `blockId`.
 */
export function validateChunkEditRecord(input: unknown): ChunkEditRecord {
  if (typeof input !== 'object' || input === null) {
    throw new Error('ChunkEditRecord: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (typeof r.worldId !== 'string' || r.worldId.length === 0) {
    throw new Error('ChunkEditRecord: worldId must be a non-empty string');
  }
  if (!isInteger(r.chunkX)) {
    throw new Error('ChunkEditRecord: chunkX must be an integer');
  }
  if (!isInteger(r.chunkY)) {
    throw new Error('ChunkEditRecord: chunkY must be an integer');
  }
  if (!isInteger(r.chunkZ)) {
    throw new Error('ChunkEditRecord: chunkZ must be an integer');
  }
  if (!Array.isArray(r.changes) || r.changes.length < 1) {
    throw new Error('ChunkEditRecord: changes must be a non-empty array of [index, blockId] pairs');
  }
  for (const change of r.changes) {
    if (!Array.isArray(change) || change.length !== 2 || !isInteger(change[0]) || !isInteger(change[1])) {
      throw new Error('ChunkEditRecord: each change must be a pair of integers [index, blockId]');
    }
    const [index, blockId] = change as [number, number];
    if (index < 0 || index >= CHUNK_BLOCK_COUNT) {
      throw new Error(`ChunkEditRecord: change index ${index} is out of range [0, ${CHUNK_BLOCK_COUNT})`);
    }
    if (blockId < 0) {
      throw new Error(`ChunkEditRecord: change blockId ${blockId} must be non-negative`);
    }
  }

  const key =
    typeof r.key === 'string' && r.key.length > 0
      ? r.key
      : `${r.worldId}|${r.chunkX}|${r.chunkY}|${r.chunkZ}`;

  return {
    key,
    worldId: r.worldId,
    chunkX: r.chunkX,
    chunkY: r.chunkY,
    chunkZ: r.chunkZ,
    changes: r.changes.map((c) => [c[0], c[1]] as [number, number]),
  };
}
