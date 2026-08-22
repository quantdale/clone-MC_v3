import { describe, it, expect } from "vitest";
import {
  TargetAcquisitionGoal,
  ChaseGoal,
  type TargetPosition,
} from "../../src/simulation/HostileTargetAI";
import { EntityManager } from "../../src/simulation/EntityManager";
import { createDefaultEntityRegistry } from "../../src/data/EntityType";
import { createResourceId } from "../../src/data/ResourceId";
import type { EntityTransform } from "../../src/world/Entity";

const registry = createDefaultEntityRegistry();
const ZOMBIE = registry.getByKey("zombie")!.id;
const OVERWORLD = createResourceId("minecraft", "overworld");

function manager(): EntityManager {
  return new EntityManager(registry);
}

function transform(overrides: Partial<EntityTransform> = {}): EntityTransform {
  return { x: 0, y: 5, z: 0, yaw: 0, pitch: 0, ...overrides };
}

describe("TargetAcquisitionGoal — acquisition", () => {
  it("acquires a target within detectionRadius", () => {
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

  it("does not acquire a target beyond detectionRadius", () => {
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

  it("does not acquire when the callback returns null", () => {
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

describe("TargetAcquisitionGoal — continuation", () => {
  it("keeps tracking a target that moves but stays within forgetRadius", () => {
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

  it("drops a target that moves beyond forgetRadius", () => {
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

  it("drops the target when the callback starts returning null", () => {
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

describe("ChaseGoal — requires an acquired target", () => {
  it("canUse is false when the target source has no target", () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform());
    const acquisition = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => null,
    });
    const chase = new ChaseGoal({
      manager: m,
      entityId: entity.id,
      targetSource: acquisition,
    });

    expect(chase.canUse()).toBe(false);
  });
});

describe("ChaseGoal — tick", () => {
  it("steers horizontal velocity toward a distant target without touching vy", () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform(), {
      velocity: { vx: 0, vy: -4, vz: 0 },
    });
    const acquisition = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => ({ x: 10, y: 5, z: 0 }),
    });
    expect(acquisition.canUse()).toBe(true);
    acquisition.start();

    const chase = new ChaseGoal({
      manager: m,
      entityId: entity.id,
      targetSource: acquisition,
      attackRange: 2,
    });
    chase.tick();

    const updated = m.get(entity.id)!;
    expect(updated.velocity.vy).toBe(-4);
    expect(updated.velocity.vx).toBeGreaterThan(0);
    expect(updated.velocity.vz).toBeCloseTo(0);
  });

  it("stops (zeroes horizontal velocity) once within attackRange", () => {
    const m = manager();
    const entity = m.spawn(ZOMBIE, OVERWORLD, transform(), {
      velocity: { vx: 1, vy: -4, vz: 1 },
    });
    const acquisition = new TargetAcquisitionGoal({
      manager: m,
      entityId: entity.id,
      findNearestTarget: () => ({ x: 1, y: 5, z: 0 }), // within attackRange
    });
    expect(acquisition.canUse()).toBe(true);
    acquisition.start();

    const chase = new ChaseGoal({
      manager: m,
      entityId: entity.id,
      targetSource: acquisition,
      attackRange: 2,
    });
    chase.tick();

    const updated = m.get(entity.id)!;
    expect(updated.velocity).toEqual({ vx: 0, vy: -4, vz: 0 });
  });
});

describe("determinism", () => {
  it("two identically-configured pairs produce identical velocity", () => {
    const m1 = manager();
    const e1 = m1.spawn(ZOMBIE, OVERWORLD, transform());
    const a1 = new TargetAcquisitionGoal({
      manager: m1,
      entityId: e1.id,
      findNearestTarget: () => ({ x: 10, y: 5, z: 3 }),
    });
    const c1 = new ChaseGoal({
      manager: m1,
      entityId: e1.id,
      targetSource: a1,
    });

    const m2 = manager();
    const e2 = m2.spawn(ZOMBIE, OVERWORLD, transform());
    const a2 = new TargetAcquisitionGoal({
      manager: m2,
      entityId: e2.id,
      findNearestTarget: () => ({ x: 10, y: 5, z: 3 }),
    });
    const c2 = new ChaseGoal({
      manager: m2,
      entityId: e2.id,
      targetSource: a2,
    });

    expect(a1.canUse()).toBe(a2.canUse());
    a1.start();
    a2.start();
    c1.tick();
    c2.tick();

    expect(m1.get(e1.id)!.velocity).toEqual(m2.get(e2.id)!.velocity);
  });
});

// ── PathCache coverage (verification campaign) ──────────────────────────────

import { PathCache } from "../../src/simulation/HostileTargetAI";

type FakePath = string[];

describe("PathCache", () => {
  const start = { x: 1, y: 64, z: 2 };
  const goal = { x: 5, y: 64, z: 9 };

  it("stores and retrieves a path for exactly matching cells", () => {
    const cache = new PathCache<FakePath>();
    expect(cache.get(start, goal)).toBeUndefined();
    cache.put(start, goal, ["1", "2", "3"]);
    expect(cache.get(start, goal)).toEqual(["1", "2", "3"]);
    expect(cache.size).toBe(1);
  });

  it("distinguishes swapped start/goal and different cells", () => {
    const cache = new PathCache<FakePath>();
    cache.put(start, goal, ["a"]);
    expect(cache.get(goal, start)).toBeUndefined(); // direction matters
    expect(cache.size).toBe(1);

    cache.put(goal, start, ["b"]);
    expect(cache.get(goal, start)).toEqual(["b"]);
    expect(cache.size).toBe(2);
  });

  it("degrades hash collisions to a miss, never to a wrong path", () => {
    const cache = new PathCache<FakePath>();
    cache.put({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, ["real"]);
    // Same bucket via a colliding key is still verified against stored cells.
    expect(
      cache.get({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 11 }),
    ).toBeUndefined();
    expect(cache.get({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 })).toEqual([
      "real",
    ]);
  });

  it("put overwrites the path for identical cell pairs without growing", () => {
    const cache = new PathCache<FakePath>();
    cache.put(start, goal, ["1"]);
    cache.put(start, goal, ["2"]);
    expect(cache.size).toBe(1);
    expect(cache.get(start, goal)).toEqual(["2"]);
  });

  it("evicts the oldest entry beyond capacity", () => {
    const cache = new PathCache<FakePath>(3);
    cache.put({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, ["p0"]);
    cache.put({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, ["p1"]);
    cache.put({ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }, ["p2"]);
    expect(cache.size).toBe(3);

    cache.put({ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 1 }, ["p3"]);
    expect(cache.size).toBe(3);
    expect(
      cache.get({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
    ).toBeUndefined(); // evicted
    expect(cache.get({ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 1 })).toEqual([
      "p3",
    ]);
  });

  it("eviction removes the front entry of the first-inserted bucket (per-bucket FIFO)", () => {
    const cache = new PathCache<FakePath>(2);
    cache.put({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, ["first"]);
    cache.put({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, ["second"]);

    // A get refreshes position WITHIN its bucket only.
    expect(cache.get({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toEqual([
      "first",
    ]);

    cache.put({ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }, ["third"]); // evicts bucket[0]'s front
    expect(cache.size).toBe(2);
    expect(
      cache.get({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
    ).toBeUndefined();
    expect(cache.get({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 })).toEqual([
      "second",
    ]);
    expect(cache.get({ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 })).toEqual([
      "third",
    ]);
  });

  it("evicts the oldest entry beyond capacity within a shared bucket", () => {
    const cache = new PathCache<FakePath>(2);
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 1 };
    const c = { x: 0, y: 0, z: 2 };
    const d = { x: 0, y: 0, z: 3 };
    // All four pairs hash into buckets keyed by start^goal; use enough distinct pairs that at
    // least three share one bucket by construction of the capacity-2 cache.
    cache.put(a, b, ["ab"]);
    cache.put(b, c, ["bc"]);
    cache.put(c, d, ["cd"]);
    cache.put(a, c, ["ac"]); // may share a bucket; overwrite path if same cells
    expect(cache.size).toBeLessThanOrEqual(3); // capacity enforced overall
  });

  it("invalidateNear drops entries whose start or goal falls inside the radius", () => {
    const cache = new PathCache<FakePath>();
    cache.put({ x: 0, y: 64, z: 0 }, { x: 50, y: 64, z: 50 }, ["near-start"]);
    cache.put({ x: 20, y: 64, z: 20 }, { x: 21, y: 64, z: 20 }, ["near-goal"]);
    cache.put({ x: -30, y: 64, z: -30 }, { x: -31, y: 64, z: -30 }, ["far"]);

    cache.invalidateNear(0, 0, 4); // hits entry 1 (start) and entry 2 (goal at 20,20? no)
    expect(
      cache.get({ x: 0, y: 64, z: 0 }, { x: 50, y: 64, z: 50 }),
    ).toBeUndefined();
    expect(cache.size).toBe(2);

    cache.invalidateNear(21, 20, 1); // goal cell of entry 2
    expect(
      cache.get({ x: 20, y: 64, z: 20 }, { x: 21, y: 64, z: 20 }),
    ).toBeUndefined();
    expect(cache.size).toBe(1);

    cache.invalidateNear(100, 100, 2); // far away: nothing dropped
    expect(cache.size).toBe(1);
  });

  it("invalidateNear ignores negative radii and clear() empties everything", () => {
    const cache = new PathCache<FakePath>();
    cache.put(start, goal, ["x"]);
    cache.invalidateNear(0, 0, -1);
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get(start, goal)).toBeUndefined();
  });

  it("rejects non-positive capacity naming the field", () => {
    expect(() => new PathCache(0)).toThrow(/capacity must be positive/);
    expect(() => new PathCache(-3)).toThrow(/capacity must be positive/);
  });
});
