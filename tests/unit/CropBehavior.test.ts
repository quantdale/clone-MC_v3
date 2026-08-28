import { describe, it, expect } from 'vitest';
import { CropBlockBehavior } from '../../src/simulation/CropBehavior';
import { BlockId } from '../../src/world/BlockRegistry';
import type { BlockState } from '../../src/world/BlockStateRegistry';
import type { BlockWorldAccess } from '../../src/simulation/BlockBehavior';

/** A fake BlockWorldAccess holding an age per cell and recording writes. */
class FakeCropWorld implements BlockWorldAccess {
  /** cell key -> current age. */
  readonly ages = new Map<string, number>();
  /** Recorded setBlockState calls: [x, y, z, blockId, age]. */
  readonly writes: Array<[number, number, number, number, number]> = [];
  /** When true, getBlockState throws (simulates a malformed state read). */
  readThrows = false;
  /** When true, getBlockState returns a non-numeric age. */
  badAge = false;
  readonly blockId: number;

  constructor(blockId: number) {
    this.blockId = blockId;
  }

  seed(x: number, y: number, z: number, age: number): void {
    this.ages.set(`${x},${y},${z}`, age);
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.ages.has(`${x},${y},${z}`) ? this.blockId : BlockId.Air;
  }

  setBlockId(): void {
    /* no-op */
  }

  getBlockState(x: number, y: number, z: number): BlockState {
    if (this.readThrows) {
      throw new Error('malformed state read');
    }
    const age = this.ages.get(`${x},${y},${z}`) ?? 0;
    const value = this.badAge ? 'not-a-number' : String(age);
    return {
      getProperty(name: string): string | undefined {
        return name === 'age' ? value : undefined;
      },
      // Satisfy the BlockState type for the fake; unused by the behavior.
      assignments: [['age', value] as const],
    } as unknown as BlockState;
  }

  setBlockState(x: number, y: number, z: number, blockId: number, properties: Record<string, boolean | number | string>): void {
    const age = Number(properties.age);
    this.ages.set(`${x},${y},${z}`, age);
    this.writes.push([x, y, z, blockId, age]);
  }
}

describe('CropBlockBehavior.onRandomTick', () => {
  it('increments age one stage per tick to maturity and then stops', () => {
    const world = new FakeCropWorld(BlockId.Wheat);
    world.seed(1, 2, 3, 0);
    const behavior = new CropBlockBehavior(BlockId.Wheat);

    for (let i = 0; i < 10; i++) {
      behavior.onRandomTick({ x: 1, y: 2, z: 3, tick: i, world });
    }

    expect(world.ages.get('1,2,3')).toBe(7);
    // 7 writes for ages 1..7, then a mature tick writes nothing.
    expect(world.writes.map((w) => w[4])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(world.writes.length).toBe(7);
    // Every write carries the wheat block id at the correct coordinates.
    for (const [, , , blockId] of world.writes) {
      expect(blockId).toBe(BlockId.Wheat);
    }
  });

  it('writes nothing when the block id does not match', () => {
    const world = new FakeCropWorld(BlockId.Wheat);
    // No cell seeded at (0,0,0) -> getBlockId returns Air (not the crop).
    const behavior = new CropBlockBehavior(BlockId.Wheat);
    behavior.onRandomTick({ x: 0, y: 0, z: 0, tick: 1, world });
    expect(world.writes.length).toBe(0);
  });

  it('treats a non-numeric age as age 0 without throwing', () => {
    const world = new FakeCropWorld(BlockId.Wheat);
    world.seed(5, 6, 7, 0);
    world.badAge = true;
    const behavior = new CropBlockBehavior(BlockId.Wheat);
    behavior.onRandomTick({ x: 5, y: 6, z: 7, tick: 1, world });
    expect(world.ages.get('5,6,7')).toBe(1);
  });

  it('skips growth without throwing when the state read throws', () => {
    const world = new FakeCropWorld(BlockId.Wheat);
    world.seed(9, 9, 9, 0);
    world.readThrows = true;
    const behavior = new CropBlockBehavior(BlockId.Wheat);
    expect(() => behavior.onRandomTick({ x: 9, y: 9, z: 9, tick: 1, world })).not.toThrow();
    expect(world.writes.length).toBe(0);
  });

  it('is a no-op when the access lacks state capability', () => {
    const minimal: BlockWorldAccess = {
      getBlockId: () => BlockId.Wheat,
      setBlockId: () => undefined,
    };
    const behavior = new CropBlockBehavior(BlockId.Wheat);
    expect(() => behavior.onRandomTick({ x: 1, y: 1, z: 1, tick: 1, world: minimal })).not.toThrow();
  });
});
