/**
 * Persistence envelope for entities (037). A live entity instance and its behavior are owned by a
 * future entity framework (129+); here the store only needs a decoupled, forward-compatible
 * envelope: a registry `typeKey`, world coordinates, and an opaque `data` payload.
 *
 * Entities are sparse and positional, so they are persisted grouped per chunk in an
 * `EntityChunkRecord` keyed by `worldId|chunkX|chunkZ` — matching the chunk granularity used by the
 * streaming (033), chunk-section (035), and block-entity (036) stores, which keeps autosave (038/039)
 * writes bounded.
 */

/** Current persistence schema version for a stored entity. */
export const ENTITY_RECORD_VERSION = 1;

/** A single persisted entity: a typed, positioned, opaque-payload envelope. */
export interface SerializedEntity {
  /** Persistence schema version (starts at 1). */
  schemaVersion: number;
  /** Entity type registry key, e.g. `minecraft:zombie`. */
  typeKey: string;
  /** World X of the entity. */
  x: number;
  /** World Y of the entity. */
  y: number;
  /** World Z of the entity. */
  z: number;
  /** Opaque entity payload; the owning framework defines its shape per `typeKey`. */
  data: unknown;
}

/** A chunk's persisted entity group. */
export interface EntityChunkRecord {
  /** `${worldId}|${chunkX}|${chunkZ}`. */
  key: string;
  /** Owning world identifier (also encoded in `key`). */
  worldId: string;
  /** Chunk X coordinate. */
  chunkX: number;
  /** Chunk Z coordinate. */
  chunkZ: number;
  /** Entities located within this chunk. */
  entities: SerializedEntity[];
}

function isFiniteInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

/**
 * Validate an unknown value as a `SerializedEntity`. Returns the same value (narrowed) on success;
 * throws a descriptive `Error` on any invalid field. Does not coerce types.
 */
export function validateSerializedEntity(input: unknown): SerializedEntity {
  if (typeof input !== 'object' || input === null) {
    throw new Error('SerializedEntity: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (!isFiniteInteger(r.schemaVersion) || (r.schemaVersion as number) < 1) {
    throw new Error('SerializedEntity: schemaVersion must be a positive integer');
  }
  if (typeof r.typeKey !== 'string' || r.typeKey.length === 0) {
    throw new Error('SerializedEntity: typeKey must be a non-empty string');
  }
  if (!isFiniteInteger(r.x)) {
    throw new Error('SerializedEntity: x must be an integer');
  }
  if (!isFiniteInteger(r.y)) {
    throw new Error('SerializedEntity: y must be an integer');
  }
  if (!isFiniteInteger(r.z)) {
    throw new Error('SerializedEntity: z must be an integer');
  }
  if (r.data === undefined) {
    throw new Error('SerializedEntity: data must be present');
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
 * Validate an unknown value as an `EntityChunkRecord`. Returns the same value (narrowed) on success;
 * throws a descriptive `Error` on any invalid field. Validates every contained entity.
 */
export function validateEntityChunkRecord(input: unknown): EntityChunkRecord {
  if (typeof input !== 'object' || input === null) {
    throw new Error('EntityChunkRecord: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (typeof r.worldId !== 'string' || r.worldId.length === 0) {
    throw new Error('EntityChunkRecord: worldId must be a non-empty string');
  }
  if (!isFiniteInteger(r.chunkX)) {
    throw new Error('EntityChunkRecord: chunkX must be an integer');
  }
  if (!isFiniteInteger(r.chunkZ)) {
    throw new Error('EntityChunkRecord: chunkZ must be an integer');
  }
  if (!Array.isArray(r.entities)) {
    throw new Error('EntityChunkRecord: entities must be an array');
  }

  const entities = (r.entities as unknown[]).map((e) => validateSerializedEntity(e));
  return {
    worldId: r.worldId as string,
    chunkX: r.chunkX as number,
    chunkZ: r.chunkZ as number,
    entities,
    // `key` is derived by the repository; accept it if present, otherwise it is filled on write.
    key: typeof r.key === 'string' ? (r.key as string) : `${r.worldId}|${r.chunkX}|${r.chunkZ}`,
  };
}
