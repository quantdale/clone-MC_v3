import { describe, it, expect } from 'vitest';
import { VoxelShape } from '../../src/world/VoxelShape';

describe('VoxelShape', () => {
  it('provides FULL_CUBE and EMPTY constants', () => {
    expect(VoxelShape.FULL_CUBE.contains(0.5, 0.5, 0.5)).toBe(true);
    expect(VoxelShape.FULL_CUBE.contains(1.5, 0.5, 0.5)).toBe(false);
    expect(VoxelShape.EMPTY.isEmpty).toBe(true);
    expect(VoxelShape.EMPTY.maxY()).toBe(0);
    expect(VoxelShape.FULL_CUBE.isEmpty).toBe(false);
    expect(VoxelShape.FULL_CUBE.maxY()).toBe(1);
  });

  it('rejects invalid boxes at construction', () => {
    expect(() =>
      VoxelShape.of([{ minX: 0, minY: 0, minZ: 0, maxX: NaN, maxY: 1, maxZ: 1 }]),
    ).toThrow();
    expect(() =>
      VoxelShape.of([{ minX: 1, minY: 0, minZ: 0, maxX: 0, maxY: 1, maxZ: 1 }]),
    ).toThrow();
  });

  it('is immutable: input mutation does not affect the shape', () => {
    const box = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 };
    const input = [box];
    const shape = VoxelShape.of(input);

    input.length = 0;
    box.maxY = 1;

    expect(shape.boxes).toHaveLength(1);
    expect(shape.boxes[0]!.maxY).toBe(0.5);
    expect(Object.isFrozen(shape.boxes[0])).toBe(true);
  });

  it('union concatenates box lists without mutating inputs', () => {
    const a = VoxelShape.of([{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 }]);
    const b = VoxelShape.of([
      { minX: 0, minY: 0.5, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
      { minX: 0.25, minY: 0.25, minZ: 0.25, maxX: 0.75, maxY: 0.75, maxZ: 0.75 },
    ]);

    const union = a.union(b);
    expect(union.boxes).toHaveLength(3);
    expect(a.boxes).toHaveLength(1);
    expect(b.boxes).toHaveLength(2);
    expect(union.contains(0.5, 0.25, 0.5)).toBe(true);
    expect(union.contains(0.5, 0.75, 0.5)).toBe(true);
    expect(union.contains(0.5, 0.9, 0.5)).toBe(true);
  });

  it('intersects is boundary-inclusive', () => {
    const shape = VoxelShape.FULL_CUBE;
    expect(shape.intersects(0.25, 0.25, 0.25, 0.75, 0.75, 0.75)).toBe(true); // inside
    expect(shape.intersects(2, 2, 2, 3, 3, 3)).toBe(false); // disjoint
    expect(shape.intersects(1, 0.5, 0.5, 2, 1.5, 1.5)).toBe(true); // boundary touch
  });

  it('contains is boundary-inclusive', () => {
    const slab = VoxelShape.of([{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 }]);
    expect(slab.contains(0.5, 0.25, 0.5)).toBe(true); // inside
    expect(slab.contains(0.5, 0.75, 0.5)).toBe(false); // outside
    expect(slab.contains(0.5, 0.5, 0.5)).toBe(true); // boundary
  });

  it('maxY returns the highest box top', () => {
    const shape = VoxelShape.of([
      { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
      { minX: 0.25, minY: 0.5, minZ: 0.25, maxX: 0.75, maxY: 1, maxZ: 0.75 },
    ]);
    expect(shape.maxY()).toBe(1);
  });
});
