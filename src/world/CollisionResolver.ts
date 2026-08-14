/**
 * Shape-aware axis-aligned collision resolution (057). A `CollisionResolver` moves a `CollisionBox`
 * through a `ShapeWorld` (block cell → 056 `VoxelShape`), resolving movement axis-separated
 * (X → Y → Z) with face snapping: a collided axis is clamped to the shape face and flagged, while the
 * other axes keep their deltas. Deterministic and headless-testable with fixture shape worlds.
 */
import { VoxelShape, type Aabb } from './VoxelShape';

/** A world that answers each block cell's collision shape. */
export interface ShapeWorld {
  getCollisionShape(x: number, y: number, z: number): VoxelShape;
}

/** An axis-aligned entity box (world coordinates; `x/y/z` is the minimum corner). */
export interface CollisionBox {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

/** Result of one `move`: final position plus per-axis collision flags. */
export interface MovementResult {
  x: number;
  y: number;
  z: number;
  collidedX: boolean;
  collidedY: boolean;
  collidedZ: boolean;
}

function assertBox(box: CollisionBox): void {
  if (!(box.width > 0) || !(box.height > 0) || !(box.depth > 0)) {
    throw new RangeError(`CollisionResolver: box dimensions must be positive (${box.width}x${box.height}x${box.depth})`);
  }
}

/** Axis-separated movement resolution against per-block collision shapes. */
export class CollisionResolver {
  private readonly epsilon: number;

  constructor(opts: { epsilon?: number } = {}) {
    this.epsilon = opts.epsilon ?? 0.001;
  }

  /**
   * Move `box` by `(dx, dy, dz)`, resolving X, then Y, then Z. Returns the final position and
   * per-axis collision flags. `box` is not mutated.
   */
  move(world: ShapeWorld, box: CollisionBox, dx: number, dy: number, dz: number): MovementResult {
    assertBox(box);

    let x = box.x;
    let y = box.y;
    let z = box.z;

    if (dx !== 0) x = this.resolveAxis(world, x, y, z, box, 'x', dx);
    if (dy !== 0) y = this.resolveAxis(world, x, y, z, box, 'y', dy);
    if (dz !== 0) z = this.resolveAxis(world, x, y, z, box, 'z', dz);

    const collidedX = dx !== 0 && Math.abs(x - (box.x + dx)) > 1e-9;
    const collidedY = dy !== 0 && Math.abs(y - (box.y + dy)) > 1e-9;
    const collidedZ = dz !== 0 && Math.abs(z - (box.z + dz)) > 1e-9;
    return { x, y, z, collidedX, collidedY, collidedZ };
  }

  /** True when `box` overlaps any shape box in any overlapped cell (boundary-inclusive). */
  collides(world: ShapeWorld, box: CollisionBox): boolean {
    assertBox(box);
    const eps = this.epsilon;
    const minX = box.x;
    const minY = box.y;
    const minZ = box.z;
    const maxX = box.x + box.width;
    const maxY = box.y + box.height;
    const maxZ = box.z + box.depth;

    for (let cx = Math.floor(minX - eps); cx <= Math.floor(maxX + eps); cx++) {
      for (let cy = Math.floor(minY - eps); cy <= Math.floor(maxY + eps); cy++) {
        for (let cz = Math.floor(minZ - eps); cz <= Math.floor(maxZ + eps); cz++) {
          const shape = world.getCollisionShape(cx, cy, cz);
          if (shape.isEmpty) continue;
          if (shape.intersects(minX, minY, minZ, maxX, maxY, maxZ)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Resolve one axis of movement. Cells along the whole swept path (start → final) are scanned;
   * faces ahead of the start clamp the final position to the face boundary. `axis` selects the
   * moving dimension.
   */
  private resolveAxis(
    world: ShapeWorld,
    x: number,
    y: number,
    z: number,
    box: CollisionBox,
    axis: 'x' | 'y' | 'z',
    delta: number,
  ): number {
    const start = axis === 'x' ? x : axis === 'y' ? y : z;
    const size = axis === 'x' ? box.width : axis === 'y' ? box.height : box.depth;
    let final = start + delta;

    // Non-moving axes, epsilon-inset to avoid edge-grazing false positives.
    const minX = x + this.epsilon;
    const minY = y + this.epsilon;
    const minZ = z + this.epsilon;
    const maxX = x + box.width - this.epsilon;
    const maxY = y + box.height - this.epsilon;
    const maxZ = z + box.depth - this.epsilon;

    // Swept range along the moving axis (start position to final position).
    const scanMin = Math.min(start, final) - this.epsilon;
    const scanMax = Math.max(start + size, final + size) + this.epsilon;

    for (let c1 = Math.floor(scanMin); c1 <= Math.floor(scanMax); c1++) {
      for (let c2 = Math.floor(axis === 'x' ? minZ : minX); c2 <= Math.floor(axis === 'x' ? maxZ : maxX); c2++) {
        for (let c3 = Math.floor(axis === 'y' ? minZ : minY); c3 <= Math.floor(axis === 'y' ? maxZ : maxY); c3++) {
          const cx = axis === 'x' ? c1 : axis === 'y' ? c2 : c3;
          const cy = axis === 'y' ? c1 : axis === 'x' ? c3 : c2;
          const cz = axis === 'z' ? c1 : axis === 'x' ? c2 : c3;
          const shape = world.getCollisionShape(cx, cy, cz);
          if (shape.isEmpty) continue;

          for (const aabb of shape.boxes) {
            const face = translate(aabb, cx, cy, cz);
            if (!overlapsOnOtherAxes(axis, face, minX, minY, minZ, maxX, maxY, maxZ)) {
              continue;
            }
            if (delta > 0) {
              // Moving forward: the box's leading edge (start + size) must not pass the face.
              const faceMin = axis === 'x' ? face.minX : axis === 'y' ? face.minY : face.minZ;
              if (faceMin > start && final > faceMin - size) {
                final = Math.min(final, faceMin - size);
              }
            } else {
              // Moving backward: the box's trailing edge (start) must not pass the face.
              const faceMax = axis === 'x' ? face.maxX : axis === 'y' ? face.maxY : face.maxZ;
              if (faceMax < start + size && final < faceMax) {
                final = Math.max(final, faceMax);
              }
            }
          }
        }
      }
    }

    return final;
  }
}

function translate(aabb: Aabb, cx: number, cy: number, cz: number): Aabb {
  return {
    minX: aabb.minX + cx,
    minY: aabb.minY + cy,
    minZ: aabb.minZ + cz,
    maxX: aabb.maxX + cx,
    maxY: aabb.maxY + cy,
    maxZ: aabb.maxZ + cz,
  };
}

/** Whether the shape face overlaps the entity box on the two non-moving axes. */
function overlapsOnOtherAxes(
  axis: 'x' | 'y' | 'z',
  face: Aabb,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): boolean {
  if (axis === 'x') {
    return face.maxY >= minY && face.minY <= maxY && face.maxZ >= minZ && face.minZ <= maxZ;
  }
  if (axis === 'y') {
    return face.maxX >= minX && face.minX <= maxX && face.maxZ >= minZ && face.minZ <= maxZ;
  }
  return face.maxX >= minX && face.minX <= maxX && face.maxY >= minY && face.minY <= maxY;
}
