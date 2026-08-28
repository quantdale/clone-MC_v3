import { describe, it, expect } from "vitest";
import { EntityManager } from "../../src/simulation/EntityManager";
import { createDefaultEntityRegistry } from "../../src/data/EntityType";
import {
  createResourceId,
  resourceIdToString,
} from "../../src/data/ResourceId";
import { ZERO_VELOCITY, type EntityTransform } from "../../src/world/Entity";

const registry = createDefaultEntityRegistry();
const ZOMBIE = registry.getByKey("zombie")!.id; // isPersistent: true
const PIG = registry.getByKey("pig")!.id; // isPersistent: true
const BAT = registry.getByKey("bat")!.id; // isPersistent: false
const UNKNOWN_TYPE = createResourceId(
  "minecraft",
  "entity_type/does_not_exist",
);
const OVERWORLD = createResourceId("minecraft", "overworld");
const NETHER = createResourceId("minecraft", "nether");

const T: EntityTransform = { x: 1, y: 2, z: 3, yaw: 90, pitch: 0 };

function manager(): EntityManager {
  return new EntityManager(registry);
}

describe("EntityManager.spawn", () => {
  it("creates an ACTIVE entity with the given type/dimension and zero-velocity default", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, T);
    expect(e.state).toBe("ACTIVE");
    expect(e.typeId).toBe(ZOMBIE);
    expect(e.dimension).toBe(OVERWORLD);
    expect(e.transform).toEqual(T);
    expect(e.velocity).toEqual(ZERO_VELOCITY);
    expect(m.size).toBe(1);
  });

  it("mints strictly increasing ids by default", () => {
    const m = manager();
    const a = m.spawn(ZOMBIE, OVERWORLD, T);
    const b = m.spawn(PIG, OVERWORLD, T);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it("accepts an explicit velocity and copies it defensively", () => {
    const m = manager();
    const vel = { vx: 1, vy: 2, vz: 3 };
    const e = m.spawn(ZOMBIE, OVERWORLD, T, { velocity: vel });
    vel.vx = 999;
    expect(e.velocity.vx).toBe(1);
  });

  it("copies the transform defensively", () => {
    const m = manager();
    const t = { ...T };
    const e = m.spawn(ZOMBIE, OVERWORLD, t);
    t.x = 999;
    expect(e.transform.x).toBe(1);
  });

  it("rejects an unregistered type without mutating the manager", () => {
    const m = manager();
    expect(() => m.spawn(UNKNOWN_TYPE, OVERWORLD, T)).toThrow();
    expect(m.size).toBe(0);
    expect(m.getAll()).toEqual([]);
  });

  it("rejects a non-finite transform field", () => {
    const m = manager();
    expect(() => m.spawn(ZOMBIE, OVERWORLD, { ...T, y: NaN })).toThrow();
    expect(m.size).toBe(0);
  });

  it("rejects a non-finite velocity field", () => {
    const m = manager();
    expect(() =>
      m.spawn(ZOMBIE, OVERWORLD, T, {
        velocity: { vx: Infinity, vy: 0, vz: 0 },
      }),
    ).toThrow();
    expect(m.size).toBe(0);
  });

  it("rejects a colliding explicit id against an active entity", () => {
    const m = manager();
    m.spawn(ZOMBIE, OVERWORLD, T, { id: 5 });
    expect(() => m.spawn(PIG, OVERWORLD, T, { id: 5 })).toThrow();
    expect(m.get(5)!.typeId).toBe(ZOMBIE);
  });

  it("rejects a colliding explicit id against a removed entity", () => {
    const m = manager();
    m.spawn(ZOMBIE, OVERWORLD, T, { id: 5 });
    m.remove(5);
    expect(() => m.spawn(PIG, OVERWORLD, T, { id: 5 })).toThrow();
  });
});

describe("EntityManager query surfaces", () => {
  it("getAll/size exclude removed entities but get still resolves them", () => {
    const m = manager();
    const a = m.spawn(ZOMBIE, OVERWORLD, T);
    const b = m.spawn(PIG, OVERWORLD, T);
    m.remove(a.id);
    expect(m.getAll().map((e) => e.id)).toEqual([b.id]);
    expect(m.size).toBe(1);
    expect(m.get(a.id)?.state).toBe("REMOVED");
  });

  it("get returns undefined for a never-spawned id", () => {
    const m = manager();
    expect(m.get(999)).toBeUndefined();
  });

  it("getInDimension filters by resource-id value, not reference", () => {
    const m = manager();
    const overworldAgain = createResourceId("minecraft", "overworld");
    m.spawn(ZOMBIE, OVERWORLD, T);
    m.spawn(PIG, overworldAgain, T);
    m.spawn(PIG, NETHER, T);
    expect(m.getInDimension(overworldAgain).length).toBe(2);
    expect(m.getInDimension(NETHER).length).toBe(1);
  });
});

