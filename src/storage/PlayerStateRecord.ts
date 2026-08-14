/**
 * Player-state persistence envelope (040). Holds the player's spawn/position/rotation plus opaque
 * inventory and survival payloads. The payloads are validated/restored by the game runtime (existing
 * `Inventory.restore`/`Survival.restore` paths); the storage layer only requires them to be present.
 * Keyed per `worldId` in the shared `voxel-world-db` database (added at schema version 5).
 */

/** A single world's persisted player state. */
export interface PlayerStateRecord {
  /** Object-store key; equals `worldId`. */
  key: string;
  /** Owning world identifier. */
  worldId: string;
  /** World generation seed. */
  seed: number;
  /** Player position `[x, y, z]`. */
  position: [number, number, number];
  /** Player yaw in degrees. */
  yaw: number;
  /** Player pitch in degrees. */
  pitch: number;
  /** Opaque inventory snapshot payload (restored/validated by the game). */
  inventory: unknown;
  /** Opaque survival snapshot payload (restored/validated by the game). */
  survival: unknown;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isPosition(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every(isFiniteNumber);
}

/**
 * Validate an unknown value as a `PlayerStateRecord`. Returns the same value (narrowed) on success;
 * throws a descriptive `Error` on any invalid field. Does not coerce types.
 */
export function validatePlayerStateRecord(input: unknown): PlayerStateRecord {
  if (typeof input !== 'object' || input === null) {
    throw new Error('PlayerStateRecord: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (typeof r.worldId !== 'string' || r.worldId.length === 0) {
    throw new Error('PlayerStateRecord: worldId must be a non-empty string');
  }
  if (!isInteger(r.seed)) {
    throw new Error('PlayerStateRecord: seed must be an integer');
  }
  if (!isPosition(r.position)) {
    throw new Error('PlayerStateRecord: position must be an array of three finite numbers');
  }
  if (!isFiniteNumber(r.yaw)) {
    throw new Error('PlayerStateRecord: yaw must be a finite number');
  }
  if (!isFiniteNumber(r.pitch)) {
    throw new Error('PlayerStateRecord: pitch must be a finite number');
  }
  if (r.inventory === undefined) {
    throw new Error('PlayerStateRecord: inventory must be present');
  }
  if (r.survival === undefined) {
    throw new Error('PlayerStateRecord: survival must be present');
  }

  return {
    key: typeof r.key === 'string' && r.key.length > 0 ? (r.key as string) : (r.worldId as string),
    worldId: r.worldId as string,
    seed: r.seed as number,
    position: r.position as [number, number, number],
    yaw: r.yaw as number,
    pitch: r.pitch as number,
    inventory: r.inventory,
    survival: r.survival,
  };
}
