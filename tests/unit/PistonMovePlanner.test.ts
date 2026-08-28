import { describe, expect, it } from 'vitest';
import { DIRECTIONS, offsetInDirection } from '../../src/simulation/RedstoneSignal';
import {
  PISTON_PUSH_LIMIT,
  classifyPistonBlock,
  planPistonPush,
  type PistonWorld,
} from '../../src/simulation/PistonMovePlanner';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** A PistonWorld built from explicit per-position overrides; everything else is a clean-air terminator. */
function makeWorld(overrides: Record<string, Partial<{ immovable: boolean; pushable: boolean; destroyed: boolean }>>): PistonWorld {
  return {
    isImmovable: (x, y, z) => overrides[key(x, y, z)]?.immovable ?? false,
    isPushable: (x, y, z) => overrides[key(x, y, z)]?.pushable ?? false,
    isDestroyedByPush: (x, y, z) => overrides[key(x, y, z)]?.destroyed ?? false,
  };
}

describe('classifyPistonBlock', () => {
  it('returns movable when not immovable and pushable', () => {
    const world = makeWorld({ '0,0,0': { pushable: true } });
    expect(classifyPistonBlock(world, 0, 0, 0)).toBe('movable');
  });

  it('returns terminates-clear when neither immovable, pushable, nor destroyed', () => {
    const world = makeWorld({});
    expect(classifyPistonBlock(world, 0, 0, 0)).toBe('terminates-clear');
  });

  it('returns terminates-destroy when not immovable/pushable but destroyed-by-push', () => {
    const world = makeWorld({ '0,0,0': { destroyed: true } });
    expect(classifyPistonBlock(world, 0, 0, 0)).toBe('terminates-destroy');
  });

  it('immovable takes precedence over an inconsistent pushable report', () => {
    const world = makeWorld({ '0,0,0': { immovable: true, pushable: true } });
    expect(classifyPistonBlock(world, 0, 0, 0)).toBe('immovable');
  });
});

describe('planPistonPush — clear termination', () => {
  it('moves nothing on immediate clear termination', () => {
    const world = makeWorld({});
    const plan = planPistonPush(world, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove).toEqual([]);
    expect(plan.blocksToDestroy).toEqual([]);
  });

  it('orders several movable blocks farthest-first before a clear termination', () => {
    // Piston at (0,0,0) facing east: (1,0,0) (2,0,0) (3,0,0) movable, (4,0,0) clear.
    const world = makeWorld({
      '1,0,0': { pushable: true },
      '2,0,0': { pushable: true },
      '3,0,0': { pushable: true },
    });
    const plan = planPistonPush(world, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove).toEqual([
      [3, 0, 0],
      [2, 0, 0],
      [1, 0, 0],
    ]);
    expect(plan.blocksToDestroy).toEqual([]);
  });
});

describe('planPistonPush — destroy termination', () => {
  it('destroys the immediate terminating position', () => {
    const world = makeWorld({ '1,0,0': { destroyed: true } });
    const plan = planPistonPush(world, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove).toEqual([]);
    expect(plan.blocksToDestroy).toEqual([[1, 0, 0]]);
  });

  it('moves preceding blocks farthest-first and destroys only the terminator', () => {
    const world = makeWorld({
      '1,0,0': { pushable: true },
      '2,0,0': { pushable: true },
      '3,0,0': { destroyed: true },
    });
    const plan = planPistonPush(world, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove).toEqual([
      [2, 0, 0],
      [1, 0, 0],
    ]);
    expect(plan.blocksToDestroy).toEqual([[3, 0, 0]]);
  });
});

describe('planPistonPush — immovable blocks entirely', () => {
  it('blocks at the first position', () => {
    const world = makeWorld({ '1,0,0': { immovable: true } });
    const plan = planPistonPush(world, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(false);
    expect(plan.blockedReason).toBe('immovable');
    expect(plan.blockedAt).toEqual([1, 0, 0]);
    expect(plan.blocksToMove).toEqual([]);
    expect(plan.blocksToDestroy).toEqual([]);
  });

  it('blocks after some movable blocks, moving nothing', () => {
    const world = makeWorld({
      '1,0,0': { pushable: true },
      '2,0,0': { pushable: true },
      '3,0,0': { immovable: true },
    });
    const plan = planPistonPush(world, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(false);
    expect(plan.blockedReason).toBe('immovable');
    expect(plan.blockedAt).toEqual([3, 0, 0]);
    expect(plan.blocksToMove).toEqual([]);
    expect(plan.blocksToDestroy).toEqual([]);
  });
});

describe('planPistonPush — push limit boundary', () => {
  it('succeeds with exactly PISTON_PUSH_LIMIT movable blocks', () => {
    const overrides: Record<string, { pushable: boolean }> = {};
    for (let i = 1; i <= PISTON_PUSH_LIMIT; i++) {
      overrides[key(i, 0, 0)] = { pushable: true };
    }
    const world = makeWorld(overrides);
    const plan = planPistonPush(world, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove.length).toBe(PISTON_PUSH_LIMIT);
    expect(plan.blocksToMove[0]).toEqual([PISTON_PUSH_LIMIT, 0, 0]);
    expect(plan.blocksToMove[plan.blocksToMove.length - 1]).toEqual([1, 0, 0]);
  });

  it('fails with one more than PISTON_PUSH_LIMIT movable blocks in a row', () => {
    const overrides: Record<string, { pushable: boolean }> = {};
    for (let i = 1; i <= PISTON_PUSH_LIMIT + 1; i++) {
      overrides[key(i, 0, 0)] = { pushable: true };
    }
    const world = makeWorld(overrides);
    const plan = planPistonPush(world, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(false);
    expect(plan.blockedReason).toBe('exceeded-limit');
    expect(plan.blocksToMove).toEqual([]);
    expect(plan.blocksToDestroy).toEqual([]);
  });
});

describe('planPistonPush — facing correctness', () => {
  it('walks the geometrically correct line for all six directions', () => {
    for (const facing of DIRECTIONS) {
      const queried: Array<[number, number, number]> = [];
      const world: PistonWorld = {
        isImmovable: () => false,
        isPushable: (x, y, z) => {
          queried.push([x, y, z]);
          return queried.length <= 3;
        },
        isDestroyedByPush: () => false,
      };
      planPistonPush(world, 0, 0, 0, facing);

      const expected: Array<[number, number, number]> = [];
      let cursor: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < 4; i++) {
        cursor = offsetInDirection(cursor[0], cursor[1], cursor[2], facing);
        expected.push(cursor);
      }
      expect(queried).toEqual(expected);
    }
  });
});
