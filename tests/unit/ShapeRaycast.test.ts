import { describe, it, expect } from 'vitest';
import { raycastSelection, type SelectionShapeWorld } from '../../src/world/ShapeRaycast';
import { VoxelShape } from '../../src/world/VoxelShape';

function shapeWorld(shapes: Record<string, VoxelShape>): SelectionShapeWorld {
  return {
    getSelectionShape: (x, y, z) => shapes[`${x},${y},${z}`] ?? VoxelShape.EMPTY,
  };
}

const SLAB = VoxelShape.of([{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 }]);

describe('raycastSelection', () => {
  it('hits the near face of a full cube with correct distance, normal, and point', () => {
    const world = shapeWorld({ '5,0,0': VoxelShape.FULL_CUBE });
    const hit = raycastSelection(world, 4, 0.5, 0.5, 1, 0, 0, 10);

    expect(hit).not.toBeNull();
    expect(hit!.blockX).toBe(5);
    expect(hit!.blockY).toBe(0);
    expect(hit!.blockZ).toBe(0);
    expect(hit!.distance).toBeCloseTo(1, 6);
    expect(hit!.nx).toBe(-1);
    expect(hit!.ny).toBe(0);
    expect(hit!.nz).toBe(0);
    expect(hit!.pointX).toBeCloseTo(5, 6);
    expect(hit!.pointY).toBeCloseTo(0.5, 6);
  });

  it('is shape-aware: a ray above a slab passes through; at slab height it hits', () => {
    const world = shapeWorld({ '0,0,0': SLAB });

    const above = raycastSelection(world, -2, 0.75, 0.5, 1, 0, 0, 10);
    expect(above).toBeNull(); // air part of the slab cell

    const atHeight = raycastSelection(world, -2, 0.25, 0.5, 1, 0, 0, 10);
    expect(atHeight).not.toBeNull();
    expect(atHeight!.blockX).toBe(0);
    expect(atHeight!.distance).toBeCloseTo(2, 6);
    expect(atHeight!.nx).toBe(-1);
    expect(atHeight!.pointY).toBeCloseTo(0.25, 6);
  });

  it('returns the nearest cell along the ray', () => {
    const world = shapeWorld({
      '3,0,0': VoxelShape.FULL_CUBE,
      '6,0,0': VoxelShape.FULL_CUBE,
    });
    const hit = raycastSelection(world, 2, 0.5, 0.5, 1, 0, 0, 10);

    expect(hit!.blockX).toBe(3);
    expect(hit!.distance).toBeCloseTo(1, 6);
  });

  it('respects maxDistance', () => {
    const world = shapeWorld({ '6,0,0': VoxelShape.FULL_CUBE });

    expect(raycastSelection(world, 0, 0.5, 0.5, 1, 0, 0, 5)).toBeNull();
    const hit = raycastSelection(world, 0, 0.5, 0.5, 1, 0, 0, 6.1);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(6, 6);
  });

  it('hits the top face of a slab from above (normal -Y)', () => {
    const world = shapeWorld({ '0,0,0': SLAB });
    const hit = raycastSelection(world, 0.5, 3, 0.5, 0, -1, 0, 10);

    expect(hit).not.toBeNull();
    expect(hit!.blockY).toBe(0);
    expect(hit!.ny).toBe(1);
    expect(hit!.pointY).toBeCloseTo(0.5, 6);
    expect(hit!.distance).toBeCloseTo(2.5, 6);
  });

  it('returns null for degenerate inputs', () => {
    const world = shapeWorld({ '0,0,0': VoxelShape.FULL_CUBE });
    expect(raycastSelection(world, 0, 0, 0, 0, 0, 0, 10)).toBeNull(); // zero direction
    expect(raycastSelection(world, NaN, 0, 0, 1, 0, 0, 10)).toBeNull();
    expect(raycastSelection(world, 0, 0, 0, 1, 0, 0, -1)).toBeNull();
    expect(raycastSelection(world, 0, 0, 0, 1, 0, 0, NaN)).toBeNull();
  });
});
