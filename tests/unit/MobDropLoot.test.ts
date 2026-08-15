import { describe, expect, it } from 'vitest';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';
import { createResourceId } from '../../src/data/ResourceId';
import { EntityManager } from '../../src/simulation/EntityManager';
import {
  MobHealthTracker,
  MobDropLootSystem,
  createDefaultMobLootTables,
  createPigMobSpecies,
  createZombieMobSpecies,
  resolveMobDeath,
  type MobSpecies,
} from '../../src/simulation/MobDropLoot';
import { EntityRegistry } from '../../src/data/EntityType';

const OVERWORLD = createResourceId('minecraft', 'overworld');
const entityRegistry = createDefaultEntityRegistry();
const itemRegistry = createDefaultItemRegistry();
const lootTables = createDefaultMobLootTables(itemRegistry);
const pigSpecies = createPigMobSpecies(entityRegistry);
const zombieSpecies = createZombieMobSpecies(entityRegistry);

function fixedRng(value: number) {
  return () => value;
}

describe('MobHealthTracker', () => {
  it('initializes an untracked entity from maxHealth on first damage', () => {
    const tracker = new MobHealthTracker();
    const result = tracker.damage(1, 4, 10);
    expect(result.health).toBe(6);
  });

  it('clamps health at zero', () => {
    const tracker = new MobHealthTracker();
    tracker.damage(1, 8, 10);
    const result = tracker.damage(1, 999, 10);
    expect(result.health).toBe(0);
  });

  it('reports died true only on the killing call', () => {
    const tracker = new MobHealthTracker();
    expect(tracker.damage(1, 3, 10).died).toBe(false);
    expect(tracker.damage(1, 8, 10).died).toBe(true);
  });

  it('reports died false for a non-lethal hit', () => {
    const tracker = new MobHealthTracker();
    expect(tracker.damage(1, 4, 10).died).toBe(false);
  });

  it('reports died false again for a hit on an already-dead id', () => {
    const tracker = new MobHealthTracker();
    tracker.damage(1, 20, 10);
    expect(tracker.damage(1, 1, 10).died).toBe(false);
  });

  it('treats a non-positive or non-finite amount as a no-op', () => {
    const tracker = new MobHealthTracker();
    expect(tracker.damage(1, 0, 10)).toEqual({ health: 10, died: false });
    expect(tracker.damage(1, -5, 10)).toEqual({ health: 10, died: false });
    expect(tracker.damage(1, Number.NaN, 10)).toEqual({ health: 10, died: false });
  });
});

describe('resolveMobDeath', () => {
  it('resolves pig loot and XP', () => {
    const result = resolveMobDeath(pigSpecies, lootTables, fixedRng(0));
    expect(result.xp).toBe(1);
    expect(result.loot.length).toBe(1);
    expect(result.loot[0]!.count).toBeGreaterThanOrEqual(1);
    expect(result.loot[0]!.count).toBeLessThanOrEqual(3);
  });

  it('resolves zombie loot and XP', () => {
    const result = resolveMobDeath(zombieSpecies, lootTables, fixedRng(0));
    expect(result.xp).toBe(5);
    expect(result.loot.length).toBe(1);
    expect(result.loot[0]!.count).toBeGreaterThanOrEqual(1);
    expect(result.loot[0]!.count).toBeLessThanOrEqual(2);
  });

  it('resolves to no loot for a species whose table is unregistered', () => {
    const orphanSpecies: MobSpecies = {
      typeId: pigSpecies.typeId,
      maxHealth: 10,
      lootTableId: createResourceId('minecraft', 'loot/nonexistent'),
      xpDrop: 2,
    };
    const result = resolveMobDeath(orphanSpecies, lootTables, fixedRng(0));
    expect(result.loot).toEqual([]);
    expect(result.xp).toBe(2);
  });
});

describe('MobDropLootSystem.damageEntity', () => {
  function manager(): EntityManager {
    return new EntityManager(entityRegistry);
  }

  it('removes the entity and spawns loot and XP on a lethal hit', () => {
    const system = new MobDropLootSystem();
    const m = manager();
    const pig = m.spawn(pigSpecies.typeId, OVERWORLD, { x: 1, y: 10, z: 2, yaw: 0, pitch: 0 });

    const lootCalls: Array<{ stacks: unknown; x: number; y: number; z: number }> = [];
    const xpCalls: Array<{ amount: number; x: number; y: number; z: number }> = [];

    const died = system.damageEntity(
      m,
      pig.id,
      999,
      pigSpecies,
      lootTables,
      (stacks, x, y, z) => lootCalls.push({ stacks, x, y, z }),
      (amount, x, y, z) => xpCalls.push({ amount, x, y, z }),
      fixedRng(0),
    );

    expect(died).toBe(true);
    expect(m.get(pig.id)!.state).toBe('REMOVED');
    expect(lootCalls.length).toBe(1);
    expect(lootCalls[0]).toMatchObject({ x: 1, y: 10, z: 2 });
    expect(xpCalls.length).toBe(1);
    expect(xpCalls[0]).toMatchObject({ amount: 1, x: 1, y: 10, z: 2 });
  });

  it('leaves the entity active and spawns nothing on a non-lethal hit', () => {
    const system = new MobDropLootSystem();
    const m = manager();
    const pig = m.spawn(pigSpecies.typeId, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });

    let lootCalled = 0;
    let xpCalled = 0;
    const died = system.damageEntity(
      m,
      pig.id,
      1,
      pigSpecies,
      lootTables,
      () => lootCalled++,
      () => xpCalled++,
      fixedRng(0),
    );

    expect(died).toBe(false);
    expect(m.get(pig.id)!.state).toBe('ACTIVE');
    expect(lootCalled).toBe(0);
    expect(xpCalled).toBe(0);
  });

  it('is a no-op for a missing entity id', () => {
    const system = new MobDropLootSystem();
    const m = manager();

    let lootCalled = 0;
    let xpCalled = 0;
    const died = system.damageEntity(
      m,
      9999,
      999,
      pigSpecies,
      lootTables,
      () => lootCalled++,
      () => xpCalled++,
      fixedRng(0),
    );

    expect(died).toBe(false);
    expect(lootCalled).toBe(0);
    expect(xpCalled).toBe(0);
  });

  it('is a no-op for an already-removed entity id', () => {
    const system = new MobDropLootSystem();
    const m = manager();
    const pig = m.spawn(pigSpecies.typeId, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
    m.remove(pig.id);

    const died = system.damageEntity(m, pig.id, 999, pigSpecies, lootTables, () => {}, () => {}, fixedRng(0));

    expect(died).toBe(false);
  });
});

describe('createPigMobSpecies / createZombieMobSpecies', () => {
  it('throw if the registry lacks the corresponding key', () => {
    const registryWithoutPigOrZombie = new EntityRegistry([
      {
        id: createResourceId('minecraft', 'entity_type/bat'),
        key: 'bat',
        name: 'Bat',
        category: 'AMBIENT',
        health: 6,
      },
    ]);
    expect(() => createPigMobSpecies(registryWithoutPigOrZombie)).toThrow();
    expect(() => createZombieMobSpecies(registryWithoutPigOrZombie)).toThrow();
  });

  it('read maxHealth from the default registry', () => {
    expect(pigSpecies.maxHealth).toBe(10);
    expect(zombieSpecies.maxHealth).toBe(20);
  });
});
