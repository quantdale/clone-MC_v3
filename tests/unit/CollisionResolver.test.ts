import { describe, it, expect } from 'vitest';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';

/** Empty world: every cell is EMPTY. */
function emptyWorld(): ShapeWorld {
  return { getCollisionShape: () => VoxelShape.EMPTY };
}

/** Full-cube world: `cells` lists occupied cell coordinates (full unit cube). */
function cubeWorld(cells: Array<[number, number, number]>): ShapeWorld {
  const set = new Set(cells.map(([x, y, z]) => `${x},${y},${z}`));
  return {
    getCollisionShape: (x, y, z) => (set.has(`${x},${y},${z}`) ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
  };
}

/** Slab world: occupied cells get a half-height shape `[0,0,0]..[1,0.5,1]`. */
function slabWorld(cells: Array<[number, number, number]>): ShapeWorld {
  const set = new Set(cells.map(([x, y, z]) => `${x},${y},${z}`));
  const slab = VoxelShape.of([{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 }]);
  return {
    getCollisionShape: (x, y, z) => (set.has(`${x},${y},${z}`) ? slab : VoxelShape.EMPTY),
  };
}

describe('CollisionResolver', () => {
  it('stops horizontal movement at a full-cube wall face', () => {
    const world = cubeWorld([[4, 0, 0]]);
    const resolver = new CollisionResolver();
    const box = { x: 3, y: 0.5, z: 0.5, width: 1, height: 1, depth: 1 };

    const result = resolver.move(world, box, 2, 0, 0);
    expect(result.x).toBeCloseTo(3, 6); // wall face at x=4, box width 1 -> stops at 3
    expect(result.collidedX).toBe(true);
    expect(result.y).toBe(0.5);
    expect(result.z).toBe(0.5);
  });

  it('stops falling at the floor top face', () => {
    const world = cubeWorld([[0, 0, 0]]);
    const resolver = new CollisionResolver();
    const box = { x: 0.5, y: 5, z: 0.5, width: 1, height: 1, depth: 1 };

    const result = resolver.move(world, box, 0, -10, 0);
    expect(result.y).toBeCloseTo(1, 6); // floor top at y=1
    expect(result.collidedY).toBe(true);
  });

  it('is shape-aware: an entity lands on a slab top (y = 0.5), not the full cube top', () => {
    const world = slabWorld([[0, 0, 0]]);
    const resolver = new CollisionResolver();
    const box = { x: 0.5, y: 5, z: 0.5, width: 1, height: 1, depth: 1 };

    const result = resolver.move(world, box, 0, -10, 0);
    expect(result.y).toBeCloseTo(0.5, 6); // slab shape top
    expect(result.collidedY).toBe(true);
  });

  it('separates axes: a diagonal move into a wall stops X while Y continues', () => {
    const world = cubeWorld([[5, 0, 0]]);
    const resolver = new CollisionResolver();
    const box = { x: 3, y: 0.5, z: 0.5, width: 1, height: 1, depth: 1 };

    const result = resolver.move(world, box, 2, 2, 0);
    expect(result.x).toBeCloseTo(4, 6); // wall face at x=5 -> stops at 4
    expect(result.collidedX).toBe(true);
    expect(result.y).toBeCloseTo(2.5, 6); // Y continued
    expect(result.collidedY).toBe(false);
  });

  it('moves freely in empty space', () => {
    const resolver = new CollisionResolver();
    const box = { x: 0, y: 0, z: 0, width: 1, height: 1, depth: 1 };

    const result = resolver.move(emptyWorld(), box, 1, 2, 3);
    expect(result.x).toBe(1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(3);
    expect(result.collidedX).toBe(false);
    expect(result.collidedY).toBe(false);
    expect(result.collidedZ).toBe(false);
  });

  it('collides is boundary-inclusive', () => {
    const world = cubeWorld([[0, 0, 0]]);
    const resolver = new CollisionResolver();

    expect(resolver.collides(world, { x: 0.5, y: 0.5, z: 0.5, width: 1, height: 1, depth: 1 })).toBe(true);
    // Touching the boundary exactly.
    expect(resolver.collides(world, { x: 1, y: 0.5, z: 0.5, width: 1, height: 1, depth: 1 })).toBe(true);
    expect(resolver.collides(world, { x: 2, y: 0.5, z: 0.5, width: 1, height: 1, depth: 1 })).toBe(false);
  });

  it('rejects degenerate boxes', () => {
    const resolver = new CollisionResolver();
    expect(() => resolver.move(emptyWorld(), { x: 0, y: 0, z: 0, width: 0, height: 1, depth: 1 }, 1, 0, 0)).toThrow(
      RangeError,
    );
  });
});
