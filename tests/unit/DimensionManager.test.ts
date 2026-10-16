import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { DimensionType } from '../../src/data/DimensionType';
import { DimensionManager } from '../../src/world/DimensionManager';
import type { WorldAccess } from '../../src/world/WorldAccess';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function makeFakeWorld(): WorldAccess {
  const store = new Map<string, number>();
  return {
    getBlock(x, y, z) {
      return store.get(key(x, y, z)) ?? 0;
    },
    setBlock(x, y, z, id) {
      store.set(key(x, y, z), id);
    },
    isSolid(x, y, z) {
      return (store.get(key(x, y, z)) ?? 0) !== 0;
    },
  };
}

const OVERWORLD = new DimensionType({
  id: createResourceId('minecraft', 'overworld'),
  minY: -64,
  height: 384,
  logicalHeight: 384,
  hasSkylight: true,
});

const NETHER = new DimensionType({
  id: createResourceId('minecraft', 'the_nether'),
  minY: 0,
  height: 256,
  logicalHeight: 256,
  hasSkylight: false,
  ultrawarm: true,
});

describe('registerDimension', () => {
  it('stores the dimension keyed by its type id with a fresh independent queue', () => {
    const manager = new DimensionManager();
    const loaded = manager.registerDimension(OVERWORLD, makeFakeWorld());
    expect(loaded.key).toBe('minecraft:overworld');
    expect(manager.hasDimension('minecraft:overworld')).toBe(true);
    expect(manager.size).toBe(1);

    const nether = manager.registerDimension(NETHER, makeFakeWorld());
    expect(nether.key).toBe('minecraft:the_nether');
    expect(loaded.tickQueue).not.toBe(nether.tickQueue); // independent queues
    expect(loaded.tickQueue.size).toBe(0);
  });

  it('rejects duplicate keys with DUPLICATE_ID', () => {
    const manager = new DimensionManager();
    manager.registerDimension(OVERWORLD, makeFakeWorld());
    expect(() => manager.registerDimension(OVERWORLD, makeFakeWorld())).toThrow(/DUPLICATE_ID/);
  });

  it('accepts a caller-supplied tick queue for the dimension', () => {
    const manager = new DimensionManager();
    const loaded = manager.registerDimension(OVERWORLD, makeFakeWorld());
    const same = manager.getDimension('minecraft:overworld');
    expect(same?.tickQueue).toBe(loaded.tickQueue);
  });
});

describe('lookups', () => {
  it('round-trips world and tick queue; unknown keys are undefined', () => {
    const manager = new DimensionManager();
    const overworldWorld = makeFakeWorld();
    manager.registerDimension(OVERWORLD, overworldWorld);

    expect(manager.getDimension('minecraft:overworld')?.world).toBe(overworldWorld);
    expect(manager.getWorld('minecraft:overworld')).toBe(overworldWorld);
    expect(manager.getTickQueue('minecraft:overworld')).toBeDefined();
    expect(manager.hasDimension('minecraft:the_end')).toBe(false);
    expect(manager.getDimension('minecraft:the_end')).toBeUndefined();
    expect(manager.getWorld('minecraft:the_end')).toBeUndefined();
    expect(manager.getTickQueue('minecraft:the_end')).toBeUndefined();
    expect(manager.removeDimension('minecraft:the_end')).toBe(false);
  });

  it('lists dimensions in registration order', () => {
    const manager = new DimensionManager();
    manager.registerDimension(OVERWORLD, makeFakeWorld());
    manager.registerDimension(NETHER, makeFakeWorld());
    expect(manager.dimensions().map((d) => d.key)).toEqual([
      'minecraft:overworld',
      'minecraft:the_nether',
    ]);
    expect(manager.size).toBe(2);
  });

  it('removeDimension removes exactly the requested key (idempotent)', () => {
    const manager = new DimensionManager();
    manager.registerDimension(OVERWORLD, makeFakeWorld());
    manager.registerDimension(NETHER, makeFakeWorld());
    expect(manager.removeDimension('minecraft:overworld')).toBe(true);
    expect(manager.hasDimension('minecraft:overworld')).toBe(false);
    expect(manager.removeDimension('minecraft:overworld')).toBe(false);
    expect(manager.hasDimension('minecraft:the_nether')).toBe(true);
    expect(manager.size).toBe(1);
  });
});

