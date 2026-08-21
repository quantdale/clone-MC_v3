/**
 * Immutable composable voxel shapes (056). A `VoxelShape` is an ordered list of axis-aligned boxes in
 * block-local unit coordinates `[0, 1]³`, used for collision, selection, and occlusion. Shapes are
 * validated and frozen at construction; `union` composes without mutating inputs; queries are
 * boundary-inclusive. `FULL_CUBE`/`EMPTY` are the canonical constants.
 */
import { BlockId } from './BlockRegistry';
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

  /** Builder alias for `of`; reads naturally at call sites (`VoxelShape.boxes(...)`). */
  static boxes(...parts: Aabb[]): VoxelShape {
    return VoxelShape.of(parts);
  }

  /** Compose two shapes without mutating either input. */
  static union(a: VoxelShape, b: VoxelShape): VoxelShape {
    return a.union(b);
  }
}

/** Convenience box literal (all bounds required, validated by `VoxelShape.of`). */
export function box(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): Aabb {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Common partial-shape builders in block-local unit coordinates. */
export const ShapeBuilders = {
  /** Bottom slab: `[0,h]` vertically (default half block). */
  slabBottom(h = 0.5): VoxelShape {
    return VoxelShape.boxes(box(0, 0, 0, 1, h, 1));
  },
  /** Top slab: `[1-h,1]` vertically. */
  slabTop(h = 0.5): VoxelShape {
    return VoxelShape.boxes(box(0, 1 - h, 0, 1, 1, 1));
  },
  /** Thin flat covering on the floor (carpet/pressure-plate style). */
  carpet(thickness = 0.0625, inset = 0): VoxelShape {
    return VoxelShape.boxes(box(inset, 0, inset, 1 - inset, thickness, 1 - inset));
  },
  /** Central post of a fence/wall: full height, square cross-section centered in the cell. */
  post(width = 0.375, height = 1): VoxelShape {
    const lo = (1 - width) / 2;
    return VoxelShape.boxes(box(lo, 0, lo, lo + width, height, lo + width));
  },
  /** Horizontal arm connecting the post toward one face (fence/wall rails). */
  arm(direction: 'north' | 'south' | 'east' | 'west', width = 0.375, y0 = 0.375, y1 = 0.5625): VoxelShape {
    const lo = (1 - width) / 2;
    const hi = lo + width;
    switch (direction) {
      case 'north':
        return VoxelShape.boxes(box(lo, y0, 0, hi, y1, 0.5));
      case 'south':
        return VoxelShape.boxes(box(lo, y0, 0.5, hi, y1, 1));
      case 'west':
        return VoxelShape.boxes(box(0, y0, lo, 0.5, y1, hi));
      case 'east':
        return VoxelShape.boxes(box(0.5, y0, lo, 1, y1, hi));
    }
  },
};

/**
 * Build the default partial-shape registrations for every non-cube block in
 * {@link createDefaultBlockRegistry}. Keyed by stable `BlockId`; entries are
 * written once at build time so the returned table is immutable afterwards and
 * lookups stay O(1) map probes on integer ids. Unregistered ids answer the
 * table defaults (full cube).
 *
 * Registration rationale (Phase 11.2):
 * - Crops (wheat, nether wart), fire and redstone components: collision EMPTY
 *   (walk-through), small selection box, occlusion EMPTY.
 * - Fluids (water, lava): every variant EMPTY — player interaction runs
 *   through the medium system, not collision shapes.
 * - Farmland: bottom slab of 15/16 height (the vanilla furrow depth),
 *   collision and selection alike.
 * - Chest/furnace: a slightly-inset full-height box (14/16 cross-section),
 *   collision and selection alike.
 * - Rails/pressure plates/wire: flat carpet-style selection, EMPTY collision,
 *   EMPTY occlusion.
 *
 * Deliberately left unregistered (full-cube fallback):
 * - Doors, trapdoors, pistons, hoppers/droppers/dispensers: their true shape
 *   depends on block state (`open`, `facing`, `extended`) which the id-keyed
 *   table cannot express yet; per-state shapes arrive with the block-state
 *   shape work.
 * - Snow: registered here as the full "Snow Block", not a layer.
 */
export function createDefaultBlockShapeTable(): BlockShapeTable {
  const empty = VoxelShape.EMPTY;
  const cropSelection = VoxelShape.boxes(box(1 / 16, 0, 1 / 16, 15 / 16, 0.75, 15 / 16));
  const flatSelection = ShapeBuilders.carpet(1 / 16);
  const containerBox = ShapeBuilders.post(14 / 16, 1);
  return new BlockShapeTable()
    // Air: never targetable/collidable — the table's unregistered fallback is
    // FULL_CUBE, which would otherwise make every empty cell a raycast hit.
    .set(BlockId.Air, { collision: empty, selection: empty, occlusion: empty })
    // Fluids: fully handled by the medium system.
    .set(BlockId.Water, { collision: empty, selection: empty, occlusion: empty })
    .set(BlockId.Lava, { collision: empty, selection: empty, occlusion: empty })
    // Crops: walk-through, small selectable volume.
    .set(BlockId.Wheat, { collision: empty, selection: cropSelection, occlusion: empty })
    .set(BlockId.NetherWart, { collision: empty, selection: cropSelection, occlusion: empty })
    // Fire: never collides, tiny selectable core.
    .set(BlockId.Fire, { collision: empty, selection: ShapeBuilders.post(0.25, 0.5), occlusion: empty })
    // Farmland: 15/16-high bottom slab.
    .set(BlockId.Farmland, { collision: ShapeBuilders.slabBottom(15 / 16), selection: ShapeBuilders.slabBottom(15 / 16) })
    // Containers: slightly inset, full height.
    .set(BlockId.Chest, { collision: containerBox, selection: containerBox })
    .set(BlockId.Furnace, { collision: containerBox, selection: containerBox })
    // Redstone components: no collision, small selection, no occlusion.
    .set(BlockId.RedstoneWire, { collision: empty, selection: flatSelection, occlusion: empty })
    .set(BlockId.RedstoneTorch, { collision: empty, selection: ShapeBuilders.post(0.125, 0.625), occlusion: empty })
    .set(BlockId.Lever, { collision: empty, selection: ShapeBuilders.post(0.25, 0.5), occlusion: empty })
    .set(BlockId.StoneButton, { collision: empty, selection: ShapeBuilders.post(0.25, 0.25), occlusion: empty })
    .set(BlockId.PressurePlate, { collision: empty, selection: flatSelection, occlusion: empty })
    .set(BlockId.RedstoneRepeater, { collision: empty, selection: ShapeBuilders.carpet(2 / 16), occlusion: empty })
    .set(BlockId.RedstoneComparator, { collision: empty, selection: ShapeBuilders.carpet(2 / 16), occlusion: empty })
    // Rails: flat selection only.
    .set(BlockId.Rail, { collision: empty, selection: flatSelection, occlusion: empty });
}

/**
 * Per-block shape variants. A block may declare distinct collision, selection
 * and occlusion shapes; any omitted variant falls back to the table default.
 */
export interface BlockShapeVariants {
  collision?: VoxelShape;
  selection?: VoxelShape;
  occlusion?: VoxelShape;
}

/**
 * Immutable-style registry table keyed by numeric block id. Entries are set at
 * registration time and never mutated afterwards; unregistered ids answer the
 * sane defaults (full cube) so callers only register deviations such as EMPTY
 * for air/fluids or partial boxes for slabs/fences/carpets.
 */
export class BlockShapeTable {
  private readonly entries = new Map<number, Required<BlockShapeVariants>>();

  /** Register (or replace) the variants for one block id. Chainable. */
  set(blockId: number, variants: BlockShapeVariants): this {
    this.entries.set(blockId, Object.freeze({
      collision: variants.collision ?? VoxelShape.FULL_CUBE,
      selection: variants.selection ?? variants.collision ?? VoxelShape.FULL_CUBE,
      occlusion: variants.occlusion ?? variants.collision ?? VoxelShape.FULL_CUBE,
    }));
    return this;
  }

  has(blockId: number): boolean {
    return this.entries.has(blockId);
  }

  getCollisionShape(blockId: number): VoxelShape {
    return this.entries.get(blockId)?.collision ?? VoxelShape.FULL_CUBE;
  }

  getSelectionShape(blockId: number): VoxelShape {
    return this.entries.get(blockId)?.selection ?? VoxelShape.FULL_CUBE;
  }

  getOcclusionShape(blockId: number): VoxelShape {
    return this.entries.get(blockId)?.occlusion ?? VoxelShape.FULL_CUBE;
  }
}
