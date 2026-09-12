import { describe, it, expect } from 'vitest';
import { WorldBlockAccess } from '../../src/simulation/WorldBlockAccess';
import type { World } from '../../src/world/World';
import type { BlockState } from '../../src/world/BlockStateRegistry';

// 268 coverage uplift: WorldBlockAccess is a thin delegation adapter over World.
// A structural stub records every call so each delegate is pinned without a
// heavyweight World fixture.
function stubWorld() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const blocks = new Map<string, number>();
  const states = new Map<string, { id: number; properties: Readonly<Record<string, boolean | number | string>> }>();
  const world = {
    getBlock: (x: number, y: number, z: number): number => {
      calls.push({ method: 'getBlock', args: [x, y, z] });
      return blocks.get(`${x},${y},${z}`) ?? 0;
    },
    setBlock: (x: number, y: number, z: number, id: number): void => {
      calls.push({ method: 'setBlock', args: [x, y, z, id] });
      blocks.set(`${x},${y},${z}`, id);
    },
    getBlockState: (x: number, y: number, z: number): BlockState => {
      calls.push({ method: 'getBlockState', args: [x, y, z] });
      const key = `${x},${y},${z}`;
      return { blockId: blocks.get(key) ?? 0 } as BlockState;
    },
    setBlockState: (
      x: number,
      y: number,
      z: number,
      blockId: number,
      properties: Readonly<Record<string, boolean | number | string>>,
    ): void => {
      calls.push({ method: 'setBlockState', args: [x, y, z, blockId, properties] });
      states.set(`${x},${y},${z}`, { id: blockId, properties });
      blocks.set(`${x},${y},${z}`, blockId);
    },
  };
  return { world: world as unknown as World, calls, states };
}

describe('WorldBlockAccess delegation (268 coverage uplift)', () => {
  it('reads block ids through the world', () => {
    const { world, calls } = stubWorld();
    const access = new WorldBlockAccess(world);
    world.setBlock(1, 2, 3, 7);
    calls.length = 0;
    expect(access.getBlockId(1, 2, 3)).toBe(7);
    expect(calls).toEqual([{ method: 'getBlock', args: [1, 2, 3] }]);
  });

  it('writes block ids through the world', () => {
    const { world, calls } = stubWorld();
    const access = new WorldBlockAccess(world);
    access.setBlockId(4, 5, 6, 9);
    expect(calls).toEqual([{ method: 'setBlock', args: [4, 5, 6, 9] }]);
    expect(access.getBlockId(4, 5, 6)).toBe(9);
  });

  it('reads block states through the world', () => {
    const { world, calls } = stubWorld();
    const access = new WorldBlockAccess(world);
    world.setBlock(1, 1, 1, 12);
    calls.length = 0;
    const state = access.getBlockState(1, 1, 1);
    expect(calls).toEqual([{ method: 'getBlockState', args: [1, 1, 1] }]);
    expect(state.blockId).toBe(12);
  });

  it('writes block states with properties through the world', () => {
    const { world, calls, states } = stubWorld();
    const access = new WorldBlockAccess(world);
    const properties = { facing: 'north', lit: true, level: 3 } as const;
    access.setBlockState(2, 3, 4, 21, properties);
    expect(calls).toEqual([{ method: 'setBlockState', args: [2, 3, 4, 21, properties] }]);
    expect(states.get('2,3,4')).toEqual({ id: 21, properties });
  });
});
