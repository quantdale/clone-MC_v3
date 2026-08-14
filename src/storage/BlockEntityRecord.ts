/**
 * Persistence envelope for block entities (036). A live block-entity instance and its behavior are
 * owned by a future block-entity framework (052); here the store only needs a decoupled, forward-
 * compatible envelope: a registry `typeKey`, world block coordinates, and an opaque `data` payload.
 *
 * Block entities are sparse and positional, so they are persisted grouped per chunk in a
 * `BlockEntityChunkRecord` keyed by `worldId|chunkX|chunkZ` — matching the chunk granularity used by
 * the streaming (033) and chunk-section (035) stores, which keeps autosave (038/039) writes bounded.
 */

/** Current persistence schema version for a stored block entity. */
export const BLOCK_ENTITY_RECORD_VERSION = 1;

/** A single persisted block entity: a typed, positioned, opaque-payload envelope. */
export interface SerializedBlockEntity {
  /** Persistence schema version (starts at 1). */
  schemaVersion: number;
  /** Block-entity type registry key, e.g. `minecraft:chest`. */
  typeKey: string;
  /** World X of the block entity. */
  x: number;
  /** World Y of the block entity. */
  y: number;
  /** World Z of the block entity. */
  z: number;
  /** Opaque block-entity payload; the owning framework defines its shape per `typeKey`. */
  data: unknown;
}

/** A chunk's persisted block-entity group. */
export interface BlockEntityChunkRecord {
  /** `${worldId}|${chunkX}|${chunkZ}`. */
  key: string;
  /** Owning world identifier (also encoded in `key`). */
  worldId: string;
  /** Chunk X coordinate. */
  chunkX: number;
  /** Chunk Z coordinate. */
  chunkZ: number;
  /** Block entities located within this chunk. */
  entities: SerializedBlockEntity[];
}

function isFiniteInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

/**
 * Validate an unknown value as a `SerializedBlockEntity`. Returns the same value (narrowed) on
 * success; throws a descriptive `Error` on any invalid field. Does not coerce types.
 */
export function validateSerializedBlockEntity(input: unknown): SerializedBlockEntity {
  if (typeof input !== 'object' || input === null) {
    throw new Error('SerializedBlockEntity: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (!isFiniteInteger(r.schemaVersion) || (r.schemaVersion as number) < 1) {
    throw new Error('SerializedBlockEntity: schemaVersion must be a positive integer');
  }
  if (typeof r.typeKey !== 'string' || r.typeKey.length === 0) {
    throw new Error('SerializedBlockEntity: typeKey must be a non-empty string');
  }
  if (!isFiniteInteger(r.x)) {
    throw new Error('SerializedBlockEntity: x must be an integer');
  }
  if (!isFiniteInteger(r.y)) {
    throw new Error('SerializedBlockEntity: y must be an integer');
  }
  if (!isFiniteInteger(r.z)) {
    throw new Error('SerializedBlockEntity: z must be an integer');
  }
  if (r.data === undefined) {
    throw new Error('SerializedBlockEntity: data must be present');
  }

  return {
    schemaVersion: r.schemaVersion as number,
    typeKey: r.typeKey as string,
    x: r.x as number,
    y: r.y as number,
    z: r.z as number,
    data: r.data,
  };
}

/**
 * Validate an unknown value as a `BlockEntityChunkRecord`. Returns the same value (narrowed) on
 * success; throws a descriptive `Error` on any invalid field. Validates every contained entity.
 */
export function validateBlockEntityChunkRecord(input: unknown): BlockEntityChunkRecord {
  if (typeof input !== 'object' || input === null) {
    throw new Error('BlockEntityChunkRecord: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (typeof r.worldId !== 'string' || r.worldId.length === 0) {
    throw new Error('BlockEntityChunkRecord: worldId must be a non-empty string');
  }
  if (!isFiniteInteger(r.chunkX)) {
    throw new Error('BlockEntityChunkRecord: chunkX must be an integer');
  }
  if (!isFiniteInteger(r.chunkZ)) {
    throw new Error('BlockEntityChunkRecord: chunkZ must be an integer');
  }
  if (!Array.isArray(r.entities)) {
    throw new Error('BlockEntityChunkRecord: entities must be an array');
  }

  const entities = (r.entities as unknown[]).map((e) => validateSerializedBlockEntity(e));
  return {
    worldId: r.worldId as string,
    chunkX: r.chunkX as number,
    chunkZ: r.chunkZ as number,
    entities,
    // `key` is derived by the repository; accept it if present, otherwise it is filled on write.
    key: typeof r.key === 'string' ? (r.key as string) : `${r.worldId}|${r.chunkX}|${r.chunkZ}`,
  };
}
