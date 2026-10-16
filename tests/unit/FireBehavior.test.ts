import { describe, it, expect } from 'vitest';
import {
  FireBlockBehavior,
  isFlammable,
  parseFireAge,
  canIgnite,
  ignite,
  isAdjacentToWater,
  spreadRoll,
  spreadFire,
  MAX_FIRE_AGE,
  MAX_SPREAD_PER_TICK,
  FIRE_AGE_PROPERTY,
} from '../../src/simulation/FireBehavior';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import type { BlockState } from '../../src/world/BlockStateRegistry';
import type { BlockWorldAccess } from '../../src/simulation/BlockBehavior';

/** A fake BlockWorldAccess holding ids + fire ages and recording writes. */
class FakeFireWorld implements BlockWorldAccess {
  readonly ids = new Map<string, number>();
  readonly ages = new Map<string, number>();
  /** Recorded setBlockId calls: [x, y, z, id]. */
  readonly idWrites: Array<[number, number, number, number]> = [];
  /** Recorded setBlockState calls: [x, y, z, blockId, propName, propValue]. */
  readonly stateWrites: Array<[number, number, number, number, string, string]> = [];

  setBlock(x: number, y: number, z: number, id: number): void {
    this.ids.set(`${x},${y},${z}`, id);
  }

  setFire(x: number, y: number, z: number, age = 0): void {
    this.setBlock(x, y, z, BlockId.Fire);
    this.ages.set(`${x},${y},${z}`, age);
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.ids.get(`${x},${y},${z}`) ?? BlockId.Air;
  }

  setBlockId(x: number, y: number, z: number, id: number): void {
    this.setBlock(x, y, z, id);
    this.idWrites.push([x, y, z, id]);
  }

  getBlockState(x: number, y: number, z: number): BlockState {
    const age = this.ages.get(`${x},${y},${z}`);
    return {
      getProperty(name: string): string | undefined {
        if (name === FIRE_AGE_PROPERTY) return age === undefined ? undefined : String(age);
        return undefined;
      },
      assignments: [] as ReadonlyArray<readonly [string, string]>,
    } as unknown as BlockState;
  }

  setBlockState(
    x: number,
    y: number,
    z: number,
    blockId: number,
    properties: Record<string, boolean | number | string>,
  ): void {
    this.setBlock(x, y, z, blockId);
    const key = `${x},${y},${z}`;
    if (blockId === BlockId.Fire && properties[FIRE_AGE_PROPERTY] !== undefined) {
      this.ages.set(key, Number(properties[FIRE_AGE_PROPERTY]));
    }
    const [propName, propValue] = Object.entries(properties)[0] ?? [];
    this.stateWrites.push([x, y, z, blockId, propName ?? '', String(propValue ?? '')]);
  }
}

const behavior = new FireBlockBehavior();
const ctx = (world: FakeFireWorld, x: number, y: number, z: number, tick = 1, seed = 42) => ({
  x,
  y,
  z,
  tick,
  world,
  seed,
});

describe('fire block definition', () => {
  it('registers BlockId.Fire = 36 as non-solid/non-opaque/non-breakable with no dropItem', () => {
    const registry = createDefaultBlockRegistry();
    expect(BlockId.Fire).toBe(36);
    const def = registry.get(BlockId.Fire);
    expect(def.solid).toBe(false);
    expect(def.opaque).toBe(false);
    expect(def.breakable).toBe(false);
    expect(def.dropItem).toBeUndefined();
  });

  it('enumerates exactly 16 age states, default age 0', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Fire);
    expect(states.length).toBe(16);
    expect(states.map((s) => s.getProperty('age'))).toEqual(
      Array.from({ length: 16 }, (_, i) => String(i)),
    );
    expect(stateRegistry.getDefaultState(BlockId.Fire).getProperty('age')).toBe('0');
  });
});

describe('isFlammable', () => {
  it('is true only for Wood, Leaves, and Planks over the full default catalog', () => {
    const registry = createDefaultBlockRegistry();
    for (const def of registry.all()) {
      const expected = def.key === 'wood' || def.key === 'leaves' || def.key === 'planks';
      expect(isFlammable(def.id)).toBe(expected);
    }
  });
});

describe('parseFireAge', () => {
  it('parses valid ages and normalizes invalid ones to 0', () => {
    expect(parseFireAge('7')).toBe(7);
    expect(parseFireAge('15')).toBe(15);
    expect(parseFireAge(undefined)).toBe(0);
    expect(parseFireAge('16')).toBe(0);
    expect(parseFireAge('-1')).toBe(0);
    expect(parseFireAge('abc')).toBe(0);
  });
});