describe("EntityManager mutators", () => {
  it("setTransform/setVelocity succeed on an active entity and are visible via get", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, T);
    const newT = { x: 9, y: 9, z: 9, yaw: 9, pitch: 9 };
    const newV = { vx: 1, vy: 1, vz: 1 };
    expect(m.setTransform(e.id, newT)).toBe(true);
    expect(m.setVelocity(e.id, newV)).toBe(true);
    expect(m.get(e.id)!.transform).toEqual(newT);
    expect(m.get(e.id)!.velocity).toEqual(newV);
  });

  it("changeDimension succeeds on an active entity", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, T);
    expect(m.changeDimension(e.id, NETHER)).toBe(true);
    expect(m.get(e.id)!.dimension).toBe(NETHER);
  });

  it("mutators no-op on an unknown id", () => {
    const m = manager();
    expect(m.setTransform(999, T)).toBe(false);
    expect(m.setVelocity(999, ZERO_VELOCITY)).toBe(false);
    expect(m.changeDimension(999, NETHER)).toBe(false);
  });

  it("mutators no-op on a removed id", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, T);
    m.remove(e.id);
    expect(m.setTransform(e.id, { ...T, x: 42 })).toBe(false);
    expect(m.setVelocity(e.id, { vx: 1, vy: 1, vz: 1 })).toBe(false);
    expect(m.changeDimension(e.id, NETHER)).toBe(false);
    expect(m.get(e.id)!.transform).toEqual(T);
  });

  it("setTransform/setVelocity reject a non-finite field without writing", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, T);
    expect(m.setTransform(e.id, { ...T, pitch: NaN })).toBe(false);
    expect(m.setVelocity(e.id, { vx: 0, vy: NaN, vz: 0 })).toBe(false);
    expect(m.get(e.id)!.transform).toEqual(T);
    expect(m.get(e.id)!.velocity).toEqual(ZERO_VELOCITY);
  });
});

describe("EntityManager.remove", () => {
  it("is idempotent: second call on the same id returns false and state stays REMOVED", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, T);
    expect(m.remove(e.id)).toBe(true);
    expect(m.remove(e.id)).toBe(false);
    expect(m.get(e.id)!.state).toBe("REMOVED");
  });

  it("returns false for an id that was never spawned", () => {
    const m = manager();
    expect(m.remove(123)).toBe(false);
  });
});

describe("EntityManager.clear", () => {
  it("resets entities, size, and id minting", () => {
    const m = manager();
    m.spawn(ZOMBIE, OVERWORLD, T, { id: 10 });
    m.clear();
    expect(m.size).toBe(0);
    expect(m.get(10)).toBeUndefined();
    const e = m.spawn(PIG, OVERWORLD, T);
    expect(e.id).toBe(0);
  });
});

// Chunk (0,0) covers x,z in [0,16); chunk (1,0) covers x in [16,32).
const IN_CHUNK_00: EntityTransform = { x: 5, y: 2, z: 5, yaw: 0, pitch: 0 };
const IN_CHUNK_10: EntityTransform = { x: 20, y: 2, z: 5, yaw: 0, pitch: 0 };

describe("EntityManager.serializeChunk", () => {
  it("includes an active persistent entity in the requested chunk", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    const out = m.serializeChunk(0, 0);
    expect(out).toHaveLength(1);
    expect(out[0]!.typeKey).toBe(resourceIdToString(ZOMBIE));
    expect((out[0]!.data as { id: number }).id).toBe(e.id);
  });

  it("excludes a non-persistent entity", () => {
    const m = manager();
    m.spawn(BAT, OVERWORLD, IN_CHUNK_00);
    expect(m.serializeChunk(0, 0)).toEqual([]);
  });

  it("excludes a removed entity and an out-of-chunk entity", () => {
    const m = manager();
    const removed = m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    m.remove(removed.id);
    m.spawn(PIG, OVERWORLD, IN_CHUNK_10);
    expect(m.serializeChunk(0, 0)).toEqual([]);
  });
});

