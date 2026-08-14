/**
 * Typed world-level metadata persisted in the world IndexedDB database (034). This is
 * the small per-world header record; chunk sections (035), block entities (036), and
 * entities (037) are separate stores added later under the same database. Runtime-only
 * coordination types, not persisted as game save shapes directly consumed by gameplay.
 */

/** Name of the world IndexedDB database. */
export const WORLD_DB_NAME = 'voxel-world-db';

/** Schema version of the database; bump and add an `onupgradeneeded` step to migrate. */
export const WORLD_DB_VERSION = 1;

/** Object store holding one `WorldMetadata` record per `worldId`. */
export const WORLD_METADATA_STORE = 'world-metadata';

/** A single world's persisted metadata header. */
export interface WorldMetadata {
  /** Our record schema version (starts at 1). */
  schemaVersion: number;
  /** Stable world identifier (used as the object-store key). */
  worldId: string;
  /** World generation seed. */
  seed: number;
  /** Active dimension resource id, e.g. `minecraft:overworld`. */
  dimensionId: string;
  /** Lowest block Y of the dimension. */
  minY: number;
  /** Total block height of the dimension. */
  height: number;
  /** Epoch millis when the world was created. */
  createdAt: number;
  /** Epoch millis of the last metadata update. */
  updatedAt: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Validate an unknown value as a `WorldMetadata`. Returns the same value (narrowed) on
 * success; throws a descriptive `Error` on any invalid field. Does not coerce types.
 */
export function validateWorldMetadata(input: unknown): WorldMetadata {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WorldMetadata: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (!isInteger(r.schemaVersion) || r.schemaVersion <= 0) {
    throw new Error('WorldMetadata: schemaVersion must be a positive integer');
  }
  if (!isNonEmptyString(r.worldId)) {
    throw new Error('WorldMetadata: worldId must be a non-empty string');
  }
  if (!isFiniteNumber(r.seed)) {
    throw new Error('WorldMetadata: seed must be a finite number');
  }
  if (!isNonEmptyString(r.dimensionId)) {
    throw new Error('WorldMetadata: dimensionId must be a non-empty string');
  }
  if (!isInteger(r.minY)) {
    throw new Error('WorldMetadata: minY must be an integer');
  }
  if (!isInteger(r.height) || r.height <= 0) {
    throw new Error('WorldMetadata: height must be a positive integer');
  }
  if (!isFiniteNumber(r.createdAt)) {
    throw new Error('WorldMetadata: createdAt must be a finite number');
  }
  if (!isFiniteNumber(r.updatedAt)) {
    throw new Error('WorldMetadata: updatedAt must be a finite number');
  }

  return {
    schemaVersion: r.schemaVersion,
    worldId: r.worldId,
    seed: r.seed,
    dimensionId: r.dimensionId,
    minY: r.minY,
    height: r.height,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
