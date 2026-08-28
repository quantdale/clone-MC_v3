import { describe, expect, it } from 'vitest';
import {
  BlockId,
  PISTON_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import type { PistonWorld, PistonPushPlan } from '../../src/simulation/PistonMovePlanner';
import { PISTON_PUSH_LIMIT } from '../../src/simulation/PistonMovePlanner';
import { executePistonPush, type PistonExecutionWorld } from '../../src/simulation/PistonExecution';
import {
  wouldDrag,
  expandStickyGroup,
  orderGroupForMove,
  extendPushPlanWithStickyGroup,
  planStickyRetract,
  type StickyKind,
  type StickyWorld,
} from '../../src/simulation/PistonStickyGroups';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

interface WorldSpec {
  immovable?: Array<[number, number, number]>;
  movable?: Array<[number, number, number]>;
  sticky?: Array<[[number, number, number], StickyKind]>;
}

function makeWorlds(spec: WorldSpec): { piston: PistonWorld; sticky: StickyWorld } {
  const immovable = new Set((spec.immovable ?? []).map(([x, y, z]) => key(x, y, z)));
  const movable = new Set((spec.movable ?? []).map(([x, y, z]) => key(x, y, z)));
  const stickyMap = new Map<string, StickyKind>(
    (spec.sticky ?? []).map(([pos, kind]) => [key(pos[0], pos[1], pos[2]), kind]),
  );
  return {
    piston: {
      isImmovable: (x, y, z) => immovable.has(key(x, y, z)),
      isPushable: (x, y, z) => movable.has(key(x, y, z)) || stickyMap.has(key(x, y, z)),
      isDestroyedByPush: () => false,
    },
    sticky: {
      stickyKind: (x, y, z) => stickyMap.get(key(x, y, z)) ?? null,
    },
  };
}

describe('sticky piston registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('shares piston\'s PISTON_SCHEMA instance and default', () => {
    const piston = blockRegistry.get(BlockId.Piston);
    const sticky = blockRegistry.get(BlockId.StickyPiston);
    expect(blockRegistry.getPropertySchema(BlockId.StickyPiston)).toBe(PISTON_SCHEMA);
    expect(blockRegistry.getPropertySchema(BlockId.StickyPiston)).toBe(
      blockRegistry.getPropertySchema(BlockId.Piston),
    );
    expect(sticky.defaultState).toEqual(piston.defaultState);
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.StickyPiston);
    expect(item.key).toBe('sticky_piston');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:sticky_piston');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 12 states, matching piston', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    expect(stateRegistry.statesForBlock(BlockId.StickyPiston).length).toBe(12);
    expect(stateRegistry.statesForBlock(BlockId.StickyPiston).length).toBe(
      stateRegistry.statesForBlock(BlockId.Piston).length,
    );
  });
});

describe('wouldDrag', () => {
  it('always drags a non-sticky neighbor', () => {
    expect(wouldDrag('slime', null)).toBe(true);
  });

  it('drags the same sticky kind', () => {
    expect(wouldDrag('honey', 'honey')).toBe(true);
    expect(wouldDrag('slime', 'slime')).toBe(true);
  });

  it('does not drag a different sticky kind', () => {
    expect(wouldDrag('slime', 'honey')).toBe(false);
    expect(wouldDrag('honey', 'slime')).toBe(false);
  });
});

describe('expandStickyGroup', () => {
  it('grows through a chain of the same sticky kind', () => {
    // Seed (0,0,0) slime -> (1,0,0) slime -> (2,0,0) plain movable.
    const { piston, sticky } = makeWorlds({
      sticky: [
        [[0, 0, 0], 'slime'],
        [[1, 0, 0], 'slime'],
      ],
      movable: [[2, 0, 0]],
    });
    const result = expandStickyGroup(piston, sticky, [[0, 0, 0]], PISTON_PUSH_LIMIT);
    expect(result.canMove).toBe(true);
    const set = new Set(result.positions.map((p) => key(p[0], p[1], p[2])));
    expect(set.has('0,0,0')).toBe(true);
    expect(set.has('1,0,0')).toBe(true);
    expect(set.has('2,0,0')).toBe(true);
    expect(result.positions.length).toBe(3);
  });

  it('does not further expand through a non-sticky passenger', () => {
    // Seed (0,0,0) slime -> (1,0,0) plain movable -> (2,0,0) slime (should NOT be included).
    const { piston, sticky } = makeWorlds({
      sticky: [
        [[0, 0, 0], 'slime'],
        [[2, 0, 0], 'slime'],
      ],
      movable: [[1, 0, 0]],
    });
    const result = expandStickyGroup(piston, sticky, [[0, 0, 0]], PISTON_PUSH_LIMIT);
    expect(result.canMove).toBe(true);
    const set = new Set(result.positions.map((p) => key(p[0], p[1], p[2])));
    expect(set.has('0,0,0')).toBe(true);
    expect(set.has('1,0,0')).toBe(true);
    expect(set.has('2,0,0')).toBe(false);
    expect(result.positions.length).toBe(2);
  });

  it('stops expansion at a different sticky kind', () => {
    const { piston, sticky } = makeWorlds({
      sticky: [
        [[0, 0, 0], 'slime'],
        [[1, 0, 0], 'honey'],
      ],
    });
    const result = expandStickyGroup(piston, sticky, [[0, 0, 0]], PISTON_PUSH_LIMIT);
    expect(result.canMove).toBe(true);
    expect(result.positions).toEqual([[0, 0, 0]]);
  });

  it('fails the whole group on an immovable neighbor', () => {
    const { piston, sticky } = makeWorlds({
      sticky: [[[0, 0, 0], 'slime']],
      immovable: [[1, 0, 0]],
    });
    const result = expandStickyGroup(piston, sticky, [[0, 0, 0]], PISTON_PUSH_LIMIT);
    expect(result.canMove).toBe(false);
    expect(result.blockedReason).toBe('immovable');
    expect(result.blockedAt).toEqual([1, 0, 0]);
    expect(result.positions).toEqual([]);
  });

  it('fails the whole group when exceeding maxGroupSize', () => {
    const stickyEntries: Array<[[number, number, number], StickyKind]> = [];
    for (let i = 0; i <= PISTON_PUSH_LIMIT; i++) {
      stickyEntries.push([[i, 0, 0], 'slime']);
    }
    const { piston, sticky } = makeWorlds({ sticky: stickyEntries });
    const result = expandStickyGroup(piston, sticky, [[0, 0, 0]], PISTON_PUSH_LIMIT);
    expect(result.canMove).toBe(false);
    expect(result.blockedReason).toBe('exceeded-limit');
  });
});

