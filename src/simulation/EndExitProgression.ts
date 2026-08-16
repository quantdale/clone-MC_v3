/**
 * End exit progression (184): the End arc's capstone — the exit portal (spawns when 183's return
 * gateway opens), the return teleport destination (the overworld spawn, the inverse of 182's
 * entry), and the persisted boss-completion record (the post-boss state surviving save/reload).
 *
 * - **Exit portal**: `endExitPortalCells` is vanilla's exit-portal shape — a 5×5 of end-portal
 *   blocks with the four corners missing (21 cells). `endExitPortalSpawns(gatewayOpen)` is the
 *   explicit spawn condition (the wiring passes 183's `dragonReturnGatewayOpen`); the portal
 *   persists afterwards via `endExitPortalRemains`.
 * - **Return**: `endExitDestination(worldSpawn)` returns the given overworld spawn unchanged when
 *   finite, else `null` (the wiring applies the teleport).
 * - **Completion persistence**: `markDragonDefeated(state, tick)` produces a
 *   `DragonCompletionRecord` exactly when the boss is `DEFEATED`; `serializeDragonCompletion`/
 *   `deserializeDragonCompletion` are the versioned, validated persistence pair (mirroring 153's
 *   `serializeBoss`/`deserializeBoss`); `dragonCompletionIsDefeated` reads the record; a defeated
 *   record keeps the exit portal present.
 */
import type { BossState } from './BossFramework';
import { dragonDefeated } from './EnderDragon';

/** The exit portal's ring size (5×5 with corners missing). */
export const END_EXIT_PORTAL_RING_SIZE = 5;
/** Serialized completion-record version; bump with migration rules when the format changes. */
export const END_EXIT_PORTAL_VERSION = 1;

/**
 * The 21 exit-portal cells at `y` around (centerX, centerZ): the full 5×5 minus the four corners
 * (vanilla's exit-portal shape).
 */
export function endExitPortalCells(
  centerX: number,
  y: number,
  centerZ: number,
): ReadonlyArray<readonly [number, number, number]> {
  const cells: Array<readonly [number, number, number]> = [];
  const half = Math.floor(END_EXIT_PORTAL_RING_SIZE / 2);
  for (let dx = -half; dx <= half; dx++) {
    for (let dz = -half; dz <= half; dz++) {
      const isCorner = Math.abs(dx) === half && Math.abs(dz) === half;
      if (!isCorner) cells.push([centerX + dx, y, centerZ + dz]);
    }
  }
  return cells;
}

/** The exit portal spawns exactly when the return gateway is open (the wiring passes 183's value). */
export function endExitPortalSpawns(gatewayOpen: boolean): boolean {
  return gatewayOpen;
}

/**
 * The return teleport destination: the overworld spawn, returned unchanged when its coordinates
 * are finite; `null` for non-finite input (a wiring caller must handle the no-destination case).
 */
export function endExitDestination(
  worldSpawn: readonly [number, number, number],
): readonly [number, number, number] | null {
  const [x, y, z] = worldSpawn;
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

/** The persisted post-boss state: did the dragon die, and when. */
export interface DragonCompletionRecord {
  readonly dragonKey: string;
  readonly defeated: boolean;
  readonly defeatedTick: number;
}

/** Versioned serialized form of the completion record. */
export interface SerializedDragonCompletion {
  version: 1;
  dragonKey: string;
  defeated: boolean;
  defeatedTick: number;
}

/**
 * Produce the completion record exactly when `state` is `DEFEATED` (183's `dragonDefeated`), with
 * the tick the defeat was observed; `null` otherwise (a living fight has no record).
 */
export function markDragonDefeated(state: BossState, tick: number): DragonCompletionRecord | null {
  if (!dragonDefeated(state)) return null;
  return { dragonKey: state.bossKey, defeated: true, defeatedTick: tick };
}

/** Whether the completion record says the dragon is defeated. */
export function dragonCompletionIsDefeated(record: DragonCompletionRecord): boolean {
  return record.defeated;
}

/** Whether the exit portal should remain: a defeated completion record exists. */
export function endExitPortalRemains(record: DragonCompletionRecord | null): boolean {
  return record !== null && dragonCompletionIsDefeated(record);
}

/** Serialize a completion record (identity-shaped; validation happens on deserialize). */
export function serializeDragonCompletion(record: DragonCompletionRecord): SerializedDragonCompletion {
  return { version: END_EXIT_PORTAL_VERSION as 1, ...record };
}

/**
 * Validate and restore a serialized completion record. The whole payload is validated first; any
 * malformed field throws a descriptive `Error` and the record is never partially accepted.
 */
export function deserializeDragonCompletion(input: unknown): DragonCompletionRecord {
  if (typeof input !== 'object' || input === null) {
    throw new Error('DragonCompletion: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== END_EXIT_PORTAL_VERSION) {
    throw new Error(`DragonCompletion: unsupported version ${String(r.version)}`);
  }
  if (typeof r.dragonKey !== 'string' || r.dragonKey.length === 0) {
    throw new Error('DragonCompletion: dragonKey must be a non-empty string');
  }
  if (typeof r.defeated !== 'boolean') {
    throw new Error('DragonCompletion: defeated must be a boolean');
  }
  if (!Number.isInteger(r.defeatedTick) || (r.defeatedTick as number) < 0) {
    throw new Error('DragonCompletion: defeatedTick must be a non-negative integer');
  }
  return { dragonKey: r.dragonKey, defeated: r.defeated, defeatedTick: r.defeatedTick as number };
}
