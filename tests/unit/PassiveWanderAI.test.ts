import { describe, it, expect } from 'vitest';
import { WanderGoal, LookGoal } from '../../src/simulation/PassiveWanderAI';
import { EntityManager } from '../../src/simulation/EntityManager';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import { SeedRng } from '../../src/simulation/SeedRng';
import type { NavigationWorld } from '../../src/simulation/NavigationGridQuery';
import { BlockId } from '../../src/world/BlockRegistry';
import { VoxelShape } from '../../src/world/VoxelShape';
import type { EntityTransform } from '../../src/world/Entity';

const registry = createDefaultEntityRegistry();
const PIG = registry.getByKey('pig')!.id;
const OVERWORLD = createResourceId('minecraft', 'overworld');

/** A world that is either entirely open/standable (solid floor one below every column) or entirely water. */
class UniformWorld implements NavigationWorld {
  constructor(private readonly allWater: boolean) {}

  getBlockId(_x: number, y: number, _z: number): number {
    if (this.allWater) return BlockId.Water;
    return y === 4 ? BlockId.Stone : BlockId.Air;
  }

  getCollisionShape(_x: number, y: number, _z: number): VoxelShape {
    if (this.allWater) return VoxelShape.EMPTY;
    return y === 4 ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
  }
}

function manager(): EntityManager {
  return new EntityManager(registry);
}

function transform(overrides: Partial<EntityTransform> = {}): EntityTransform {
  return { x: 5.5, y: 5, z: 5.5, yaw: 0, pitch: 0, ...overrides };
}

describe('WanderGoal.canUse', () => {
  it('never succeeds when every candidate is water', () => {
    const m = manager();
    const entity = m.spawn(PIG, OVERWORLD, transform());
    const goal = new WanderGoal({
      manager: m,
      entityId: entity.id,
      world: new UniformWorld(true),
      rng: new SeedRng(1),
      startChance: 1,
      radius: 5,
    });

    for (let i = 0; i < 20; i++) {
      expect(goal.canUse()).toBe(false);
    }
  });

  it('succeeds on an open, standable, non-water area', () => {
    const m = manager();
    const entity = m.spawn(PIG, OVERWORLD, transform());
    const goal = new WanderGoal({
      manager: m,
      entityId: entity.id,
      world: new UniformWorld(false),
      rng: new SeedRng(1),
      startChance: 1,
      radius: 5,
    });

    expect(goal.canUse()).toBe(true);
  });

  it('fails when the entity no longer exists', () => {
    const m = manager();
    const goal = new WanderGoal({
      manager: m,
      entityId: 999,
      world: new UniformWorld(false),
      rng: new SeedRng(1),
      startChance: 1,
    });
    expect(goal.canUse()).toBe(false);
  });
});

describe('WanderGoal.tick / arrival / stop', () => {
  it('steers horizontal velocity toward the target without touching vy', () => {
    const m = manager();
    const entity = m.spawn(PIG, OVERWORLD, transform(), { velocity: { vx: 0, vy: -3, vz: 0 } });
    const goal = new WanderGoal({
      manager: m,
      entityId: entity.id,
      world: new UniformWorld(false),
      rng: new SeedRng(1),
      startChance: 1,
      radius: 8,
    });

    expect(goal.canUse()).toBe(true);
    goal.start();
    goal.tick();

    const updated = m.get(entity.id)!;
    expect(updated.velocity.vy).toBe(-3);
    const speed = Math.sqrt(updated.velocity.vx ** 2 + updated.velocity.vz ** 2);
    expect(speed).toBeGreaterThan(0);
  });

  it('reaching the target (radius 0) stops continuation, and stop() zeroes horizontal velocity', () => {
    const m = manager();
    const entity = m.spawn(PIG, OVERWORLD, transform(), { velocity: { vx: 1, vy: -3, vz: 1 } });
    const goal = new WanderGoal({
      manager: m,
      entityId: entity.id,
      world: new UniformWorld(false),
      rng: new SeedRng(1),
      startChance: 1,
      radius: 0, // target collapses to the entity's own current column
    });

    expect(goal.canUse()).toBe(true);
    goal.start();
    expect(goal.canContinueToUse()).toBe(false);

    goal.stop();
    const updated = m.get(entity.id)!;
    expect(updated.velocity).toEqual({ vx: 0, vy: -3, vz: 0 });
  });
});

describe('WanderGoal — duration timeout', () => {
  it('stops continuation after maxDurationTicks even without arriving', () => {
    const m = manager();
    const entity = m.spawn(PIG, OVERWORLD, transform());
    const goal = new WanderGoal({
      manager: m,
      entityId: entity.id,
      world: new UniformWorld(false),
      rng: new SeedRng(7),
      startChance: 1,
      radius: 10,
      arrivalRadius: 1e-9,
      maxDurationTicks: 3,
    });

    expect(goal.canUse()).toBe(true);
    goal.start();
    for (let i = 0; i < 3; i++) goal.tick();

    expect(goal.canContinueToUse()).toBe(false);
  });
});

describe('LookGoal', () => {
  it('changes yaw (and nothing else) when the roll is below changeChance', () => {
    const m = manager();
    const entity = m.spawn(PIG, OVERWORLD, transform({ yaw: 10, pitch: 20 }));
    const goal = new LookGoal({ manager: m, entityId: entity.id, rng: new SeedRng(1), changeChance: 1 });

    goal.tick();

    const updated = m.get(entity.id)!;
    expect(updated.transform.yaw).not.toBe(10);
    expect(updated.transform.yaw).toBeGreaterThanOrEqual(0);
    expect(updated.transform.yaw).toBeLessThan(360);
    expect(updated.transform.pitch).toBe(20);
    expect(updated.transform.x).toBe(5.5);
  });

  it('changes nothing when the roll is at or above changeChance', () => {
    const m = manager();
    const entity = m.spawn(PIG, OVERWORLD, transform({ yaw: 10, pitch: 20 }));
    const goal = new LookGoal({ manager: m, entityId: entity.id, rng: new SeedRng(1), changeChance: 0 });

    goal.tick();

    expect(m.get(entity.id)!.transform).toEqual(transform({ yaw: 10, pitch: 20 }));
  });
});

describe('determinism', () => {
  it('two identically-seeded WanderGoals make identical decisions', () => {
    const m1 = manager();
    const e1 = m1.spawn(PIG, OVERWORLD, transform());
    const g1 = new WanderGoal({
      manager: m1, entityId: e1.id, world: new UniformWorld(false), rng: new SeedRng(99), startChance: 1, radius: 8,
    });

    const m2 = manager();
    const e2 = m2.spawn(PIG, OVERWORLD, transform());
    const g2 = new WanderGoal({
      manager: m2, entityId: e2.id, world: new UniformWorld(false), rng: new SeedRng(99), startChance: 1, radius: 8,
    });

    expect(g1.canUse()).toBe(g2.canUse());
    g1.start();
    g2.start();
    g1.tick();
    g2.tick();

    expect(m1.get(e1.id)!.velocity).toEqual(m2.get(e2.id)!.velocity);
  });
});
