import { CONFIG } from '../config';

/**
 * Amanatides & Woo voxel grid traversal (DDA).
 *
 * Casts a ray from an origin through the voxel grid and steps cell by cell,
 * robust to floating-point rounding. Returns the position of the first solid
 * block intersected and the face normal of the block that was hit.
 */

export interface RaycastResult {
  /** Block coordinates of the first solid block hit. */
  blockX: number;
  blockY: number;
  blockZ: number;
  /** Face normal of the hit block (the face the ray entered through). */
  nx: number;
  ny: number;
  nz: number;
  /** Distance along the ray to the hit. */
  distance: number;
  /** Exact hit point X (present for shape-aware casts; absent otherwise). */
  hitPointX?: number;
  /** Exact hit point Y (present for shape-aware casts; absent otherwise). */
  hitPointY?: number;
  /** Exact hit point Z (present for shape-aware casts; absent otherwise). */
  hitPointZ?: number;
}

export interface BlockSampler {
  /** Returns true if the block at the given world coordinates is solid. */
  isSolid(x: number, y: number, z: number): boolean;
}

/**
 * Cast a ray from `origin` along direction `dir` (not necessarily normalized;
 * per-axis ratios are used) up to `maxDistance` blocks.
 *
 * @param sampler supplies solidity queries for the world.
 * @returns the first solid block hit, or null if none within reach.
 */
export function raycastVoxel(
  sampler: BlockSampler,
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number = CONFIG.reach,
): RaycastResult | null {
  if (
    !Number.isFinite(originX) ||
    !Number.isFinite(originY) ||
    !Number.isFinite(originZ) ||
    !Number.isFinite(dirX) ||
    !Number.isFinite(dirY) ||
    !Number.isFinite(dirZ) ||
    !Number.isFinite(maxDistance) ||
    maxDistance < 0
  ) {
    return null;
  }

  // Normalize at the boundary so the reported distance and reach limit are
  // measured in world blocks even when a caller supplies a non-unit vector.
  const directionLength = Math.hypot(dirX, dirY, dirZ);
  if (directionLength <= Number.EPSILON) {
    return null;
  }
  dirX /= directionLength;
  dirY /= directionLength;
  dirZ /= directionLength;

  // Current cell.
  let x = Math.floor(originX);
  let y = Math.floor(originY);
  let z = Math.floor(originZ);

  // Step direction and tMax / tDelta for each axis.
  const stepX = dirX > 0 ? 1 : -1;
  const stepY = dirY > 0 ? 1 : -1;
  const stepZ = dirZ > 0 ? 1 : -1;

  // Per-axis distance to the first voxel boundary.
  const tDeltaX = dirX !== 0 ? Math.abs(1 / dirX) : Infinity;
  const tDeltaY = dirY !== 0 ? Math.abs(1 / dirY) : Infinity;
  const tDeltaZ = dirZ !== 0 ? Math.abs(1 / dirZ) : Infinity;

  // Distance from ray origin to the first boundary crossed on each axis.
  let tMaxX = dirX !== 0 ? (stepX > 0 ? (x + 1 - originX) : (originX - x)) * tDeltaX : Infinity;
  let tMaxY = dirY !== 0 ? (stepY > 0 ? (y + 1 - originY) : (originY - y)) * tDeltaY : Infinity;
  let tMaxZ = dirZ !== 0 ? (stepZ > 0 ? (z + 1 - originZ) : (originZ - z)) * tDeltaZ : Infinity;

  let t = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  // Check the starting cell first.
  if (sampler.isSolid(x, y, z)) {
    return { blockX: x, blockY: y, blockZ: z, nx: 0, ny: 0, nz: 0, distance: 0 };
  }

  // Prevent infinite loops for degenerate directions.
  const maxSteps = CONFIG.maxRaySteps;
  for (let i = 0; i < maxSteps; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }

    if (t > maxDistance) {
      return null;
    }

    if (sampler.isSolid(x, y, z)) {
      return { blockX: x, blockY: y, blockZ: z, nx, ny, nz, distance: t };
    }
  }

  return null;
}
