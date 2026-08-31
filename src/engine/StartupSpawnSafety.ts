/**
 * Startup player-position safety (257).
 *
 * Deterministic, bounded validation for candidate player positions at world
 * startup — spawn selection and persisted-player restoration alike. A
 * structurally valid saved XYZ is NOT sufficient: the candidate must have
 * (a) a provable supporting surface below the feet within a bounded drop, and
 * (b) a non-colliding body volume, checked against actual canonical block data
 * whenever that data exists.
 *
 * Baseline awareness comes from the world view's already-baseline-aware
 * `getMotionBlockingHeight`: a current-baseline world may predict an absent
 * column's surface from the deterministic generator (that terrain will be
 * generated), while a non-current (`legacy-unknown`/`unsupported`) world returns
 * `minY - 1` for an absent column, which can never prove support. Callers
 * relocate over proven terrain or escalate to recovery-required; they must
 * never activate an unproven position.
 */

/** Largest downward distance from the candidate feet Y to a supporting surface top that is accepted. */
export const STARTUP_MAX_SUPPORT_DROP = 4;

/** Player body half-width used for the collision-volume probe (matches Player). */
export const STARTUP_BODY_HALF_WIDTH = 0.3;

/** Player body height used for the collision-volume probe (matches Player). */
export const STARTUP_BODY_HEIGHT = 1.8;

/** Minimal world surface the safety checks need. */
export interface StartupWorldView {
  /** Block state id at the cell, or the air id outside loaded storage. */
  getBlock(x: number, y: number, z: number): number;
  /** Bounded, baseline-aware surface lookup (see `World.getMotionBlockingHeight`). */
  getMotionBlockingHeight(x: number, z: number): number;
  /** Whether canonical block data exists for the column (block probes are meaningful). */
  hasCanonicalColumn(x: number, z: number): boolean;
  dimension: { minY: number; maxY: number; containsY(y: number): boolean };
}

/** Solidity oracle over the block registry. */
export interface StartupSolidity {
  isSolid(blockId: number): boolean;
}

/** Verdict for one candidate startup position. */
export type StartupPositionVerdict =
  | 'supported'
  | 'no-support'
  | 'body-collision'
  | 'out-of-dimension';

/**
 * Evaluate one candidate position WITHOUT mutating anything.
 *
 * Support: the baseline-aware surface top `h + 1` must sit within
 * `STARTUP_MAX_SUPPORT_DROP` below the candidate feet Y (feet exactly on the
 * surface is the normal case). Body: when canonical block data exists for the
 * column, every cell overlapped by the body AABB must be non-solid. When the
 * column is absent in a current-baseline world the generator is authoritative
 * for the surface and the generated terrain is open above it, so the body probe
 * is skipped rather than failed.
 */
export function evaluateStartupPosition(
  world: StartupWorldView,
  solidity: StartupSolidity,
  x: number,
  y: number,
  z: number,
): StartupPositionVerdict {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return 'out-of-dimension';
  }
  if (!world.dimension.containsY(y) || y + STARTUP_BODY_HEIGHT > world.dimension.maxY + 1) {
    return 'out-of-dimension';
  }
  const surface = world.getMotionBlockingHeight(Math.floor(x), Math.floor(z));
  if (surface < world.dimension.minY) {
    return 'no-support';
  }
  const surfaceTop = surface + 1;
  const drop = y - surfaceTop;
  if (drop < -0.001 || drop > STARTUP_MAX_SUPPORT_DROP) {
    return 'no-support';
  }
  if (world.hasCanonicalColumn(Math.floor(x), Math.floor(z))) {
    const minX = Math.floor(x - STARTUP_BODY_HALF_WIDTH);
    const maxX = Math.floor(x + STARTUP_BODY_HALF_WIDTH);
    const minZ = Math.floor(z - STARTUP_BODY_HALF_WIDTH);
    const maxZ = Math.floor(z + STARTUP_BODY_HALF_WIDTH);
    const minYCell = Math.floor(y);
    const maxYCell = Math.floor(y + STARTUP_BODY_HEIGHT - 0.01);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let by = minYCell; by <= maxYCell; by++) {
          if (solidity.isSolid(world.getBlock(bx, by, bz))) {
            return 'body-collision';
          }
        }
      }
    }
  }
  return 'supported';
}

/**
 * Bounded deterministic nearby search for a provably safe position, used to
 * relocate an unsafe saved player before escalating to recovery-required.
 * Scans a deterministic spread around the origin (same 7/11 stride pattern as
 * `spawnPlayerSafely`), tries the baseline-aware surface position at each
 * column, and returns the first supported candidate. `null` means no safe cell
 * could be proven within the bounded attempt budget.
 */
export function findSafeStartupPositionNear(
  world: StartupWorldView,
  solidity: StartupSolidity,
  originX: number,
  originZ: number,
  maxAttempts = 128,
): { x: number; y: number; z: number } | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = originX + attempt * 7;
    const z = originZ + attempt * 11;
    const surface = world.getMotionBlockingHeight(x, z);
    if (surface < world.dimension.minY) {
      continue;
    }
    const y = Math.min(surface + 1, world.dimension.maxY + 1);
    if (evaluateStartupPosition(world, solidity, x, y, z) === 'supported') {
      return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  return null;
}