describe('tickAll', () => {
  it('drains each dimension\'s queue independently at the due tick', () => {
    const manager = new DimensionManager();
    manager.registerDimension(OVERWORLD, makeFakeWorld());
    manager.registerDimension(NETHER, makeFakeWorld());

    manager.getTickQueue('minecraft:overworld')!.schedule(1, 2, 3, 8);
    manager.getTickQueue('minecraft:the_nether')!.schedule(4, 5, 6, 4);

    const at4 = manager.tickAll(4);
    expect(at4.get('minecraft:overworld')).toEqual([]); // 8 not due yet
    expect(at4.get('minecraft:the_nether')?.map((t) => [t.x, t.y, t.z])).toEqual([[4, 5, 6]]);

    const at8 = manager.tickAll(8);
    expect(at8.get('minecraft:overworld')?.map((t) => [t.x, t.y, t.z])).toEqual([[1, 2, 3]]);
    expect(at8.get('minecraft:the_nether')).toEqual([]); // already drained at tick 4
  });

  it('is deterministic across repeated calls and covers every registered dimension', () => {
    const build = (): string[] => {
      const manager = new DimensionManager();
      manager.registerDimension(OVERWORLD, makeFakeWorld());
      manager.registerDimension(NETHER, makeFakeWorld());
      manager.getTickQueue('minecraft:overworld')!.schedule(1, 2, 3, 8);
      manager.getTickQueue('minecraft:the_nether')!.schedule(4, 5, 6, 4);
      return [...manager.tickAll(8).entries()].map(
        ([k, v]) => `${k}:${v.map((t) => `${t.x},${t.y},${t.z}`).join('|')}`,
      );
    };
    const first = build();
    const second = build();
    expect(first).toEqual(second);
    expect(first.length).toBe(2); // both dimensions present
    expect(first).toEqual([
      'minecraft:overworld:1,2,3',
      'minecraft:the_nether:4,5,6',
    ]);
  });
});

describe('per-dimension height metadata (025)', () => {
  it('each loaded dimension carries its own vertical extent', () => {
    const manager = new DimensionManager();
    manager.registerDimension(OVERWORLD, makeFakeWorld());
    manager.registerDimension(NETHER, makeFakeWorld());

    const overworld = manager.getDimension('minecraft:overworld')!;
    expect(overworld.type.minY).toBe(-64);
    expect(overworld.type.sectionCount).toBe(24); // ceil(384/16)
    expect(overworld.type.hasSkylight).toBe(true);
    expect(overworld.type.containsY(-64)).toBe(true);
    expect(overworld.type.containsY(319)).toBe(true); // maxY = minY + height - 1
    expect(overworld.type.containsY(320)).toBe(false);
    expect(overworld.type.containsY(-65)).toBe(false);

    const nether = manager.getDimension('minecraft:the_nether')!;
    expect(nether.type.minY).toBe(0);
    expect(nether.type.sectionCount).toBe(16); // ceil(256/16)
    expect(nether.type.hasSkylight).toBe(false);
    expect(nether.type.ultrawarm).toBe(true);
    expect(nether.type.containsY(-1)).toBe(false);
    expect(nether.type.containsY(255)).toBe(true);
  });

  it('worlds are independent: edits in one dimension never leak into another', () => {
    const manager = new DimensionManager();
    const overworldWorld = makeFakeWorld();
    const netherWorld = makeFakeWorld();
    manager.registerDimension(OVERWORLD, overworldWorld);
    manager.registerDimension(NETHER, netherWorld);

    overworldWorld.setBlock(10, 10, 10, 3);
    expect(overworldWorld.getBlock(10, 10, 10)).toBe(3);
    expect(netherWorld.getBlock(10, 10, 10)).toBe(0);
  });
});
