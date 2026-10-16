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
  return intersectBoxDirect(
    ox, oy, oz, dx, dy, dz,
    box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ,
    out,
  );
}

function intersectBoxDirect(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  out: BoxHit,
): boolean {
  let tMin = -Infinity;
  let tMax = Infinity;
  let axis = -1;

  // X axis
  if (Math.abs(dx) < EPS) {
    if (ox < minX || ox > maxX) return false;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = 0;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  // Y axis
  if (Math.abs(dy) < EPS) {
    if (oy < minY || oy > maxY) return false;
  } else {
    let t1 = (minY - oy) / dy;
    let t2 = (maxY - oy) / dy;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = 1;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  // Z axis
  if (Math.abs(dz) < EPS) {
    if (oz < minZ || oz > maxZ) return false;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = 2;
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

/** Result of a ray vs box-list intersection: entry distance plus face normal. */
export interface RayBoxesHit {
  /** Distance along the (normalized) ray to the nearest box entry. */
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Per-cell shape intersection routine: intersect a normalized ray with an
 * ordered list of AABBs (already in world coordinates) via the slab method.
 * Returns the nearest hit's distance and entry-face normal (pointing toward
 * the origin), or `null` when no box is hit within `maxT`. Deterministic:
 * ties resolve to the earliest box in the list.
 */
export function intersectRayBoxes(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  boxes: readonly Aabb[],
  maxT: number,
): RayBoxesHit | null {
  let bestT = Infinity;
  let bestAxis = -1;
  const hit: BoxHit = { t: 0, axis: -1 };
  for (const candidate of boxes) {
    if (!intersectBox(ox, oy, oz, dx, dy, dz, candidate, hit)) continue;
    if (hit.t > maxT) continue;
    if (hit.t < bestT) {
      bestT = hit.t;
      bestAxis = hit.axis;
    }
  }
  if (bestAxis === -1) return null;
  const dirOnAxis = bestAxis === 0 ? dx : bestAxis === 1 ? dy : dz;
  const n = entryNormal(bestAxis, dirOnAxis);
  return {
    t: bestT,
    nx: bestAxis === 0 ? n : 0,
    ny: bestAxis === 1 ? n : 0,
    nz: bestAxis === 2 ? n : 0,
  };
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

    let bestT = Infinity;
    let bestAxis = -1;
    for (const b of shape.boxes) {
      if (
        !intersectBoxDirect(
          originX, originY, originZ,
          dirX, dirY, dirZ,
          b.minX + cx, b.maxX + cx,
          b.minY + cy, b.maxY + cy,
          b.minZ + cz, b.maxZ + cz,
          hit,
        )
      ) {
        continue;
      }
      if (hit.t > maxDistance) continue;
      if (hit.t < bestT) {
        bestT = hit.t;
        bestAxis = hit.axis;
      }
    }
    if (bestAxis === -1) return null;

    const dirOnAxis = bestAxis === 0 ? dirX : bestAxis === 1 ? dirY : dirZ;
    const n = entryNormal(bestAxis, dirOnAxis);
    return {
      blockX: cx,
      blockY: cy,
      blockZ: cz,
      nx: bestAxis === 0 ? n : 0,
      ny: bestAxis === 1 ? n : 0,
      nz: bestAxis === 2 ? n : 0,
      pointX: originX + dirX * bestT,
      pointY: originY + dirY * bestT,
      pointZ: originZ + dirZ * bestT,
      distance: bestT,
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
