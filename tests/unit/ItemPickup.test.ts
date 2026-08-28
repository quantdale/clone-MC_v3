import { describe, it, expect } from 'vitest';
import {
  ItemEntityManager,
  PICKUP_DELAY_TICKS,
  DESPAWN_AGE_TICKS,
  PICKUP_RADIUS,
} from '../../src/simulation/ItemEntityManager';
import { createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';
import { createResourceId } from '../../src/data/ResourceId';

const registry = createDefaultItemRegistry();
const idOf = (path: string) =>
  registry.getByResourceId(createResourceId('minecraft', path)).id;

const STONE = idOf('stone'); // stackSize 64
const DIRT = idOf('dirt');
const APPLE = idOf('apple');

function newManager() {
  return new ItemEntityManager({ itemRegistry: registry });
}

/** A recording insert mock returning a fixed leftover for every call. */
function makeInsert(returnValue: number) {
  const calls: { item: number; count: number }[] = [];
  const insert = (item: number, count: number) => {
    calls.push({ item, count });
    return returnValue;
  };
  return { insert, calls };
}

describe('ItemEntityManager pickup delay', () => {
  it('does not collect a drop younger than PICKUP_DELAY_TICKS and never calls insert', () => {
    const m = newManager();
    const e = m.spawnItemEntity({ item: STONE, count: 3 }, 0, 0, 0);
    e.ageTicks = PICKUP_DELAY_TICKS - 1;
    const { insert, calls } = makeInsert(0);
    const collected = m.collectPlayerDrops(0, 0, 0, insert);
    expect(calls).toHaveLength(0);
    expect(collected).toBe(0);
    expect(m.getItemEntity(e.id)).not.toBeNull();
    expect(m.size).toBe(1);
  });

  it('collects on the first tick at or after PICKUP_DELAY_TICKS', () => {
    const m = newManager();
    const e = m.spawnItemEntity({ item: STONE, count: 3 }, 0, 0, 0);
    e.ageTicks = PICKUP_DELAY_TICKS;
    const { insert, calls } = makeInsert(0);
    const collected = m.collectPlayerDrops(0, 0, 0, insert);
    expect(calls).toEqual([{ item: STONE, count: 3 }]);
    expect(collected).toBe(3);
    expect(m.getItemEntity(e.id)).toBeNull();
    expect(m.size).toBe(0);
  });
});

describe('ItemEntityManager merge policy', () => {
  it('merges overlapping same-item drops and sums their counts', () => {
    const m = newManager();
    const a = m.spawnItemEntity({ item: STONE, count: 10 }, 0, 0, 0);
    m.spawnItemEntity({ item: STONE, count: 5 }, 0.1, 0, 0);
    const removed = m.mergeEntities();
    expect(removed).toBe(1);
    expect(m.size).toBe(1);
    expect(m.getItemEntity(a.id)!.count).toBe(15);
  });

  it('does not merge drops farther apart than MERGE_RADIUS', () => {
    const m = newManager();
    m.spawnItemEntity({ item: STONE, count: 10 }, 0, 0, 0);
    m.spawnItemEntity({ item: STONE, count: 10 }, 1, 0, 0);
    const removed = m.mergeEntities();
    expect(removed).toBe(0);
    expect(m.size).toBe(2);
  });

  it('leaves both drops when the merged count would exceed stackSize', () => {
    const m = newManager();
    m.spawnItemEntity({ item: STONE, count: 50 }, 0, 0, 0);
    m.spawnItemEntity({ item: STONE, count: 40 }, 0.1, 0, 0);
    const removed = m.mergeEntities();
    expect(removed).toBe(0);
    expect(m.size).toBe(2);
  });

  it('never merges different items', () => {
    const m = newManager();
    m.spawnItemEntity({ item: STONE, count: 10 }, 0, 0, 0);
    m.spawnItemEntity({ item: DIRT, count: 10 }, 0, 0, 0);
    const removed = m.mergeEntities();
    expect(removed).toBe(0);
    expect(m.size).toBe(2);
  });

  it('is idempotent on a static world (three overlapping drops fold into one)', () => {
    const m = newManager();
    m.spawnItemEntity({ item: STONE, count: 10 }, 0, 0, 0);
    m.spawnItemEntity({ item: STONE, count: 10 }, 0.1, 0, 0);
    m.spawnItemEntity({ item: STONE, count: 10 }, 0.05, 0, 0);
    const first = m.mergeEntities();
    expect(first).toBe(2);
    expect(m.size).toBe(1);
    expect(m.mergeEntities()).toBe(0);
    expect(m.size).toBe(1);
  });
});

describe('ItemEntityManager inventory insertion', () => {
  it('removes the entity on a full insert and returns the collected count', () => {
    const m = newManager();
    const e = m.spawnItemEntity({ item: APPLE, count: 3 }, 0, 0, 0);
    e.ageTicks = PICKUP_DELAY_TICKS;
    const { insert } = makeInsert(0);
    const collected = m.collectPlayerDrops(0, 0, 0, insert);
    expect(collected).toBe(3);
    expect(m.getItemEntity(e.id)).toBeNull();
  });

  it('reduces count to the leftover on a partial insert', () => {
    const m = newManager();
    const e = m.spawnItemEntity({ item: APPLE, count: 5 }, 0, 0, 0);
    e.ageTicks = PICKUP_DELAY_TICKS;
    const { insert, calls } = makeInsert(2);
    const collected = m.collectPlayerDrops(0, 0, 0, insert);
    expect(calls[0]).toEqual({ item: APPLE, count: 5 });
    expect(collected).toBe(3);
    expect(m.getItemEntity(e.id)!.count).toBe(2);
    expect(m.size).toBe(1);
  });

  it('skips an entity outside the pickup radius', () => {
    const m = newManager();
    const e = m.spawnItemEntity({ item: APPLE, count: 1 }, PICKUP_RADIUS + 1, 0, 0);
    e.ageTicks = PICKUP_DELAY_TICKS;
    const { insert, calls } = makeInsert(0);
    const collected = m.collectPlayerDrops(0, 0, 0, insert);
    expect(calls).toHaveLength(0);
    expect(collected).toBe(0);
    expect(m.getItemEntity(e.id)).not.toBeNull();
  });

  it('leaves the entity untouched when the inventory is full', () => {
    const m = newManager();
    const e = m.spawnItemEntity({ item: APPLE, count: 4 }, 0, 0, 0);
    e.ageTicks = PICKUP_DELAY_TICKS;
    const { insert, calls } = makeInsert(4);
    const collected = m.collectPlayerDrops(0, 0, 0, insert);
    expect(calls[0]).toEqual({ item: APPLE, count: 4 });
    expect(collected).toBe(0);
    expect(m.getItemEntity(e.id)!.count).toBe(4);
    expect(m.size).toBe(1);
  });

  it('sums collected counts across multiple eligible drops', () => {
    const m = newManager();
    const a = m.spawnItemEntity({ item: APPLE, count: 3 }, 0, 0, 0);
    const b = m.spawnItemEntity({ item: APPLE, count: 2 }, 0.1, 0, 0);
    a.ageTicks = PICKUP_DELAY_TICKS;
    b.ageTicks = PICKUP_DELAY_TICKS;
    const { insert } = makeInsert(0);
    const collected = m.collectPlayerDrops(0, 0, 0, insert);
    expect(collected).toBe(5);
    expect(m.size).toBe(0);
  });
});

describe('ItemEntityManager despawn timer', () => {
  it('removes an entity at or past DESPAWN_AGE_TICKS', () => {
    const m = newManager();
    const e = m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    e.ageTicks = DESPAWN_AGE_TICKS;
    const removed = m.despawnExpired();
    expect(removed).toBe(1);
    expect(m.getItemEntity(e.id)).toBeNull();
    expect(m.size).toBe(0);
  });

  it('keeps an entity one tick younger than the cap', () => {
    const m = newManager();
    const e = m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    e.ageTicks = DESPAWN_AGE_TICKS - 1;
    const removed = m.despawnExpired();
    expect(removed).toBe(0);
    expect(m.getItemEntity(e.id)).not.toBeNull();
  });

  it('is a no-op with no eligible entities', () => {
    const m = newManager();
    m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    m.spawnItemEntity({ item: STONE, count: 1 }, 5, 0, 0);
    expect(m.despawnExpired(1000)).toBe(0);
    expect(m.size).toBe(2);
  });

  it('despawns only the aged entity when others are young', () => {
    const m = newManager();
    const old = m.spawnItemEntity({ item: STONE, count: 1 }, 0, 0, 0);
    const young = m.spawnItemEntity({ item: STONE, count: 1 }, 5, 0, 0);
    old.ageTicks = DESPAWN_AGE_TICKS;
    young.ageTicks = 0;
    const removed = m.despawnExpired();
    expect(removed).toBe(1);
    expect(m.getItemEntity(old.id)).toBeNull();
    expect(m.getItemEntity(young.id)).not.toBeNull();
  });
});