describe('orderGroupForMove + executePistonPush — non-linear group', () => {
  it('moves an L-shaped group to the correct final state with no block lost or overwritten', () => {
    // L-shape: (0,0,0), (1,0,0) along the push axis, plus (1,1,0) attached off-axis to (1,0,0).
    const positions: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ];
    const ordered = orderGroupForMove(positions, 'east');
    // (1,0,0) has the greatest eastward projection and must move first, then (0,0,0);
    // (1,1,0) shares (1,0,0)'s eastward projection so it doesn't conflict with either.
    expect(ordered[0]).toEqual([1, 0, 0]);
    expect(ordered).toContainEqual([0, 0, 0]);
    expect(ordered).toContainEqual([1, 1, 0]);

    const store = new Map<string, string>([
      [key(0, 0, 0), 'a'],
      [key(1, 0, 0), 'b'],
      [key(1, 1, 0), 'c'],
    ]);
    const world: PistonExecutionWorld<string> = {
      getBlockState: (x, y, z) => store.get(key(x, y, z)) ?? 'air',
      setBlockState: (x, y, z, s) => store.set(key(x, y, z), s),
      clearBlockState: (x, y, z) => store.delete(key(x, y, z)),
    };
    const plan: PistonPushPlan = { canPush: true, blocksToMove: ordered, blocksToDestroy: [] };
    executePistonPush(world, plan, 'east');

    expect(store.get(key(1, 0, 0))).toBe('a');
    expect(store.get(key(2, 0, 0))).toBe('b');
    expect(store.get(key(2, 1, 0))).toBe('c');
    expect(store.has(key(0, 0, 0))).toBe(false);
    expect(store.has(key(1, 1, 0))).toBe(false);
    expect(store.size).toBe(3);
  });
});

describe('extendPushPlanWithStickyGroup', () => {
  it('returns a non-sticky plan unchanged', () => {
    const { piston, sticky } = makeWorlds({ movable: [[1, 0, 0]] });
    const basePlan: PistonPushPlan = { canPush: true, blocksToMove: [[1, 0, 0]], blocksToDestroy: [] };
    const result = extendPushPlanWithStickyGroup(basePlan, piston, sticky, 'east');
    expect(result).toBe(basePlan);
  });

  it('grows a plan containing a sticky block to include its off-line attachment', () => {
    // Base linear plan pushes (1,0,0) [slime]; off-line, (1,1,0) is also slime and attached.
    const { piston, sticky } = makeWorlds({
      sticky: [
        [[1, 0, 0], 'slime'],
        [[1, 1, 0], 'slime'],
      ],
    });
    const basePlan: PistonPushPlan = { canPush: true, blocksToMove: [[1, 0, 0]], blocksToDestroy: [] };
    const result = extendPushPlanWithStickyGroup(basePlan, piston, sticky, 'east');
    expect(result.canPush).toBe(true);
    expect(result.blocksToDestroy).toEqual(basePlan.blocksToDestroy);
    expect(result.blocksToMove).toContainEqual([1, 0, 0]);
    expect(result.blocksToMove).toContainEqual([1, 1, 0]);
    expect(result.blocksToMove.length).toBe(2);
  });
});

describe('planStickyRetract', () => {
  it('succeeds with an empty blocksToMove when nothing is in front', () => {
    const { piston, sticky } = makeWorlds({});
    const plan = planStickyRetract(piston, sticky, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove).toEqual([]);
  });

  it('pulls a single movable block back', () => {
    const { piston, sticky } = makeWorlds({ movable: [[1, 0, 0]] });
    const plan = planStickyRetract(piston, sticky, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove).toEqual([[1, 0, 0]]);
  });

  it('cascades the pull through a sticky neighbor', () => {
    const { piston, sticky } = makeWorlds({
      sticky: [
        [[1, 0, 0], 'slime'],
        [[2, 0, 0], 'slime'],
      ],
    });
    const plan = planStickyRetract(piston, sticky, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove).toContainEqual([1, 0, 0]);
    expect(plan.blocksToMove).toContainEqual([2, 0, 0]);
    expect(plan.blocksToMove.length).toBe(2);
  });

  it('fails when the block directly in front is immovable', () => {
    const { piston, sticky } = makeWorlds({ immovable: [[1, 0, 0]] });
    const plan = planStickyRetract(piston, sticky, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(false);
    expect(plan.blockedReason).toBe('immovable');
    expect(plan.blockedAt).toEqual([1, 0, 0]);
  });
});