describe("EntityManager persistence round trip", () => {
  it("preserves id, typeId, dimension, transform, and velocity exactly", () => {
    const source = manager();
    const transform: EntityTransform = {
      x: 5,
      y: 2.5,
      z: 6,
      yaw: 123,
      pitch: -45,
    };
    const velocity = { vx: 1.5, vy: -2.5, vz: 0.25 };
    const original = source.spawn(ZOMBIE, NETHER, transform, { velocity });

    const records = source.serializeChunk(0, 0);
    const target = manager();
    const count = target.deserializeChunk(0, 0, records);

    expect(count).toBe(1);
    const restored = target.get(original.id)!;
    expect(restored.typeId).toEqual(ZOMBIE);
    expect(restored.dimension).toEqual(NETHER);
    expect(restored.transform).toEqual(transform);
    expect(restored.velocity).toEqual(velocity);
    expect(restored.state).toBe("ACTIVE");
  });
});

describe("EntityManager.deserializeChunk rejections", () => {
  it("rejects a record outside the requested chunk, atomically", () => {
    const source = manager();
    source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    source.spawn(PIG, OVERWORLD, IN_CHUNK_10);
    const combined = [
      ...source.serializeChunk(0, 0),
      ...source.serializeChunk(1, 0),
    ];

    const target = manager();
    expect(() => target.deserializeChunk(0, 0, combined)).toThrow();
    expect(target.size).toBe(0);
  });

  it("rejects an unregistered typeKey", () => {
    const source = manager();
    source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    const [record] = source.serializeChunk(0, 0);
    const bad = { ...record!, typeKey: resourceIdToString(UNKNOWN_TYPE) };

    const target = manager();
    expect(() => target.deserializeChunk(0, 0, [bad])).toThrow();
    expect(target.size).toBe(0);
  });

  it("rejects a malformed dimension", () => {
    const source = manager();
    source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    const [record] = source.serializeChunk(0, 0);
    const bad = {
      ...record!,
      data: { ...(record!.data as object), dimension: "NOT A VALID ID!!" },
    };

    const target = manager();
    expect(() => target.deserializeChunk(0, 0, [bad])).toThrow();
    expect(target.size).toBe(0);
  });

  it("rejects a non-finite transform field", () => {
    const source = manager();
    source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    const [record] = source.serializeChunk(0, 0);
    const data = record!.data as { transform: EntityTransform };
    const bad = {
      ...record!,
      data: {
        ...(record!.data as object),
        transform: { ...data.transform, y: NaN },
      },
    };

    const target = manager();
    expect(() => target.deserializeChunk(0, 0, [bad])).toThrow();
    expect(target.size).toBe(0);
  });

  it("rejects a non-finite velocity field", () => {
    const source = manager();
    source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00, {
      velocity: { vx: 1, vy: 2, vz: 3 },
    });
    const [record] = source.serializeChunk(0, 0);
    const data = record!.data as {
      velocity: { vx: number; vy: number; vz: number };
    };
    const bad = {
      ...record!,
      data: {
        ...(record!.data as object),
        velocity: { ...data.velocity, vz: Infinity },
      },
    };

    const target = manager();
    expect(() => target.deserializeChunk(0, 0, [bad])).toThrow();
    expect(target.size).toBe(0);
  });

  it("rejects a duplicate id within the same batch, atomically", () => {
    const source = manager();
    const a = source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    const b = source.spawn(PIG, OVERWORLD, { ...IN_CHUNK_00, x: 6 });
    const records = source.serializeChunk(0, 0);
    const [recA, recB] = records;
    const collided = {
      ...recB!,
      data: { ...(recB!.data as { id: number }), id: a.id },
    };
    void b;

    const target = manager();
    expect(() => target.deserializeChunk(0, 0, [recA!, collided])).toThrow();
    expect(target.size).toBe(0);
  });

  it("rejects a batch id colliding with an already-live entity, atomically (no partial spawn)", () => {
    const target = manager();
    const existing = target.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00, { id: 7 });

    const source = manager();
    const fresh = source.spawn(PIG, OVERWORLD, { ...IN_CHUNK_00, x: 6 });
    const records = source.serializeChunk(0, 0);
    const collided = {
      ...records[0]!,
      data: { ...(records[0]!.data as { id: number }), id: 7 },
    };
    void fresh;

    expect(() => target.deserializeChunk(0, 0, [collided])).toThrow();
    expect(target.size).toBe(1);
    expect(target.get(7)).toEqual(existing);
  });
});

