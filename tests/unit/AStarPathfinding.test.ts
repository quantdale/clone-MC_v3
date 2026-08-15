import { describe, it, expect } from 'vitest';
import { findPath, isPathStale, type PathNode } from '../../src/simulation/AStarPathfinding';
import type { NavigationWorld } from '../../src/simulation/NavigationGridQuery';
import { BlockId } from '../../src/world/BlockRegistry';
import { VoxelShape } from '../../src/world/VoxelShape';

/** A fake NavigationWorld backed by maps; Stone is solid, everything else is not. */
class FakeNavWorld implements NavigationWorld {
  private readonly blocks = new Map<string, number>();

  private static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    this.blocks.set(FakeNavWorld.key(x, y, z), id);
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.blocks.get(FakeNavWorld.key(x, y, z)) ?? BlockId.Air;
  }

  getCollisionShape(x: number, y: number, z: number): VoxelShape {
    return this.getBlockId(x, y, z) === BlockId.Stone ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
  }
}

/** Build a flat, open, solid-floored corridor along +x at y=5 (floor at y=4), x in [x0, x1], z=0. */
function buildCorridor(x0: number, x1: number): FakeNavWorld {
  const world = new FakeNavWorld();
  for (let x = x0; x <= x1; x++) {
    world.setBlock(x, 4, 0, BlockId.Stone);
    world.setBlock(x, 5, 0, BlockId.Air);
    world.setBlock(x, 6, 0, BlockId.Air);
  }
  return world;
}

const HEIGHT = 2;

describe('findPath — start validity', () => {
  it('returns null when start is not standable', () => {
    const world = new FakeNavWorld(); // everything air, no ground anywhere
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    expect(findPath(world, start, goal, { height: HEIGHT })).toBeNull();
  });

  it('returns a non-null result (not null) for a standable start with an unreachable goal', () => {
    const world = buildCorridor(0, 0); // a single standable cell, nothing else
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 100, y: 5, z: 0 };
    const result = findPath(world, start, goal, { height: HEIGHT });
    expect(result).not.toBeNull();
    expect(result!.reachedGoal).toBe(false);
  });
});

describe('findPath — reachable goal', () => {
  it('reaches the goal through a simple open corridor', () => {
    const world = buildCorridor(0, 5);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    const result = findPath(world, start, goal, { height: HEIGHT })!;
    expect(result.reachedGoal).toBe(true);
    expect(result.nodes[0]).toEqual(start);
    expect(result.nodes[result.nodes.length - 1]).toEqual(goal);
  });
});

describe('findPath — unreachable goal (walled off)', () => {
  function buildWalledRoom(): FakeNavWorld {
    const world = new FakeNavWorld();
    // Solid floor under the whole room + wall footprint.
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        world.setBlock(x, 4, z, BlockId.Stone);
      }
    }
    // Open interior room x,z in [-1,1].
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        world.setBlock(x, 5, z, BlockId.Air);
        world.setBlock(x, 6, z, BlockId.Air);
      }
    }
    // Solid walls surrounding the room at x=-2, x=2, z=-2, z=2.
    for (let i = -2; i <= 2; i++) {
      world.setBlock(-2, 5, i, BlockId.Stone);
      world.setBlock(2, 5, i, BlockId.Stone);
      world.setBlock(i, 5, -2, BlockId.Stone);
      world.setBlock(i, 5, 2, BlockId.Stone);
      world.setBlock(-2, 6, i, BlockId.Stone);
      world.setBlock(2, 6, i, BlockId.Stone);
      world.setBlock(i, 6, -2, BlockId.Stone);
      world.setBlock(i, 6, 2, BlockId.Stone);
    }
    return world;
  }

  it('returns a best-effort partial path toward the goal without throwing', () => {
    const world = buildWalledRoom();
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 50, y: 5, z: 0 };
    const result = findPath(world, start, goal, { height: HEIGHT })!;
    expect(result.reachedGoal).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0]).toEqual(start);
  });
});

describe('findPath — maxExpansions bound', () => {
  it('a tiny expansion budget cuts off an otherwise-reachable goal', () => {
    const world = buildCorridor(0, 50);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 50, y: 5, z: 0 };
    const result = findPath(world, start, goal, { height: HEIGHT, maxExpansions: 3 })!;
    expect(result.reachedGoal).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(result.expanded).toBeLessThanOrEqual(3);
  });
});

describe('findPath — cancellation', () => {
  it('stops and reports cancelled when isCancelled returns true', () => {
    const world = buildCorridor(0, 10);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 8, y: 5, z: 0 };
    const result = findPath(world, start, goal, { height: HEIGHT, isCancelled: () => true })!;
    expect(result.cancelled).toBe(true);
    expect(result.reachedGoal).toBe(false);
  });
});

describe('findPath — determinism', () => {
  it('produces identical results across repeated identical calls', () => {
    const world = buildCorridor(0, 10);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 8, y: 5, z: 0 };
    const a = findPath(world, start, goal, { height: HEIGHT });
    const b = findPath(world, start, goal, { height: HEIGHT });
    expect(a!.nodes).toEqual(b!.nodes);
    expect(a!.expanded).toBe(b!.expanded);
  });
});

describe('isPathStale', () => {
  it('is false when nothing in the path has changed', () => {
    const world = buildCorridor(0, 5);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    const path = findPath(world, start, goal, { height: HEIGHT })!;
    expect(isPathStale(world, path, 0, HEIGHT)).toBe(false);
  });

  it('is true once a remaining node becomes blocked', () => {
    const world = buildCorridor(0, 5);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    const path = findPath(world, start, goal, { height: HEIGHT })!;

    // Block a node partway along the path.
    const mid = path.nodes[2]!;
    world.setBlock(mid.x, mid.y, mid.z, BlockId.Stone);

    expect(isPathStale(world, path, 0, HEIGHT)).toBe(true);
  });

  it('ignores a change before fromIndex', () => {
    const world = buildCorridor(0, 5);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    const path = findPath(world, start, goal, { height: HEIGHT })!;

    // Block the very first node (already "passed" once fromIndex skips it).
    const first = path.nodes[0]!;
    world.setBlock(first.x, first.y, first.z, BlockId.Stone);

    expect(isPathStale(world, path, 1, HEIGHT)).toBe(false);
  });
});