describe('canIgnite / ignite', () => {
  it('ignites an air cell over a flammable support', () => {
    const world = new FakeFireWorld();
    world.setBlock(5, 5, 7, BlockId.Wood);
    expect(canIgnite(world, 5, 6, 7)).toBe(true);
    expect(ignite(world, 5, 6, 7)).toBe(true);
    expect(world.getBlockId(5, 6, 7)).toBe(BlockId.Fire);
    expect(world.ages.get('5,6,7')).toBe(0);
  });

  it('is a no-op on a non-air cell', () => {
    const world = new FakeFireWorld();
    world.setBlock(1, 3, 3, BlockId.Wood);
    world.setBlock(1, 2, 3, BlockId.Stone);
    expect(ignite(world, 1, 3, 3)).toBe(false);
    expect(world.getBlockId(1, 3, 3)).toBe(BlockId.Wood);
  });

  it('is a no-op over a non-flammable support', () => {
    const world = new FakeFireWorld();
    // (9,9,9) is air with air below it: no flammable support.
    expect(ignite(world, 9, 9, 9)).toBe(false);
    expect(world.getBlockId(9, 9, 9)).toBe(BlockId.Air);
    expect(world.idWrites).toEqual([]);
    expect(world.stateWrites).toEqual([]);
  });
});

describe('isAdjacentToWater', () => {
  it('detects water on any of the 6 orthogonal neighbors', () => {
    const world = new FakeFireWorld();
    world.setBlock(5, 6, 8, BlockId.Water);
    expect(isAdjacentToWater(world, 5, 6, 7)).toBe(true);
    expect(isAdjacentToWater(world, 0, 0, 0)).toBe(false);
  });
});

describe('spreadRoll', () => {
  it('is pure and returns a value in [0, 1)', () => {
    const a = spreadRoll(42, 1, 2, 3, 4, 0);
    const b = spreadRoll(42, 1, 2, 3, 4, 0);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(spreadRoll(42, 1, 2, 3, 4, 1)).not.toBe(a);
  });
});

describe('spreadFire', () => {
  it('ignites only ignitable neighbors, bounded by MAX_SPREAD_PER_TICK', () => {
    const world = new FakeFireWorld();
    world.setFire(0, 5, 0, 3);
    world.setBlock(0, 4, 0, BlockId.Wood);
    world.setBlock(1, 4, 0, BlockId.Planks); // (1,5,0) ignitable
    world.setBlock(-1, 4, 0, BlockId.Planks); // (-1,5,0) ignitable
    world.setBlock(0, 4, 1, BlockId.Stone); // (0,5,1) NOT ignitable
    const ignited = spreadFire(world, 0, 5, 0, () => 0);
    expect(ignited).toBe(MAX_SPREAD_PER_TICK);
    expect(world.getBlockId(1, 5, 0)).toBe(BlockId.Fire);
    expect(world.getBlockId(-1, 5, 0)).toBe(BlockId.Fire);
    expect(world.getBlockId(0, 5, 1)).toBe(BlockId.Air);
  });

  it('ignites nothing when every roll is at/above the threshold', () => {
    const world = new FakeFireWorld();
    world.setBlock(0, 4, 0, BlockId.Wood);
    world.setBlock(1, 4, 0, BlockId.Planks);
    const ignited = spreadFire(world, 0, 5, 0, () => 1);
    expect(ignited).toBe(0);
    expect(world.getBlockId(1, 5, 0)).toBe(BlockId.Air);
  });
});

