import { describe, it, expect } from 'vitest';
import { findPath, isPathStale, type PathNode } from '../../src/simulation/AStarPathfinding';
import type { NavigationWorld } from '../../src/simulation/NavigationGridQuery';
import {
  validatePathfindSaturationConfig,
  evaluatePathfindSaturation,
  runPathfindSaturation,
  type PathfindSaturationConfig,
} from '../../src/simulation/PathfindSaturation';
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

/** A flat open corridor along +x at y=5 (floor y=4), x in [x0, x1], z=0. */
function buildCorridor(x0: number, x1: number): FakeNavWorld {
  const world = new FakeNavWorld();
  for (let x = x0; x <= x1; x++) {
    world.setBlock(x, 4, 0, BlockId.Stone);
    world.setBlock(x, 5, 0, BlockId.Air);
    world.setBlock(x, 6, 0, BlockId.Air);
  }
  return world;
}

/** An open field with a solid wall far from the start/goal. */
function buildField(): FakeNavWorld {
  const world = new FakeNavWorld();
  for (let x = -40; x <= 40; x++) {
    for (let z = -40; z <= 40; z++) {
      world.setBlock(x, 4, z, BlockId.Stone);
      world.setBlock(x, 5, z, BlockId.Air);
      world.setBlock(x, 6, z, BlockId.Air);
    }
  }
  return world;
}

const HEIGHT = 2;

function staticClock(): () => number {
  return () => 0;
}

function config(overrides: Partial<PathfindSaturationConfig> = {}): PathfindSaturationConfig {
  return { maxExpansions: 2048, maxMeanSearchMillis: 1000, iterations: 5, ...overrides };
}

describe('validatePathfindSaturationConfig', () => {
  it('accepts a valid config', () => {
    expect(validatePathfindSaturationConfig(config())).toEqual(config());
  });

  it('rejects invalid values naming the field', () => {
    for (const field of ['maxExpansions', 'maxMeanSearchMillis', 'iterations'] as const) {
      for (const bad of [0, -1, NaN, Infinity, '5', null, undefined]) {
        expect(() => validatePathfindSaturationConfig({ ...config(), [field]: bad } as never)).toThrow(new RegExp(field));
      }
    }
  });

  it('rejects non-object input', () => {
    expect(() => validatePathfindSaturationConfig(true)).toThrow(/object/i);
  });
});

describe('expansion budget', () => {
  it('returns a best-effort partial path with expanded <= maxExpansions on exhaustion', () => {
    const world = buildField();
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 60, y: 5, z: 0 }; // walled/unreachable within budget
    const result = findPath(world, start, goal, { height: HEIGHT, maxExpansions: 128 })!;
    expect(result.expanded).toBeLessThanOrEqual(128);
    expect(result.reachedGoal).toBe(false);
    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it('reaches the goal within a generous expansion budget', () => {
    const world = buildCorridor(0, 5);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    const result = findPath(world, start, goal, { height: HEIGHT, maxExpansions: 128 })!;
    expect(result.reachedGoal).toBe(true);
    expect(result.expanded).toBeLessThanOrEqual(128);
  });

  it('returns null exactly when the start is not standable', () => {
    const world = new FakeNavWorld(); // everything air, no ground
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    expect(findPath(world, start, goal, { height: HEIGHT })).toBeNull();
  });
});

describe('prompt cancellation', () => {
  it('aborts at the next expansion boundary once the flag is raised', () => {
    const world = buildCorridor(0, 10);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 8, y: 5, z: 0 };
    let checks = 0;
    const result = findPath(world, start, goal, {
      height: HEIGHT,
      isCancelled: () => ++checks >= 5,
    })!;
    expect(result.cancelled).toBe(true);
    expect(result.reachedGoal).toBe(false);
    expect(result.expanded).toBeLessThanOrEqual(5);
  });

  it('never cancels when the flag is always false', () => {
    const world = buildCorridor(0, 10);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 8, y: 5, z: 0 };
    const result = findPath(world, start, goal, { height: HEIGHT, isCancelled: () => false })!;
    expect(result.cancelled).toBe(false);
    expect(result.reachedGoal).toBe(true);
  });
});

describe('search latency budget', () => {
  it('is within budget over repeated searches on a fixed field', () => {
    const world = buildCorridor(0, 5);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    const report = runPathfindSaturation(world, start, goal, config({ iterations: 5 }), staticClock());
    expect(report.withinBudget).toBe(true);
    expect(report.latency.dimension).toBe('latency');
    expect(report.latency.withinBudget).toBe(true);
    expect(report.maxExpanded).toBeLessThanOrEqual(config().maxExpansions);
  });

  it('flags a latency violation and a max-expansion violation', () => {
    const overLatency = evaluatePathfindSaturation(config({ maxMeanSearchMillis: 2 }), {
      meanSearchMillis: 50,
      maxExpanded: 10,
    });
    expect(overLatency.withinBudget).toBe(false);
    expect(overLatency.latency.withinBudget).toBe(false);
    expect(overLatency.latency.budget).toBe(2);
    expect(overLatency.latency.actual).toBe(50);

    const overExpansion = evaluatePathfindSaturation(config({ maxExpansions: 64 }), {
      meanSearchMillis: 1,
      maxExpanded: 100,
    });
    expect(overExpansion.withinBudget).toBe(false);
    expect(overExpansion.latency.withinBudget).toBe(true);
    expect(overExpansion.maxExpanded).toBe(100);
  });

  it('treats malformed latency actuals as violations', () => {
    for (const bad of [-1, NaN, Infinity] as const) {
      const report = evaluatePathfindSaturation(config(), { meanSearchMillis: bad, maxExpanded: 1 });
      expect(report.withinBudget).toBe(false);
    }
  });
});

describe('stale-path detection', () => {
  it('returns false when no remaining node changed', () => {
    const world = buildCorridor(0, 5);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    const path = findPath(world, start, goal, { height: HEIGHT })!;
    expect(isPathStale(world, path, 0, HEIGHT)).toBe(false);
  });

  it('returns true once a remaining node is blocked', () => {
    const world = buildCorridor(0, 5);
    const start: PathNode = { x: 0, y: 5, z: 0 };
    const goal: PathNode = { x: 4, y: 5, z: 0 };
    const path = findPath(world, start, goal, { height: HEIGHT })!;
    const mid = path.nodes[2]!;
    world.setBlock(mid.x, mid.y, mid.z, BlockId.Stone);
    expect(isPathStale(world, path, 0, HEIGHT)).toBe(true);
  });
});

describe('determinism', () => {
  it('produces identical reports for identical worlds, options, and scripted clocks', () => {
    const run = () => {
      const world = buildCorridor(0, 5);
      const start: PathNode = { x: 0, y: 5, z: 0 };
      const goal: PathNode = { x: 4, y: 5, z: 0 };
      return runPathfindSaturation(world, start, goal, config({ iterations: 4 }), staticClock());
    };
    expect(run()).toEqual(run());
  });
});
