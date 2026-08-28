import { describe, it, expect } from 'vitest';
import { ItemEntityManager, type ItemStackLike } from '../../src/simulation/ItemEntityManager';
import { createSpawnPosition, ITEM_ENTITY_TYPE_KEY, type ItemEntity } from '../../src/world/ItemEntity';
import { createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';
import { createResourceId } from '../../src/data/ResourceId';

const registry = createDefaultItemRegistry();
const idOf = (path: string): number =>
  registry.getByResourceId(createResourceId('minecraft', path)).id;

const STONE = idOf('stone'); // stackSize 64
const DIRT = idOf('dirt');
const SAND = idOf('sand');

function manager(): ItemEntityManager {
  return new ItemEntityManager({ itemRegistry: registry });
}

describe('ItemEntityManager id minting', () => {
  it('assigns sequential, unique ids', () => {
    const m = manager();
    const a = m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    const b = m.spawnItemEntity({ item: DIRT, count: 1 }, 1, 0, 0);
    const c = m.spawnItemEntity({ item: SAND, count: 1 }, 2, 0, 0);
    expect([a.id, b.id, c.id]).toEqual([0, 1, 2]);
    expect(m.size).toBe(3);
  });

  it('continues minting above the highest deserialized id', () => {
    const m = manager();
    m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0, { id: 5 });
    m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0, { id: 9 });
    m.deserializeAll(m.serializeAll());
    const next = m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    expect(next.id).toBeGreaterThan(9);
    // No id is reused.
    expect(new Set(m.getItemEntities().map((e) => e.id)).size).toBe(m.size);
  });
});

describe('ItemEntityManager spawn validation', () => {
  it('rejects an unknown item id and leaves the manager unchanged', () => {
    const m = manager();
    expect(() => m.spawnItemEntity({ item: 99999, count: 1 }, 0, 0, 0)).toThrow();
    expect(m.size).toBe(0);
  });

  it('rejects a count above stackSize', () => {
    const m = manager();
    expect(() => m.spawnItemEntity({ item: STONE, count: 100 }, 0, 0, 0)).toThrow(/stackSize/);
    expect(m.size).toBe(0);
  });

  it('rejects a non-positive or non-integer count', () => {
    const m = manager();
    expect(() => m.spawnItemEntity({ item: STONE, count: 0 }, 0, 0, 0)).toThrow();
    expect(() => m.spawnItemEntity({ item: STONE, count: 1.5 }, 0, 0, 0)).toThrow();
    expect(m.size).toBe(0);
  });

  it('rejects non-finite coordinates', () => {
    const m = manager();
    expect(() => m.spawnItemEntity({ item: STONE, count: 1 }, NaN, 0, 0)).toThrow();
    expect(() => m.spawnItemEntity({ item: STONE, count: 1 }, 0, Infinity, 0)).toThrow();
    expect(m.size).toBe(0);
  });

  it('rejects non-finite velocity', () => {
    const m = manager();
    expect(() => m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0, { vx: NaN })).toThrow();
  });
});

describe('ItemEntityManager stack splitting', () => {
  it('splits an oversized count into stackSize chunks', () => {
    const m = manager();
    // stone stackSize 64 -> 64,64,64,8
    const spawned = m.spawnLootStacks([{ item: STONE, count: 200 }], 10, 20, 30);
    expect(spawned).toHaveLength(4);
    expect(spawned.map((e) => e.count)).toEqual([64, 64, 64, 8]);
    expect(spawned.every((e) => e.item === STONE)).toBe(true);
    expect(m.size).toBe(4);
  });

  it('spawns one entity per stack for distinct items', () => {
    const m = manager();
    const spawned = m.spawnLootStacks(
      [
        { item: STONE, count: 1 },
        { item: DIRT, count: 1 },
      ],
      0,
      0,
      0,
    );
    expect(spawned).toHaveLength(2);
    expect(new Set(spawned.map((e) => e.item))).toEqual(new Set([STONE, DIRT]));
  });

  it('is a no-op for an empty stack list', () => {
    const m = manager();
    expect(m.spawnLootStacks([], 0, 0, 0)).toEqual([]);
    expect(m.size).toBe(0);
  });
});

describe('ItemEntityManager spawn jitter determinism', () => {
  it('places entities at the exact spawn point when no rng is supplied', () => {
    const m = manager();
    const spawned = m.spawnLootStacks([{ item: STONE, count: 200 }], 10.5, 20.5, 30.5);
    expect(spawned.every((e) => e.x === 10.5 && e.y === 20.5 && e.z === 30.5)).toBe(true);
    expect(spawned.every((e) => e.vx === 0 && e.vy === 0 && e.vz === 0)).toBe(true);
  });

  it('reproduces the same layout for a fixed rng', () => {
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.0];
    const makeRng = (): (() => number) => {
      let i = 0;
      return () => seq[i++ % seq.length]!;
    };
    const a = manager();
    const b = manager();
    const sa = a.spawnLootStacks([{ item: STONE, count: 200 }], 5, 5, 5, makeRng()).map((e) => [e.x, e.y, e.z, e.vx, e.vy, e.vz]);
    const sb = b.spawnLootStacks([{ item: STONE, count: 200 }], 5, 5, 5, makeRng()).map((e) => [e.x, e.y, e.z, e.vx, e.vy, e.vz]);
    expect(sa).toEqual(sb);
  });
});