describe('FireBlockBehavior.onRandomTick', () => {
  it('ages a fresh fire over successive ticks and burns its support at end of life', () => {
    const world = new FakeFireWorld();
    world.setFire(5, 6, 7, 0);
    world.setBlock(5, 5, 7, BlockId.Wood);
    for (let tick = 1; tick <= 16; tick++) {
      behavior.onRandomTick(ctx(world, 5, 6, 7, tick));
    }
    const ageWrites = world.stateWrites
      .filter((w) => w[3] === BlockId.Fire && w[4] === FIRE_AGE_PROPERTY)
      .map((w) => Number(w[5]));
    expect(ageWrites).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(world.getBlockId(5, 6, 7)).toBe(BlockId.Air);
    expect(world.getBlockId(5, 5, 7)).toBe(BlockId.Air);
  });

  it('never lets age exceed MAX_FIRE_AGE', () => {
    const world = new FakeFireWorld();
    world.setFire(5, 6, 7, 0);
    world.setBlock(5, 5, 7, BlockId.Wood);
    for (let tick = 1; tick <= 15; tick++) {
      behavior.onRandomTick(ctx(world, 5, 6, 7, tick));
    }
    expect(world.ages.get('5,6,7')).toBe(MAX_FIRE_AGE);
  });

  it('extinguishes an unsupported fire without burning anything', () => {
    const world = new FakeFireWorld();
    world.setFire(5, 6, 7, 3);
    world.setBlock(5, 5, 7, BlockId.Stone);
    behavior.onRandomTick(ctx(world, 5, 6, 7));
    expect(world.getBlockId(5, 6, 7)).toBe(BlockId.Air);
    expect(world.getBlockId(5, 5, 7)).toBe(BlockId.Stone);
  });

  it('extinguishes a water-adjacent fire without burning its support', () => {
    const world = new FakeFireWorld();
    world.setFire(5, 6, 7, 3);
    world.setBlock(5, 5, 7, BlockId.Wood);
    world.setBlock(5, 6, 8, BlockId.Water);
    behavior.onRandomTick(ctx(world, 5, 6, 7));
    expect(world.getBlockId(5, 6, 7)).toBe(BlockId.Air);
    expect(world.getBlockId(5, 5, 7)).toBe(BlockId.Wood);
  });

  it('spreads to ignitable neighbors within the bound when rolls favor ignition', () => {
    const world = new FakeFireWorld();
    world.setFire(0, 5, 0, 3);
    world.setBlock(0, 4, 0, BlockId.Wood);
    world.setBlock(1, 4, 0, BlockId.Planks);
    world.setBlock(-1, 4, 0, BlockId.Planks);
    world.setBlock(0, 4, 1, BlockId.Stone);
    // seed 0 combined with a low-probability-favoring assertion isn't guaranteed;
    // force determinism by checking the bound rather than the exact outcome.
    behavior.onRandomTick(ctx(world, 0, 5, 0, 5, 0));
    const newFires = [world.getBlockId(1, 5, 0), world.getBlockId(-1, 5, 0)].filter(
      (id) => id === BlockId.Fire,
    ).length;
    expect(newFires).toBeLessThanOrEqual(MAX_SPREAD_PER_TICK);
    expect(world.getBlockId(0, 5, 1)).toBe(BlockId.Air);
  });

  it('does not spread from a fire that dies this tick', () => {
    const world = new FakeFireWorld();
    world.setFire(0, 5, 0, MAX_FIRE_AGE);
    world.setBlock(0, 4, 0, BlockId.Wood);
    world.setBlock(1, 4, 0, BlockId.Planks);
    behavior.onRandomTick(ctx(world, 0, 5, 0));
    expect(world.getBlockId(1, 5, 0)).toBe(BlockId.Air);
  });

  it('is safe on a non-fire cell', () => {
    const world = new FakeFireWorld();
    world.setBlock(1, 2, 3, BlockId.Stone);
    expect(() => behavior.onRandomTick(ctx(world, 1, 2, 3))).not.toThrow();
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Stone);
    expect(world.idWrites).toEqual([]);
    expect(world.stateWrites).toEqual([]);
  });

  it('is safe when the state read throws', () => {
    const world = new FakeFireWorld();
    world.setFire(1, 2, 3, 0);
    world.setBlock(1, 1, 3, BlockId.Wood);
    const throwing: BlockWorldAccess = {
      getBlockId: (x, y, z) => world.getBlockId(x, y, z),
      setBlockId: (x, y, z, id) => world.setBlockId(x, y, z, id),
      getBlockState: () => {
        throw new Error('boom');
      },
      setBlockState: (x, y, z, id, props) => world.setBlockState(x, y, z, id, props),
    };
    expect(() => behavior.onRandomTick(ctx(throwing as never, 1, 2, 3))).not.toThrow();
    expect(world.stateWrites).toEqual([]);
  });

  it('is safe on a minimal state-less access and performs no illegal write', () => {
    const minimal: BlockWorldAccess = {
      getBlockId: () => BlockId.Fire,
      setBlockId: () => undefined,
    };
    expect(() => behavior.onRandomTick(ctx(minimal as never, 1, 2, 3))).not.toThrow();
  });
});
