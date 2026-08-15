import { describe, it, expect } from 'vitest';
import {
  FarmlandBlockBehavior,
  isFarmlandHydrated,
  nextMoisture,
  parseMoisture,
  shouldRevertToDirt,
  trampleFarmland,
  isCropAbove,
  hasSolidCoverAbove,
} from '../../src/simulation/FarmlandBehavior';
import { BlockId } from '../../src/world/BlockRegistry';
import type { BlockState } from '../../src/world/BlockStateRegistry';
import type { BlockWorldAccess } from '../../src/simulation/BlockBehavior';

/** A sampler backed by a Map, used for pure helper tests. */
function sampler(cells: ReadonlyMap<string, number>) {
  return {
    getBlock(x: number, y: number, z: number): number {
      return cells.get(`${x},${y},${z}`) ?? BlockId.Air;
    },
  };
}

/** A fake BlockWorldAccess holding ids, farmland moisture, wheat ages, and recording writes. */
class FakeFarmlandWorld implements BlockWorldAccess {
  readonly ids = new Map<string, number>();
  readonly moisture = new Map<string, number>();
  readonly ages = new Map<string, number>();
  /** Recorded setBlockId calls: [x, y, z, id]. */
  readonly idWrites: Array<[number, number, number, number]> = [];
  /** Recorded setBlockState calls: [x, y, z, blockId, propName, propValue]. */
  readonly stateWrites: Array<[number, number, number, number, string, string]> = [];

  setBlock(x: number, y: number, z: number, id: number): void {
    this.ids.set(`${x},${y},${z}`, id);
  }

  setWater(x: number, y: number, z: number): void {
    this.setBlock(x, y, z, BlockId.Water);
  }

  setFarmland(x: number, y: number, z: number, moisture = 0): void {
    this.setBlock(x, y, z, BlockId.Farmland);
    this.moisture.set(`${x},${y},${z}`, moisture);
  }

  setWheat(x: number, y: number, z: number, age = 0): void {
    this.setBlock(x, y, z, BlockId.Wheat);
    this.ages.set(`${x},${y},${z}`, age);
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.ids.get(`${x},${y},${z}`) ?? BlockId.Air;
  }

  /** Sampler surface: same as getBlockId, so the fake also satisfies BlockSampler/FarmlandWorld. */
  getBlock(x: number, y: number, z: number): number {
    return this.getBlockId(x, y, z);
  }

  setBlockId(x: number, y: number, z: number, id: number): void {
    this.setBlock(x, y, z, id);
    this.idWrites.push([x, y, z, id]);
  }

  getBlockState(x: number, y: number, z: number): BlockState {
    const key = `${x},${y},${z}`;
    const moisture = this.moisture.get(key);
    const age = this.ages.get(key);
    return {
      getProperty(name: string): string | undefined {
        if (name === 'moisture') return moisture === undefined ? undefined : String(moisture);
        if (name === 'age') return age === undefined ? undefined : String(age);
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
    if (blockId === BlockId.Farmland && properties.moisture !== undefined) {
      this.moisture.set(key, Number(properties.moisture));
    } else if (blockId === BlockId.Wheat && properties.age !== undefined) {
      this.ages.set(key, Number(properties.age));
    }
    const [propName, propValue] = Object.entries(properties)[0] ?? [];
    this.stateWrites.push([x, y, z, blockId, propName ?? '', String(propValue ?? '')]);
  }
}

const FARMLAND = BlockId.Farmland;
const behavior = new FarmlandBlockBehavior();
const ctx = (world: FakeFarmlandWorld, x: number, y: number, z: number, tick = 1) => ({
  x,
  y,
  z,
  tick,
  world,
});

describe('isFarmlandHydrated', () => {
  it('is true for water within the Chebyshev radius at dy -1 or 0', () => {
    expect(isFarmlandHydrated(sampler(new Map([['6,1,3', BlockId.Water]])), 2, 2, 3)).toBe(true);
    expect(isFarmlandHydrated(sampler(new Map([['2,2,3', BlockId.Water]])), 2, 2, 3)).toBe(true);
  });

  it('is false for water outside the horizontal radius', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(0, 0, 0, 0);
    world.setWater(5, 0, 0); // |dx| = 5 > 4
    expect(isFarmlandHydrated(world, 0, 0, 0)).toBe(false);
  });

  it('is false for water above the allowed vertical band', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(0, 0, 0, 0);
    world.setWater(0, 1, 0); // dy = +1 not in {-1, 0}
    expect(isFarmlandHydrated(world, 0, 0, 0)).toBe(false);
  });
});

describe('nextMoisture / parseMoisture', () => {
  it('rises toward 7 when hydrated and falls toward 0 when dry', () => {
    expect(nextMoisture(0, true)).toBe(1);
    expect(nextMoisture(5, false)).toBe(4);
  });

  it('clamps at the bounds', () => {
    expect(nextMoisture(7, true)).toBe(7);
    expect(nextMoisture(0, false)).toBe(0);
  });

  it('normalizes malformed moisture to 0', () => {
    expect(parseMoisture('5')).toBe(5);
    expect(parseMoisture(undefined)).toBe(0);
    expect(parseMoisture('9')).toBe(0);
    expect(parseMoisture('abc')).toBe(0);
  });
});