describe("EntityManager.forgetChunk", () => {
  it("evicts both an active and a removed entity in the target chunk, leaving other chunks untouched", () => {
    const m = manager();
    const removed = m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    m.remove(removed.id);
    const active = m.spawn(PIG, OVERWORLD, { ...IN_CHUNK_00, x: 6 });
    const elsewhere = m.spawn(PIG, OVERWORLD, IN_CHUNK_10);

    const count = m.forgetChunk(0, 0);

    expect(count).toBe(2);
    expect(m.get(removed.id)).toBeUndefined();
    expect(m.get(active.id)).toBeUndefined();
    expect(m.get(elsewhere.id)).toEqual(elsewhere);
    expect(m.getAll()).toEqual([elsewhere]);
  });

  it("returns 0 for a chunk with no entities", () => {
    const m = manager();
    expect(m.forgetChunk(9, 9)).toBe(0);
  });

  it("frees an evicted id for reuse, unlike a removed (not forgotten) id", () => {
    const m = manager();
    m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00, { id: 9 });
    m.forgetChunk(0, 0);
    expect(() => m.spawn(PIG, OVERWORLD, IN_CHUNK_00, { id: 9 })).not.toThrow();
  });
});

// ── Activation LOD, radius queries and update budget (verification campaign) ──

import {
  ACTIVATION_HYSTERESIS_BLOCKS,
  DEFAULT_TICK_ENTITY_BUDGET,
} from "../../src/simulation/EntityManager";

describe("EntityManager.queryRadius", () => {
  it("returns ACTIVE entities within the 3D radius in the same dimension", () => {
    const m = manager();
    const near = m.spawn(ZOMBIE, OVERWORLD, {
      x: 0,
      y: 64,
      z: 0,
      yaw: 0,
      pitch: 0,
    });
    const far = m.spawn(PIG, OVERWORLD, {
      x: 30,
      y: 64,
      z: 0,
      yaw: 0,
      pitch: 0,
    });
    const high = m.spawn(PIG, OVERWORLD, {
      x: 3,
      y: 80,
      z: 4,
      yaw: 0,
      pitch: 0,
    });

    const hits = m.queryRadius(0, 64, 0, 10);
    expect(hits.map((e) => e.id)).toContain(near.id);
    expect(hits.map((e) => e.id)).not.toContain(far.id);
    expect(hits.map((e) => e.id)).not.toContain(high.id); // outside vertically

    // Boundary equality is inclusive.
    const edge = m.spawn(BAT, OVERWORLD, {
      x: 6,
      y: 64,
      z: 8,
      yaw: 0,
      pitch: 0,
    }); // exactly 10
    expect(m.queryRadius(0, 64, 0, 10).map((e) => e.id)).toContain(edge.id);
  });

  it("filters by dimension when given and includes all dimensions when omitted", () => {
    const m = manager();
    const a = m.spawn(ZOMBIE, OVERWORLD, {
      x: 0,
      y: 64,
      z: 0,
      yaw: 0,
      pitch: 0,
    });
    const b = m.spawn(ZOMBIE, NETHER, { x: 1, y: 64, z: 1, yaw: 0, pitch: 0 });

    expect(m.queryRadius(0, 64, 0, 50, OVERWORLD).map((e) => e.id)).toEqual([
      a.id,
    ]);
    const all = m.queryRadius(0, 64, 0, 50);
    expect(all.length).toBe(2);
    expect(all.map((e) => e.id)).toContain(b.id);
  });

  it("skips REMOVED entities and returns [] for a negative radius", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, {
      x: 0,
      y: 64,
      z: 0,
      yaw: 0,
      pitch: 0,
    });
    m.remove(e.id);
    expect(m.queryRadius(0, 64, 0, 100)).toEqual([]);
    expect(m.queryRadius(0, 64, 0, -1)).toEqual([]);
  });

  it("spans negative chunk coordinates", () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, {
      x: -2,
      y: 64,
      z: -2,
      yaw: 0,
      pitch: 0,
    });
    expect(m.queryRadius(-2, 64, -2, 3).map((x) => x.id)).toEqual([e.id]);
  });
});

