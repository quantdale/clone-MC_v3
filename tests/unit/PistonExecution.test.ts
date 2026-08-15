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
import type { PistonPushPlan } from '../../src/simulation/PistonMovePlanner';
import {
  executePistonPush,
  pistonAffectedPositions,
  pistonShouldBeExtended,
  pistonStateProperties,
  type PistonExecutionWorld,
} from '../../src/simulation/PistonExecution';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

interface CallRecordingWorld extends PistonExecutionWorld<string> {
  readonly calls: string[];
  readonly store: Map<string, string>;
}

function makeWorld(initial: Record<string, string> = {}): CallRecordingWorld {
  const store = new Map<string, string>(Object.entries(initial));
  const calls: string[] = [];
  return {
    store,
    calls,
    getBlockState(x, y, z) {
      calls.push(`get:${key(x, y, z)}`);
      return store.get(key(x, y, z)) ?? 'air';
    },
    setBlockState(x, y, z, state) {
      calls.push(`set:${key(x, y, z)}:${state}`);
      store.set(key(x, y, z), state);
    },
    clearBlockState(x, y, z) {
      calls.push(`clear:${key(x, y, z)}`);
      store.delete(key(x, y, z));
    },
  };
}

const BLOCKED_PLAN: PistonPushPlan = {
  canPush: false,
  blocksToMove: [],
  blocksToDestroy: [],
  blockedReason: 'immovable',
  blockedAt: [1, 0, 0],
};

describe('piston registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with PISTON_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.Piston);
    expect(def.key).toBe('piston');
    expect(blockRegistry.getPropertySchema(BlockId.Piston)).toBe(PISTON_SCHEMA);
    expect(def.defaultState).toEqual({ facing: 'north', extended: false });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Piston);
    expect(item.key).toBe('piston');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:piston');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 12 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Piston);
    expect(states.length).toBe(12); // 6 facings x 2 extended

    const defaultState = stateRegistry.getDefaultState(BlockId.Piston);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('facing')).toBe('north');
    expect(defaultState.getProperty('extended')).toBe('false');
  });
});

describe('executePistonPush — blocked plan', () => {
  it('is a no-op: records zero calls', () => {
    const world = makeWorld();
    executePistonPush(world, BLOCKED_PLAN, 'east');
    expect(world.calls).toEqual([]);
  });
});

describe('executePistonPush — immediate termination', () => {
  it('changes nothing on immediate clear termination', () => {
    const world = makeWorld();
    const plan: PistonPushPlan = { canPush: true, blocksToMove: [], blocksToDestroy: [] };
    executePistonPush(world, plan, 'east');
    expect(world.calls).toEqual([]);
  });

  it('clears exactly the destroyed position on immediate destroy termination', () => {
    const world = makeWorld({ '1,0,0': 'grass' });
    const plan: PistonPushPlan = { canPush: true, blocksToMove: [], blocksToDestroy: [[1, 0, 0]] };
    executePistonPush(world, plan, 'east');
    expect(world.store.has('1,0,0')).toBe(false);
  });
});

describe('executePistonPush — multi-block chains', () => {
  it('moves a three-block chain to the correct final positions', () => {
    const world = makeWorld({ '1,0,0': 'stone', '2,0,0': 'dirt', '3,0,0': 'sand' });
    const plan: PistonPushPlan = {
      canPush: true,
      blocksToMove: [
        [3, 0, 0],
        [2, 0, 0],
        [1, 0, 0],
      ],
      blocksToDestroy: [],
    };
    executePistonPush(world, plan, 'east');

    expect(world.store.get('4,0,0')).toBe('sand');
    expect(world.store.get('3,0,0')).toBe('dirt');
    expect(world.store.get('2,0,0')).toBe('stone');
    expect(world.store.has('1,0,0')).toBe(false);
  });

  it('moves and destroys correctly when the chain terminates in destruction', () => {
    const world = makeWorld({ '1,0,0': 'stone', '2,0,0': 'sand', '3,0,0': 'tall_grass' });
    const plan: PistonPushPlan = {
      canPush: true,
      blocksToMove: [
        [2, 0, 0],
        [1, 0, 0],
      ],
      blocksToDestroy: [[3, 0, 0]],
    };
    executePistonPush(world, plan, 'east');

    // The farthest block (sand at 2,0,0) moves into the cleared destroy slot at 3,0,0.
    expect(world.store.get('3,0,0')).toBe('sand');
    expect(world.store.get('2,0,0')).toBe('stone');
    expect(world.store.has('1,0,0')).toBe(false);
  });
});

describe('pistonAffectedPositions', () => {
  it('returns an empty array for a blocked plan', () => {
    expect(pistonAffectedPositions(BLOCKED_PLAN, 0, 0, 0, 'east')).toEqual([]);
  });

  it('returns the piston, sources, destinations, and destroyed positions for a successful plan', () => {
    const plan: PistonPushPlan = {
      canPush: true,
      blocksToMove: [
        [2, 0, 0],
        [1, 0, 0],
      ],
      blocksToDestroy: [[3, 0, 0]],
    };
    const positions = pistonAffectedPositions(plan, 0, 0, 0, 'east');
    expect(positions).toEqual([
      [0, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
  });
});

describe('pistonShouldBeExtended', () => {
  it('reads extended when powered', () => {
    expect(pistonShouldBeExtended(true)).toBe(true);
  });

  it('reads retracted when unpowered', () => {
    expect(pistonShouldBeExtended(false)).toBe(false);
  });
});

describe('pistonStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    const props = pistonStateProperties('up', true);
    expect(Object.keys(props).sort()).toEqual(['extended', 'facing']);
    expect(props).toEqual({ facing: 'up', extended: true });
    for (const [name, value] of Object.entries(props)) {
      expect(PISTON_SCHEMA.legalValues(name)).toContain(String(value));
    }
  });
});
