/**
 * Immutable composable voxel shapes (056). A `VoxelShape` is an ordered list of axis-aligned boxes in
 * block-local unit coordinates `[0, 1]³`, used for collision, selection, and occlusion. Shapes are
 * validated and frozen at construction; `union` composes without mutating inputs; queries are
 * boundary-inclusive. `FULL_CUBE`/`EMPTY` are the canonical constants.
 */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function isFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Validate and freeze one box (copied values). */
function freezeBox(box: Aabb): Aabb {
  const values: Array<[keyof Aabb, number]> = [
    ['minX', box.minX],
    ['minY', box.minY],
    ['minZ', box.minZ],
    ['maxX', box.maxX],
    ['maxY', box.maxY],
    ['maxZ', box.maxZ],
  ];
  for (const [key, value] of values) {
    if (!isFinite(value)) {
      throw new Error(`VoxelShape: box ${key} must be finite (got ${String(value)})`);
    }
  }
  if (box.minX > box.maxX || box.minY > box.maxY || box.minZ > box.maxZ) {
    throw new Error(`VoxelShape: box min must not exceed max (${box.minX},${box.minY},${box.minZ}..${box.maxX},${box.maxY},${box.maxZ})`);
  }
  return Object.freeze({ ...box });
}

/** Immutable list of axis-aligned boxes defining a block's volume. */
export class VoxelShape {
  private readonly shapeBoxes: readonly Aabb[];

  private constructor(boxes: readonly Aabb[]) {
    this.shapeBoxes = boxes;
  }

  /** Build a shape from boxes (copied, validated, frozen). */
  static of(boxes: Aabb[]): VoxelShape {
    return new VoxelShape(Object.freeze(boxes.map(freezeBox)));
  }

  /** The empty shape (no volume). */
  static get EMPTY(): VoxelShape {
    return VoxelShape.emptyShape;
  }

  /** The full unit cube `[0,0,0]..[1,1,1]`. */
  static get FULL_CUBE(): VoxelShape {
    return VoxelShape.fullCubeShape;
  }

  private static readonly emptyShape: VoxelShape = new VoxelShape(Object.freeze([]));
  private static readonly fullCubeShape: VoxelShape = VoxelShape.of([
    { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  ]);

  /** True when the shape has no boxes. */
  get isEmpty(): boolean {
    return this.shapeBoxes.length === 0;
  }

  /** The shape's boxes (read-only, frozen). */
  get boxes(): readonly Aabb[] {
    return this.shapeBoxes;
  }

  /** Compose with `other` by concatenating box lists; neither input is mutated. */
  union(other: VoxelShape): VoxelShape {
    return new VoxelShape(Object.freeze([...this.shapeBoxes, ...other.shapeBoxes]));
  }

  /** True when any box overlaps the query AABB (boundaries inclusive). */
  intersects(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    for (const box of this.shapeBoxes) {
      if (
        box.maxX >= minX &&
        box.minX <= maxX &&
        box.maxY >= minY &&
        box.minY <= maxY &&
        box.maxZ >= minZ &&
        box.minZ <= maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  /** True when the point lies inside any box (boundaries inclusive). */
  contains(x: number, y: number, z: number): boolean {
    for (const box of this.shapeBoxes) {
      if (
        x >= box.minX && x <= box.maxX &&
        y >= box.minY && y <= box.maxY &&
        z >= box.minZ && z <= box.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  /** The highest `maxY` across boxes; `0` for the empty shape. */
  maxY(): number {
    let top = 0;
    for (const box of this.shapeBoxes) {
      if (box.maxY > top) top = box.maxY;
    }
    return top;
  }
}