describe("EntityManager activation LOD", () => {
  function spawnAt(m: EntityManager, x: number, z: number) {
    return m.spawn(ZOMBIE, OVERWORLD, { x, y: 64, z, yaw: 0, pitch: 0 });
  }

  it("activates entities inside simulation distance and deactivates beyond hysteresis", () => {
    const m = manager();
    const inside = spawnAt(m, 8, 0);
    const band = spawnAt(m, 20, 0); // > simDistance(16), < exit (32)

    expect(m.updateActivation(0, 64, 0, 16)).toBe(2); // first evaluation: fail-open inside exit
    expect(m.isActivationActive(inside.id)).toBe(true);
    expect(m.isActivationActive(band.id)).toBe(true);

    // Walking away deactivates only past the exit radius.
    m.setTransform(band.id, { x: 40, y: 64, z: 0, yaw: 0, pitch: 0 });
    expect(m.updateActivation(0, 64, 0, 16)).toBe(1);
    expect(m.isActivationActive(band.id)).toBe(false);

    // Coming back re-activates at the ENTER radius.
    m.setTransform(band.id, { x: 12, y: 64, z: 0, yaw: 0, pitch: 0 });
    expect(m.updateActivation(0, 64, 0, 16)).toBe(2);
  });

  it("never-evaluated entities count as active (fail-open)", () => {
    const m = manager();
    const e = spawnAt(m, 500, 500);
    expect(m.isActivationActive(e.id)).toBe(true);
  });

  it("counts only ACTIVE-state entities in its return value", () => {
    const m = manager();
    const a = spawnAt(m, 0, 0);
    spawnAt(m, 1, 0);
    m.remove(a.id);
    expect(m.updateActivation(0, 64, 0, 16)).toBe(1);
  });
});

describe("EntityManager.collectUpdateSet", () => {
  it("returns empty for non-positive budgets or an empty world", () => {
    const m = manager();
    expect(m.collectUpdateSet(0)).toEqual([]);
    expect(m.collectUpdateSet(-5)).toEqual([]);
    expect(m.collectUpdateSet()).toEqual([]); // empty world

    spawnHelper(m, 0, 0);
    expect(m.collectUpdateSet(0)).toEqual([]);
  });

  function spawnHelper(m: EntityManager, x: number, z: number) {
    return m.spawn(ZOMBIE, OVERWORLD, { x, y: 64, z, yaw: 0, pitch: 0 });
  }

  it("caps at maxEntities and round-robins starved entities to the next tick", () => {
    const m = manager();
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push(spawnHelper(m, i * 2, 0).id);

    const first = m.collectUpdateSet(2);
    expect(first.length).toBe(2);
    expect(first.map((e) => e.id)).toEqual([ids[0], ids[1]]);

    const second = m.collectUpdateSet(2);
    expect(second.map((e) => e.id)).toEqual([ids[2], ids[3]]);

    const third = m.collectUpdateSet(2);
    expect(third.map((e) => e.id)).toEqual([ids[4], ids[0]]); // wraps around

    // Default budget covers everything below it.
    const small = manager();
    for (let i = 0; i < DEFAULT_TICK_ENTITY_BUDGET; i++)
      spawnHelper(small, i, i);
    expect(small.collectUpdateSet().length).toBe(DEFAULT_TICK_ENTITY_BUDGET);
  });

  it("skips removed and activation-dead entities without consuming budget", () => {
    const m = manager();
    const dead = spawnHelper(m, 0, 0);
    const live = spawnHelper(m, 1, 0);
    const removed = spawnHelper(m, 2, 0);
    m.remove(removed.id);

    // Push `dead` far outside the exit radius.
    m.setTransform(dead.id, { x: 400, y: 64, z: 0, yaw: 0, pitch: 0 });
    m.updateActivation(0, 64, 0, 16);

    const set = m.collectUpdateSet(10);
    expect(set.map((e) => e.id)).toEqual([live.id]);
  });

  it("isActivationActive stays true for entities under no activation tracking", () => {
    const m = manager();
    const e = spawnHelper(m, 0, 0);
    // collectUpdateSet works without ever calling updateActivation (fail-open).
    expect(m.collectUpdateSet(10).map((x) => x.id)).toEqual([e.id]);
    void ACTIVATION_HYSTERESIS_BLOCKS;
  });
});
