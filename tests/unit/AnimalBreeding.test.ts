import { describe, expect, it } from 'vitest';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import { EntityManager } from '../../src/simulation/EntityManager';
import type { EntityInstance } from '../../src/world/Entity';
import {
  LoveStateTracker,
  findBreedingPair,
  childSpawnTransform,
  BreedingSystem,
  BREEDING_RANGE,
  type BreedableSpecies,
} from '../../src/simulation/AnimalBreeding';

const OVERWORLD = createResourceId('minecraft', 'overworld');
const registry = createDefaultEntityRegistry();
const PIG_TYPE = registry.getByKey('pig')!.id;
const ZOMBIE_TYPE = registry.getByKey('zombie')!.id;
const WHEAT_ITEM_ID = 33;
const OTHER_ITEM_ID = 99;

const species: BreedableSpecies = { typeId: PIG_TYPE, breedingFoodItemId: WHEAT_ITEM_ID };

function pig(id: number, x = 0, y = 10, z = 0): EntityInstance {
  return {
    id,
    typeId: PIG_TYPE,
    transform: { x, y, z, yaw: 0, pitch: 0 },
    velocity: { vx: 0, vy: 0, vz: 0 },
    dimension: OVERWORLD,
    state: 'ACTIVE',
  };
}

function zombie(id: number, x = 0, y = 10, z = 0): EntityInstance {
  return { ...pig(id, x, y, z), typeId: ZOMBIE_TYPE };
}

describe('LoveStateTracker', () => {
  it('feed enters love mode for the correct food with no cooldown', () => {
    const tracker = new LoveStateTracker();
    expect(tracker.feed(1, WHEAT_ITEM_ID, species, 0)).toBe(true);
    expect(tracker.isInLove(1, 0)).toBe(true);
  });

  it('feed rejects the wrong food item', () => {
    const tracker = new LoveStateTracker();
    expect(tracker.feed(1, OTHER_ITEM_ID, species, 0)).toBe(false);
    expect(tracker.isInLove(1, 0)).toBe(false);
  });

  it('feed rejects an entity on cooldown', () => {
    const tracker = new LoveStateTracker();
    tracker.completeBreeding(1, 0);
    expect(tracker.isOnCooldown(1, 1)).toBe(true);
    expect(tracker.feed(1, WHEAT_ITEM_ID, species, 1)).toBe(false);
    expect(tracker.isInLove(1, 1)).toBe(false);
  });

  it('completeBreeding clears love mode and blocks immediate re-feeding', () => {
    const tracker = new LoveStateTracker();
    tracker.feed(1, WHEAT_ITEM_ID, species, 0);
    expect(tracker.isInLove(1, 0)).toBe(true);

    tracker.completeBreeding(1, 0);
    expect(tracker.isInLove(1, 0)).toBe(false);
    expect(tracker.feed(1, WHEAT_ITEM_ID, species, 1)).toBe(false);
  });

  it('love mode expires after LOVE_MODE_DURATION_TICKS', () => {
    const tracker = new LoveStateTracker();
    tracker.feed(1, WHEAT_ITEM_ID, species, 0);
    expect(tracker.isInLove(1, 599)).toBe(true);
    expect(tracker.isInLove(1, 600)).toBe(false);
  });
});

