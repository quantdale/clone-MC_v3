/**
 * Shape-aware selection raycast (058). Walks the voxel grid with the Amanatides & Woo DDA (same
 * stepping as `raycastVoxel`) and, for each visited cell, intersects the ray with the cell's
 * selection `VoxelShape` boxes (056) via the slab method. The first cell with a box hit yields the
 * nearest hit: cell coordinates, the entered face's normal (pointing toward the ray origin), the
 * exact hit point, and the distance. EMPTY cells and the air part of partial shapes never hit.
 */
import { VoxelShape, type Aabb } from './VoxelShape';

/** A world that answers each block cell's selection shape. */
export interface SelectionShapeWorld {
  getSelectionShape(x: number, y: number, z: number): VoxelShape;
}

/** A shape-aware ray hit. */
export interface ShapeRayHit {
  blockX: number;
  blockY: number;
  blockZ: number;
  /** Entry-face normal, pointing toward the ray origin. */
  nx: number;
  ny: number;
  nz: number;
  /** Exact hit point. */
  pointX: number;
  pointY: number;
  pointZ: number;
  /** Distance along the (normalized) ray. */
  distance: number;
}

const EPS = 1e-9;

interface BoxHit {
  t: number;
  axis: number; // 0 = x, 1 = y, 2 = z entry axis; -1 when starting inside
}

/** Slab-method ray/AABB intersection; writes the entry `t` and entry axis into `out`. */
function intersectBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: Aabb,
  out: BoxHit,
): boolean {
  let tMin = -Infinity;
  let tMax = Infinity;
  let axis = -1;

  const entries: Array<{ origin: number; dir: number; min: number; max: number }> = [
    { origin: ox, dir: dx, min: box.minX, max: box.maxX },
    { origin: oy, dir: dy, min: box.minY, max: box.maxY },
    { origin: oz, dir: dz, min: box.minZ, max: box.maxZ },
  ];

  for (let a = 0; a < 3; a++) {
    const { origin, dir, min, max } = entries[a]!;
    if (Math.abs(dir) < EPS) {
      if (origin < min || origin > max) return false; // parallel and outside
      continue;
    }
    let t1 = (min - origin) / dir;
    let t2 = (max - origin) / dir;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = a;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (tMax < 0) return false; // box fully behind the ray
  out.t = Math.max(tMin, 0);
  out.axis = axis;
  return true;
}

/** Entry normal for a hit on `axis` moving along `dir`: points toward the ray origin. */
function entryNormal(axis: number, dir: number): number {
  if (axis < 0) return 0;
  return dir > 0 ? -1 : 1;
}

/**
 * Cast a shape-aware selection ray from `origin` along normalized `dir` up to `maxDistance`. Returns
 * the nearest box hit or `null`.
 */
export function raycastSelection(
  world: SelectionShapeWorld,
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
): ShapeRayHit | null {
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

  const length = Math.hypot(dirX, dirY, dirZ);
  if (length <= EPS) return null;
  dirX /= length;
  dirY /= length;
  dirZ /= length;

  // DDA state (mirrors `raycastVoxel`).
  let x = Math.floor(originX);
  let y = Math.floor(originY);
  let z = Math.floor(originZ);
  const stepX = dirX > 0 ? 1 : -1;
  const stepY = dirY > 0 ? 1 : -1;
  const stepZ = dirZ > 0 ? 1 : -1;
  const tDeltaX = dirX !== 0 ? Math.abs(1 / dirX) : Infinity;
  const tDeltaY = dirY !== 0 ? Math.abs(1 / dirY) : Infinity;
  const tDeltaZ = dirZ !== 0 ? Math.abs(1 / dirZ) : Infinity;
  let tMaxX = dirX !== 0 ? (stepX > 0 ? x + 1 - originX : originX - x) * tDeltaX : Infinity;
  let tMaxY = dirY !== 0 ? (stepY > 0 ? y + 1 - originY : originY - y) * tDeltaY : Infinity;
  let tMaxZ = dirZ !== 0 ? (stepZ > 0 ? z + 1 - originZ : originZ - z) * tDeltaZ : Infinity;

  const hit: BoxHit = { t: 0, axis: -1 };

  const tryCell = (cx: number, cy: number, cz: number): ShapeRayHit | null => {
    const shape = world.getSelectionShape(cx, cy, cz);
    if (shape.isEmpty) return null;

    let best: BoxHit | null = null;
    for (const box of shape.boxes) {
      const worldBox = translate(box, cx, cy, cz);
      if (!intersectBox(originX, originY, originZ, dirX, dirY, dirZ, worldBox, hit)) continue;
      if (hit.t > maxDistance) continue;
      if (best === null || hit.t < best.t) {
        best = { t: hit.t, axis: hit.axis };
      }
    }
    if (best === null) return null;

    const dirOnAxis = best.axis === 0 ? dirX : best.axis === 1 ? dirY : dirZ;
    const nx = entryNormal(best.axis, dirOnAxis);
    return {
      blockX: cx,
      blockY: cy,
      blockZ: cz,
      nx,
      ny: best.axis === 1 ? nx : 0,
      nz: best.axis === 2 ? nx : 0,
      pointX: originX + dirX * best.t,
      pointY: originY + dirY * best.t,
      pointZ: originZ + dirZ * best.t,
      distance: best.t,
    };
  };

  // Starting cell first (hit at t = 0 inside the shape yields a zero normal).
  const startHit = tryCell(x, y, z);
  if (startHit) return startHit;

  let t = 0;
  for (let i = 0; i < 10000; i++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
    }

    if (t > maxDistance) return null;

    const cellHit = tryCell(x, y, z);
    if (cellHit) return cellHit;
  }

  return null;
}

function translate(box: Aabb, cx: number, cy: number, cz: number): Aabb {
  return {
    minX: box.minX + cx,
    minY: box.minY + cy,
    minZ: box.minZ + cz,
    maxX: box.maxX + cx,
    maxY: box.maxY + cy,
    maxZ: box.maxZ + cz,
  };
}