describe('reversion predicates', () => {
  it('shouldRevertToDirt only for dry, empty farmland', () => {
    expect(shouldRevertToDirt(0, false)).toBe(true);
    expect(shouldRevertToDirt(0, true)).toBe(false);
    expect(shouldRevertToDirt(1, false)).toBe(false);
  });

  it('isCropAbove detects wheat directly above', () => {
    const world = new FakeFarmlandWorld();
    world.setWheat(0, 1, 0, 3);
    expect(isCropAbove(world, 0, 0, 0)).toBe(true);
    expect(isCropAbove(world, 1, 0, 0)).toBe(false);
  });

  it('hasSolidCoverAbove treats non-air/non-wheat as solid cover but not the crop', () => {
    const world = new FakeFarmlandWorld();
    expect(hasSolidCoverAbove(world, 0, 0, 0)).toBe(false); // air above
    world.setWheat(0, 1, 0, 0);
    expect(hasSolidCoverAbove(world, 0, 0, 0)).toBe(false); // crop is not cover
    world.setBlock(0, 1, 0, BlockId.Stone);
    expect(hasSolidCoverAbove(world, 0, 0, 0)).toBe(true);
  });
});

describe('trampleFarmland', () => {
  it('reverts farmland to dirt', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 4);
    trampleFarmland(world, 1, 2, 3);
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Dirt);
  });

  it('is a no-op on non-farmland', () => {
    const world = new FakeFarmlandWorld();
    world.setBlock(1, 2, 3, BlockId.Grass);
    trampleFarmland(world, 1, 2, 3);
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Grass);
  });
});

describe('FarmlandBlockBehavior.onRandomTick', () => {
  it('moistens hydrated farmland toward 7 then stops writing', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 0);
    world.setWater(1, 1, 3); // dy -1 within radius
    for (let i = 0; i < 12; i++) {
      behavior.onRandomTick(ctx(world, 1, 2, 3, i));
    }
    expect(world.moisture.get('1,2,3')).toBe(7);
    // Only 7 moisture writes (1..7); the hydrated farmland never reverts.
    const moistureWrites = world.stateWrites.filter((w) => w[3] === FARMLAND);
    expect(moistureWrites.map((w) => w[5])).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(world.idWrites).toEqual([]);
  });

  it('dries non-hydrated farmland toward 0', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 5);
    behavior.onRandomTick(ctx(world, 1, 2, 3));
    expect(world.moisture.get('1,2,3')).toBe(4);
  });

  it('reverts dry, empty farmland to dirt', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 0);
    behavior.onRandomTick(ctx(world, 1, 2, 3));
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Dirt);
    expect(world.idWrites).toEqual([[1, 2, 3, BlockId.Dirt]]);
  });

  it('does not revert while a crop is on top', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 0);
    world.setWheat(1, 3, 3, 0);
    behavior.onRandomTick(ctx(world, 1, 2, 3));
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Farmland);
    expect(world.idWrites).toEqual([]);
  });

  it('reverts when a solid cover is above via the scheduled random-tick fallback', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 5); // not dry, so only the solid-cover rule applies
    world.setBlock(1, 3, 3, BlockId.Stone);
    behavior.onRandomTick(ctx(world, 1, 2, 3));
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Dirt);
  });

  it('grows the wheat crop above when hydrated', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 0);
    world.setWheat(1, 3, 3, 3);
    world.setWater(1, 1, 3);
    behavior.onRandomTick(ctx(world, 1, 2, 3));
    expect(world.ages.get('1,3,3')).toBe(4);
  });

  it('does not grow the crop above when dry', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 0);
    world.setWheat(1, 3, 3, 3);
    behavior.onRandomTick(ctx(world, 1, 2, 3));
    expect(world.ages.get('1,3,3')).toBe(3);
    expect(world.stateWrites.some((w) => w[3] === BlockId.Wheat)).toBe(false);
  });

  it('does not grow a mature crop above', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 0);
    world.setWheat(1, 3, 3, 7);
    world.setWater(1, 1, 3);
    behavior.onRandomTick(ctx(world, 1, 2, 3));
    expect(world.ages.get('1,3,3')).toBe(7);
  });

  it('is a no-op when the access lacks state capability', () => {
    const minimal: BlockWorldAccess = {
      getBlockId: () => BlockId.Farmland,
      setBlockId: () => undefined,
    };
    expect(() => behavior.onRandomTick(ctx(minimal as never, 1, 2, 3))).not.toThrow();
  });

  it('is a no-op on a non-farmland cell', () => {
    const world = new FakeFarmlandWorld();
    world.setBlock(1, 2, 3, BlockId.Grass);
    expect(() => behavior.onRandomTick(ctx(world, 1, 2, 3))).not.toThrow();
    expect(world.stateWrites).toEqual([]);
  });
});

describe('FarmlandBlockBehavior.onNeighborChanged', () => {
  it('reverts farmland when a solid block is placed directly above', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 5);
    world.setBlock(1, 3, 3, BlockId.Stone);
    behavior.onNeighborChanged?.(ctx(world, 1, 2, 3), 1, 3, 3);
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Dirt);
  });

  it('does not revert when the crop is placed above', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 5);
    world.setWheat(1, 3, 3, 0);
    behavior.onNeighborChanged?.(ctx(world, 1, 2, 3), 1, 3, 3);
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Farmland);
  });

  it('ignores neighbor changes that are not directly above', () => {
    const world = new FakeFarmlandWorld();
    world.setFarmland(1, 2, 3, 5);
    world.setBlock(2, 2, 3, BlockId.Stone);
    behavior.onNeighborChanged?.(ctx(world, 1, 2, 3), 2, 2, 3);
    expect(world.getBlockId(1, 2, 3)).toBe(BlockId.Farmland);
  });
});