describe('ItemEntityManager age ticking', () => {
  it('advances ageTicks by round(dt*20)', () => {
    const m = manager();
    const e = m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    expect(m.tickItemEntities(1.0)).toBe(1);
    expect(e.ageTicks).toBe(20);
    expect(m.tickItemEntities(0.5)).toBe(1);
    expect(e.ageTicks).toBe(30);
  });

  it('is a no-op for non-positive dt', () => {
    const m = manager();
    const e = m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    expect(m.tickItemEntities(0)).toBe(0);
    expect(m.tickItemEntities(-1)).toBe(0);
    expect(e.ageTicks).toBe(0);
  });
});

describe('ItemEntityManager query and removal', () => {
  it('removes by id and reports size correctly', () => {
    const m = manager();
    const e = m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    expect(m.getItemEntity(e.id)).not.toBeNull();
    expect(m.removeItemEntity(e.id)).toBe(true);
    expect(m.getItemEntity(e.id)).toBeNull();
    expect(m.size).toBe(0);
    expect(m.removeItemEntity(e.id)).toBe(false);
  });

  it('returns entities in insertion order', () => {
    const m = manager();
    m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    m.spawnItemEntity({ item: DIRT, count: 1 }, 0, 0, 0);
    m.spawnItemEntity({ item: SAND, count: 1 }, 0, 0, 0);
    expect(m.getItemEntities().map((e) => e.item)).toEqual([STONE, DIRT, SAND]);
  });

  it('groups entities by chunk via floor(x/16), floor(z/16)', () => {
    const m = manager();
    const inChunk = m.spawnItemEntity({ item: STONE, count: 1 }, 16, 0, 0); // cx 1, cz 0
    const alsoInChunk = m.spawnItemEntity({ item: DIRT, count: 1 }, 17, 0, 0); // cx 1, cz 0
    m.spawnItemEntity({ item: SAND, count: 1 }, 48, 0, 0); // cx 3, cz 0
    const chunk = m.getItemEntitiesInChunk(1, 0);
    expect(chunk.map((e) => e.id).sort()).toEqual([inChunk.id, alsoInChunk.id].sort());
    expect(m.getItemEntitiesInChunk(3, 0)).toHaveLength(1);
  });
});

describe('ItemEntityManager 037 serialization', () => {
  it('round-trips fractional position and velocity exactly', () => {
    const m = manager();
    const e = m.spawnItemEntity({ item: STONE, count: 3 }, 10.25, 20.75, 30.1, { vx: 0.05, vy: 0.05, vz: -0.02 });
    const serialized = m.serializeAll();
    const restored = manager();
    restored.deserializeAll(serialized);
    const got = restored.getItemEntity(e.id) as ItemEntity;
    expect(got).not.toBeNull();
    expect([got.x, got.y, got.z]).toEqual([10.25, 20.75, 30.1]);
    expect([got.vx, got.vy, got.vz]).toEqual([0.05, 0.05, -0.02]);
    expect(got.count).toBe(3);
    expect(got.item).toBe(STONE);
    expect(got.ageTicks).toBe(0);
  });

  it('emits the minecraft:item typeKey with integer envelope coordinates', () => {
    const m = manager();
    m.spawnItemEntity({ item: STONE, count: 1 }, 10.25, 20.75, 30.1);
    const records = m.serializeAll();
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.typeKey).toBe(ITEM_ENTITY_TYPE_KEY);
    expect(record.x).toBe(10);
    expect(record.y).toBe(20);
    expect(record.z).toBe(30);
  });

  it('rejects a foreign typeKey atomically and leaves the manager unchanged', () => {
    const m = manager();
    expect(() =>
      m.deserializeAll([
        { schemaVersion: 1, typeKey: 'minecraft:zombie', x: 0, y: 0, z: 0, data: {} },
      ]),
    ).toThrow(/typeKey/);
    expect(m.size).toBe(0);
  });

  it('rejects malformed item data atomically', () => {
    const m = manager();
    const bad = {
      schemaVersion: 1,
      typeKey: ITEM_ENTITY_TYPE_KEY,
      x: 0,
      y: 0,
      z: 0,
      data: { id: 'not-a-number', item: STONE, count: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ageTicks: 0 },
    };
    expect(() => m.deserializeAll([bad])).toThrow();
    expect(m.size).toBe(0);
  });
});

describe('createSpawnPosition', () => {
  it('returns the block center raised 0.5 on Y', () => {
    expect(createSpawnPosition(2, 3, 4)).toEqual({ x: 2.5, y: 3.5, z: 4.5 });
  });
});

describe('block-break drop routing via spawnLootStacks', () => {
  it('expands the leaves + apple drop into two entities', () => {
    // Mirrors PlayerInteraction.finishBreak for a Leaves block.
    const stacks: ItemStackLike[] = [{ item: idOf('leaves'), count: 1 }, { item: idOf('apple'), count: 1 }];
    const m = manager();
    const spawned = m.spawnLootStacks(stacks, 5.5, 6.5, 7.5);
    expect(spawned).toHaveLength(2);
    expect(spawned.map((e) => e.item).sort()).toEqual([idOf('apple'), idOf('leaves')].sort());
  });
});
