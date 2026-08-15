import { describe, it, expect } from 'vitest';
import { TargetAcquisitionGoal, ChaseGoal, type TargetPosition } from '../../src/simulation/HostileTargetAI';
import { EntityManager } from '../../src/simulation/EntityManager';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import type { EntityTransform } from '../../src/world/Entity';

const registry = createDefaultEntityRegistry();
const ZOMBIE = registry.getByKey('zombie')!.id;
const OVERWORLD = createResourceId('minecraft', 'overworld');

function manager(): EntityManager {
  return new EntityManager(registry);
}

function transform(overrides: Partial<EntityTransform> = {}): EntityTransform {
  return { x: 0, y: 5, z: 0, yaw: 0, pitch: 0, ...overrides };
}

describe('TargetAcquisitionGoal — acquisition', () => {
  it('acquires a target within detectionRadius', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform());
    const goal = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => ({ x: 5, y: 5, z: 0 }),
      detectionRadius: 16,
    });

    expect(goal.canUse()).toBe(true);
  });

  it('does not acquire a target beyond detectionRadius', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform());
    const goal = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => ({ x: 50, y: 5, z: 0 }),
      detectionRadius: 16,
    });

    expect(goal.canUse()).toBe(false);
  });

  it('does not acquire when the callback returns null', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform());
    const goal = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => null,
    });
    expect(goal.canUse()).toBe(false);
  });
});

describe('TargetAcquisitionGoal — continuation', () => {
  it('keeps tracking a target that moves but stays within forgetRadius', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform());
    let targetPos: TargetPosition = { x: 5, y: 5, z: 0 };
    const goal = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => targetPos,
      detectionRadius: 16,
      forgetRadius: 32,
    });

    expect(goal.canUse()).toBe(true);
    goal.start();
    expect(goal.getTarget()).toEqual({ x: 5, y: 5, z: 0 });

    targetPos = { x: 20, y: 5, z: 0 }; // moved, still within forgetRadius (32)
    expect(goal.canContinueToUse()).toBe(true);
    expect(goal.getTarget()).toEqual({ x: 20, y: 5, z: 0 });
  });

  it('drops a target that moves beyond forgetRadius', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform());
    let targetPos: TargetPosition = { x: 5, y: 5, z: 0 };
    const goal = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => targetPos,
      detectionRadius: 16,
      forgetRadius: 32,
    });

    expect(goal.canUse()).toBe(true);
    goal.start();

    targetPos = { x: 100, y: 5, z: 0 };
    expect(goal.canContinueToUse()).toBe(false);
  });

  it('drops the target when the callback starts returning null', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform());
    let alive = true;
    const goal = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => (alive ? { x: 5, y: 5, z: 0 } : null),
    });

    expect(goal.canUse()).toBe(true);
    goal.start();
    alive = false;
    expect(goal.canContinueToUse()).toBe(false);
  });
});

describe('ChaseGoal — requires an acquired target', () => {
  it('canUse is false when the target source has no target', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform());
    const acquisition = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => null,
    });
    const chase = new ChaseGoal({ manager: m, entityId: entity.id, targetSource: acquisition });

    expect(chase.canUse()).toBe(false);
  });
});

describe('ChaseGoal — tick', () => {
  it('steers horizontal velocity toward a distant target without touching vy', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform(), { velocity: { vx: 0, vy: -4, vz: 0 } });
    const acquisition = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => ({ x: 10, y: 5, z: 0 }),
    });
    expect(acquisition.canUse()).toBe(true);
    acquisition.start();

    const chase = new ChaseGoal({ manager: m, entityId: entity.id, targetSource: acquisition, attackRange: 2 });
    chase.tick();

    const updated = m.get(entity.id)!;
    expect(updated.velocity.vy).toBe(-4);
    expect(updated.velocity.vx).toBeGreaterThan(0);
    expect(updated.velocity.vz).toBeCloseTo(0);
  });

  it('stops (zeroes horizontal velocity) once within attackRange', () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform(), { velocity: { vx: 1, vy: -4, vz: 1 } });
    const acquisition = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => ({ x: 1, y: 5, z: 0 }), // within attackRange
    });
    expect(acquisition.canUse()).toBe(true);
    acquisition.start();

    const chase = new ChaseGoal({ manager: m, entityId: entity.id, targetSource: acquisition, attackRange: 2 });
    chase.tick();

    const updated = m.get(entity.id)!;
    expect(updated.velocity).toEqual({ vx: 0, vy: -4, vz: 0 });
  });
});

describe('determinism', () => {
  it('two identically-configured pairs produce identical velocity', () => {
    const m1 = manager();
    const e1 = m1.spawn(ZOMBIE, OVERWORLD, transform());
    const a1 = new TargetAcquisitionGoal({ manager: m1, entityId: e1.id, findNearestTarget: () => ({ x: 10, y: 5, z: 3 }) });
    const c1 = new ChaseGoal({ manager: m1, entityId: e1.id, targetSource: a1 });

    const m2 = manager();
    const e2 = m2.spawn(ZOMBIE, OVERWORLD, transform());
    const a2 = new TargetAcquisitionGoal({ manager: m2, entityId: e2.id, findNearestTarget: () => ({ x: 10, y: 5, z: 3 }) });
    const c2 = new ChaseGoal({ manager: m2, entityId: e2.id, targetSource: a2 });

    expect(a1.canUse()).toBe(a2.canUse());
    a1.start();
    a2.start();
    c1.tick();
    c2.tick();

    expect(m1.get(e1.id)!.velocity).toEqual(m2.get(e2.id)!.velocity);
  });
});