describe('findBreedingPair', () => {
  it('matches two in-love same-species entities within range', () => {
    const tracker = new LoveStateTracker();
    const a = pig(1, 0, 10, 0);
    const b = pig(2, 2, 10, 0);
    tracker.feed(a.id, WHEAT_ITEM_ID, species, 0);
    tracker.feed(b.id, WHEAT_ITEM_ID, species, 0);

    const pair = findBreedingPair([a, b], tracker, species, 0);
    expect(pair).toEqual([a, b]);
  });

  it('does not match an out-of-range in-love pair', () => {
    const tracker = new LoveStateTracker();
    const a = pig(1, 0, 10, 0);
    const b = pig(2, BREEDING_RANGE + 10, 10, 0);
    tracker.feed(a.id, WHEAT_ITEM_ID, species, 0);
    tracker.feed(b.id, WHEAT_ITEM_ID, species, 0);

    expect(findBreedingPair([a, b], tracker, species, 0)).toBeNull();
  });

  it('excludes an entity that was never fed', () => {
    const tracker = new LoveStateTracker();
    const a = pig(1, 0, 10, 0);
    const b = pig(2, 1, 10, 0);
    tracker.feed(a.id, WHEAT_ITEM_ID, species, 0);
    // b never fed.

    expect(findBreedingPair([a, b], tracker, species, 0)).toBeNull();
  });

  it('excludes a different-species entity even if in love', () => {
    const tracker = new LoveStateTracker();
    const a = pig(1, 0, 10, 0);
    const z = zombie(2, 1, 10, 0);
    tracker.feed(a.id, WHEAT_ITEM_ID, species, 0);
    tracker.feed(z.id, WHEAT_ITEM_ID, species, 0);

    expect(findBreedingPair([a, z], tracker, species, 0)).toBeNull();
  });

  it('returns null with fewer than two in-love entities', () => {
    const tracker = new LoveStateTracker();
    const a = pig(1, 0, 10, 0);
    tracker.feed(a.id, WHEAT_ITEM_ID, species, 0);

    expect(findBreedingPair([a], tracker, species, 0)).toBeNull();
  });
});

describe('childSpawnTransform', () => {
  it('places the child at the horizontal midpoint and the lower y', () => {
    const a = pig(1, 0, 12, 0);
    const b = pig(2, 4, 10, 2);

    expect(childSpawnTransform(a, b)).toEqual({ x: 2, y: 10, z: 1, yaw: 0, pitch: 0 });
  });
});

describe('BreedingSystem', () => {
  function manager(): EntityManager {
    return new EntityManager(registry);
  }

  it('spawns exactly one child for an eligible pair and completes breeding for both parents', () => {
    const system = new BreedingSystem();
    const m = manager();
    const a = m.spawn(PIG_TYPE, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
    const b = m.spawn(PIG_TYPE, OVERWORLD, { x: 1, y: 10, z: 0, yaw: 0, pitch: 0 });
    expect(system.feedEntity(a.id, WHEAT_ITEM_ID, species)).toBe(true);
    expect(system.feedEntity(b.id, WHEAT_ITEM_ID, species)).toBe(true);

    const spawned = system.tick(m, m.getAll(), species, 100);

    expect(spawned).toBe(1);
    expect(m.getAll().length).toBe(3);
  });

  it('spawns nothing when no pair is eligible', () => {
    const system = new BreedingSystem();
    const m = manager();
    m.spawn(PIG_TYPE, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
    m.spawn(PIG_TYPE, OVERWORLD, { x: 1, y: 10, z: 0, yaw: 0, pitch: 0 });
    // Neither fed.

    const spawned = system.tick(m, m.getAll(), species, 100);

    expect(spawned).toBe(0);
    expect(m.getAll().length).toBe(2);
  });

  it('never exceeds the population cap, leaving the eligible pair still in love', () => {
    const system = new BreedingSystem();
    const m = manager();
    const a = m.spawn(PIG_TYPE, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
    const b = m.spawn(PIG_TYPE, OVERWORLD, { x: 1, y: 10, z: 0, yaw: 0, pitch: 0 });
    system.feedEntity(a.id, WHEAT_ITEM_ID, species);
    system.feedEntity(b.id, WHEAT_ITEM_ID, species);

    // At the cap: the eligible pair does not breed.
    const cappedResult = system.tick(m, m.getAll(), species, 2);
    expect(cappedResult).toBe(0);
    expect(m.getAll().length).toBe(2);

    // Once the cap is raised, the same still-in-love pair breeds on the next tick — proving the
    // capped attempt above left their love state untouched.
    const spawned = system.tick(m, m.getAll(), species, 100);
    expect(spawned).toBe(1);
    expect(m.getAll().length).toBe(3);
  });
});
