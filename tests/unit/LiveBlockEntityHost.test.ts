import { describe, it, expect, vi } from 'vitest';
import {
  LiveBlockEntityHost,
  type HostWorldView,
  type LiveBlockEntityHostDeps,
} from '../../src/engine/LiveBlockEntityHost';
import type { SerializedBlockEntity } from '../../src/storage/BlockEntityRecord';
import {
  FURNACE_TYPE_KEY,
  createFurnaceState,
  serializeFurnaceState,
  type FurnaceContext,
  type FurnaceState,
} from '../../src/world/FurnaceBlockEntity';

/**
 * Production-wiring oracles (251): these tests prove the NEW live host behavior —
 * single authoritative instance per position, simulating-set tick gating, dirty
 * persistence marking, hydration/quarantine, and exactly-once destruction. The
 * pure `tickFurnace` engine itself is covered by FurnaceBlockEntity.test.ts.
 */

const X = 5;
const Y = 64;
const Z = -7;

/** Tiny deterministic furnace context: a cook takes 3 ticks, fuel burns 10. */
const CTX: FurnaceContext = {
  fuelBurnTicks: (item) => (item === 'minecraft:coal' ? 10 : 0),
  cookTicks: (item) => (item === 'minecraft:sand' ? 3 : 0),
  resultOf: (item) => (item === 'minecraft:sand' ? { item: 'minecraft:glass', count: 1 } : null),
  experienceOf: (item) => (item === 'minecraft:sand' ? 0.7 : 0),
};

class FakeWorld implements HostWorldView {
  readonly blocks = new Map<string, number>();
  readonly simulating = new Set<string>();

  setBlock(x: number, y: number, z: number, id: number): void {
    this.blocks.set(`${x},${y},${z}`, id);
  }

  isChunkSimulating(cx: number, cz: number): boolean {
    return this.simulating.has(`${cx},${cz}`);
  }

  getBlock(x: number, y: number, z: number): number {
    return this.blocks.get(`${x},${y},${z}`) ?? 0;
  }
}

class FakePersistence {
  readonly saved = new Map<string, SerializedBlockEntity[]>();
  /** Full call history for dirty-marking assertions. */
  readonly calls: Array<{ cx: number; cz: number; entities: SerializedBlockEntity[] }> = [];

  saveBlockEntities(cx: number, cz: number, entities: SerializedBlockEntity[]): void {
    this.saved.set(`${cx},${cz}`, entities);
    this.calls.push({ cx, cz, entities });
  }
}

function furnaceRecord(state: FurnaceState, x = X, y = Y, z = Z): SerializedBlockEntity {
  return {
    schemaVersion: 1,
    typeKey: FURNACE_TYPE_KEY,
    x,
    y,
    z,
    data: serializeFurnaceState(state),
  };
}

function midCookState(overrides?: Partial<FurnaceState>): FurnaceState {
  return {
    ...createFurnaceState(),
    input: { item: 'minecraft:sand', count: 2, maxStack: 64 },
    fuel: { item: 'minecraft:coal', count: 1, maxStack: 64 },
    burnTime: 6,
    burnTimeTotal: 10,
    smeltTime: 1,
    smeltTimeTotal: 3,
    xp: 1.4,
    ...overrides,
  };
}

interface Rig {
  world: FakeWorld;
  persistence: FakePersistence;
  host: LiveBlockEntityHost;
}

function makeRig(withPersistence = true): Rig {
  const world = new FakeWorld();
  const persistence = new FakePersistence();
  const deps: LiveBlockEntityHostDeps = {
    world,
    persistence: withPersistence ? persistence : null,
    furnaceContext: CTX,
    onQuarantined: () => undefined,
  };
  return { world, persistence, host: new LiveBlockEntityHost(deps) };
}

describe('LiveBlockEntityHost composition (251)', () => {
  it('placement creates exactly one instance and marks the chunk dirty', () => {
    const { world, persistence, host } = makeRig();
    world.setBlock(X, Y, Z, 20); // BlockId.Furnace

    expect(host.placeFurnace(X, Y, Z)).toBe(true);
    expect(host.has(X, Y, Z)).toBe(true);
    expect(host.size).toBe(1);

    // Repeated placement at the occupied position cannot create duplicates.
    expect(host.placeFurnace(X, Y, Z)).toBe(false);
    expect(host.size).toBe(1);

    // Placement persists a full snapshot for the chunk.
    expect(persistence.saved.get(`0,-1`)).toHaveLength(1);
    expect(persistence.calls.at(-1)?.entities[0]?.typeKey).toBe(FURNACE_TYPE_KEY);
  });

  it('removeFurnace removes exactly once, returns final state, and persists an empty snapshot', () => {
    const { host, persistence } = makeRig();
    host.placeFurnace(X, Y, Z);
    persistence.calls.length = 0;

    const state = host.removeFurnace(X, Y, Z);
    expect(state).not.toBeNull();
    expect(host.has(X, Y, Z)).toBe(false);
    expect(host.getFurnaceState(X, Y, Z)).toBeNull();

    // Exactly-once: subsequent breaks find nothing.
    expect(host.removeFurnace(X, Y, Z)).toBeNull();
    expect(host.size).toBe(0);

    // The stale persisted row is overwritten by an empty snapshot.
    expect(persistence.calls.filter((c) => c.entities.length === 0)).toHaveLength(1);
  });

  it('applyMenuSlots writes atomically into the authoritative state', () => {
    const { host } = makeRig();
    host.placeFurnace(X, Y, Z);

    const next = host.applyMenuSlots(X, Y, Z, {
      input: { item: 'minecraft:sand', count: 5, maxStack: 64 },
      fuel: createFurnaceState().fuel,
      output: createFurnaceState().output,
    });
    expect(next?.input).toEqual({ item: 'minecraft:sand', count: 5, maxStack: 64 });
    expect(host.getFurnaceState(X, Y, Z)?.input.count).toBe(5);

    // Absent furnace → null, no throw.
    expect(host.applyMenuSlots(999, 0, 999, next!)).toBeNull();
  });

  it('an invalid menu write is rejected and leaves the authoritative state untouched', () => {
    const { host } = makeRig();
    host.placeFurnace(X, Y, Z);

    const before = host.getFurnaceState(X, Y, Z);
    const rejected = host.applyMenuSlots(X, Y, Z, {
      input: { item: 'minecraft:sand', count: -3, maxStack: 64 },
      fuel: createFurnaceState().fuel,
      output: createFurnaceState().output,
    });
    expect(rejected).toBeNull();
    expect(host.getFurnaceState(X, Y, Z)).toEqual(before);
  });

  it('runs without persistence attached (memory-only play)', () => {
    const rig = makeRig(false);
    rig.world.setBlock(X, Y, Z, 20);
    rig.world.simulating.add('0,-1');
    expect(rig.host.placeFurnace(X, Y, Z)).toBe(true);
    expect(() => rig.host.tickFurnaces()).not.toThrow();
    expect(rig.host.removeFurnace(X, Y, Z)).not.toBeNull();
    expect(rig.host.size).toBe(0);
  });

  it('serializeChunkForSave emits validated 036 envelope records', () => {
    const { host } = makeRig();
    host.placeFurnace(X, Y, Z);
    const records = host.serializeChunkForSave(0, -1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ schemaVersion: 1, typeKey: FURNACE_TYPE_KEY, x: X, y: Y, z: Z });
    expect(typeof records[0]!.data).toBe('object');
  });
});

describe('LiveBlockEntityHost fixed-tick simulation (251)', () => {
  it('ticks only simulating chunks; non-simulating chunks never advance', () => {
    const { world, host } = makeRig();
    world.setBlock(X, Y, Z, 20);
    host.hydrate([furnaceRecord(midCookState())]);
    // Chunk of (5, -7) is (0, -1).
    expect(world.isChunkSimulating(0, -1)).toBe(false);

    for (let i = 0; i < 10; i++) host.tickFurnaces();
    const frozen = host.getFurnaceState(X, Y, Z)!;
    expect(frozen.smeltTime).toBe(1);
    expect(frozen.burnTime).toBe(6);

    world.simulating.add('0,-1');
    host.tickFurnaces();
    const advanced = host.getFurnaceState(X, Y, Z)!;
    expect(advanced.smeltTime).toBe(2);
    expect(advanced.burnTime).toBe(5);
  });

  it('a paused mid-cook completes in exactly the remaining canonical ticks after resume', () => {
    const { world, host } = makeRig();
    world.setBlock(X, Y, Z, 20);
    world.simulating.add('0,-1');
    // smeltTime=1 of 3 → two more ticks to finish the cook.
    host.hydrate([furnaceRecord(midCookState())]);

    host.tickFurnaces(); // smeltTime 2
    // Pause window: no ticks at all.
    // Resume: exactly one further tick completes the cook.
    host.tickFurnaces();
    const done = host.getFurnaceState(X, Y, Z)!;
    expect(done.output).toEqual({ item: 'minecraft:glass', count: 1, maxStack: 64 });
    expect(done.input.count).toBe(1);
    expect(done.xp).toBeCloseTo(1.4 + 0.7, 10);

    // The next full canonical cook (3 ticks with fresh burn time) is required
    // for a SECOND output — one resumed tick must not double-produce.
    host.tickFurnaces();
    expect(host.getFurnaceState(X, Y, Z)!.output.count).toBe(1);
  });

  it('marks only chunks whose observable state changed', () => {
    const { world, persistence, host } = makeRig();
    world.simulating.add('0,-1');
    world.setBlock(X, Y, Z, 20);
    host.placeFurnace(X, Y, Z);
    persistence.calls.length = 0;

    // Empty idle furnace: nothing observable changes → no dirty marking.
    host.tickFurnaces();
    expect(persistence.calls).toHaveLength(0);

    // A working furnace changes every tick → dirty marked for its chunk only.
    host.applyMenuSlots(X, Y, Z, {
      input: { item: 'minecraft:sand', count: 1, maxStack: 64 },
      fuel: { item: 'minecraft:coal', count: 1, maxStack: 64 },
      output: createFurnaceState().output,
    });
    persistence.calls.length = 0;
    host.tickFurnaces();
    expect(persistence.calls.map((c) => `${c.cx},${c.cz}`)).toEqual(['0,-1']);
    expect(persistence.calls[0]!.entities).toHaveLength(1);
  });

  it('reload restores the committed boundary and never double-consumes fuel or double-produces output', () => {
    const { world, host } = makeRig();
    world.setBlock(X, Y, Z, 20);
    world.simulating.add('0,-1');
    host.placeFurnace(X, Y, Z);
    host.applyMenuSlots(X, Y, Z, {
      input: { item: 'minecraft:sand', count: 4, maxStack: 64 },
      fuel: { item: 'minecraft:coal', count: 2, maxStack: 64 },
      output: createFurnaceState().output,
    });
    // Run exactly three ticks → one completed cook (committed via persistChunk).
    for (let i = 0; i < 3; i++) host.tickFurnaces();
    const committed = host.serializeChunkForSave(0, -1);
    const before = host.getFurnaceState(X, Y, Z)!;
    expect(before.output.count).toBe(1);
    expect(before.fuel.count).toBe(1); // one coal unit consumed once

    // Fresh runtime hydrates from the committed snapshot ("page reload").
    const rig2 = makeRig();
    rig2.world.setBlock(X, Y, Z, 20);
    rig2.world.simulating.add('0,-1');
    const { hydrated } = rig2.host.hydrate(committed);
    expect(hydrated).toBe(1);

    // One further full canonical cook produces exactly ONE more output. The
    // second cook burns the committed residual burn time (7 ticks left) rather
    // than consuming another fuel unit — proving the boundary neither
    // double-produced nor re-charged fuel on reload.
    for (let i = 0; i < 3; i++) rig2.host.tickFurnaces();
    const after = rig2.host.getFurnaceState(X, Y, Z)!;
    expect(after.output.count).toBe(2);
    expect(after.fuel.count).toBe(1);
    expect(after.input.count).toBe(2);
    expect(after.burnTime).toBe(4); // 7 committed − 3 ticks
  });
});

describe('LiveBlockEntityHost hydration and quarantine (251)', () => {
  it('restores all eight fields exactly and is idempotent per position', () => {
    const { host } = makeRig();
    const state = midCookState();
    const first = host.hydrate([furnaceRecord(state)]);
    expect(first).toEqual({ hydrated: 1, quarantined: 0 });
    expect(host.getFurnaceState(X, Y, Z)).toEqual(state);

    // Second application skips the resident position.
    expect(host.hydrate([furnaceRecord(state)])).toEqual({ hydrated: 0, quarantined: 0 });
    expect(host.size).toBe(1);
  });

  it('quarantines malformed payloads without crashing boot', () => {
    const onQuarantined = vi.fn();
    const world = new FakeWorld();
    const host = new LiveBlockEntityHost({
      world,
      persistence: null,
      furnaceContext: CTX,
      onQuarantined,
    });

    const bad: SerializedBlockEntity[] = [
      furnaceRecord(createFurnaceState()),
      { schemaVersion: 1, typeKey: FURNACE_TYPE_KEY, x: 1, y: 1, z: 1, data: { input: 'garbage' } },
      { schemaVersion: 1, typeKey: FURNACE_TYPE_KEY, x: 2, y: 1, z: 1, data: null as unknown as unknown },
      { schemaVersion: 1, typeKey: 'minecraft:chest', x: 3, y: 1, z: 1, data: {} }, // other types ignored silently
    ];
    const result = host.hydrate(bad);
    expect(result).toEqual({ hydrated: 1, quarantined: 2 });
    expect(onQuarantined).toHaveBeenCalledTimes(2);
    expect(host.size).toBe(1);

    // No callback installed → visible console.warn instead of a crash.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const plain = new LiveBlockEntityHost({ world, persistence: null, furnaceContext: CTX });
    expect(plain.hydrate([bad[1]!])).toEqual({ hydrated: 0, quarantined: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('quarantines future/unknown envelope versions instead of trusting them', () => {
    const onQuarantined = vi.fn();
    const world = new FakeWorld();
    const host = new LiveBlockEntityHost({
      world,
      persistence: null,
      furnaceContext: CTX,
      onQuarantined,
    });

    // A hypothetical v2 record whose payload happens to parse must NOT become
    // trusted runtime state: its semantics are unknown to this build.
    const future = {
      ...furnaceRecord(midCookState()),
      schemaVersion: 2,
    };
    expect(host.hydrate([future])).toEqual({ hydrated: 0, quarantined: 1 });
    expect(host.has(X, Y, Z)).toBe(false);
    expect(onQuarantined).toHaveBeenCalledWith(
      expect.stringContaining(`version 2 != 1`),
    );
    expect(onQuarantined).toHaveBeenCalledWith(expect.stringContaining(`${X},${Y},${Z}`));

    // The same record at version 1 hydrates normally.
    expect(host.hydrate([furnaceRecord(midCookState())]).hydrated).toBe(1);
  });

  it('quarantines records failing envelope validation without throwing', () => {
    const onQuarantined = vi.fn();
    const world = new FakeWorld();
    const host = new LiveBlockEntityHost({
      world,
      persistence: null,
      furnaceContext: CTX,
      onQuarantined,
    });

    const malformed = [
      { typeKey: FURNACE_TYPE_KEY, x: 0, y: 0, z: 0, data: null }, // missing schemaVersion
      { schemaVersion: 1, typeKey: '', x: 0, y: 0, z: 0, data: null }, // empty typeKey
      { schemaVersion: 1, typeKey: FURNACE_TYPE_KEY, x: 1.5, y: 0, z: 0, data: null }, // non-integer coord
      'not even an object',
    ] as unknown as SerializedBlockEntity[];
    expect(host.hydrate(malformed)).toEqual({ hydrated: 0, quarantined: 4 });
    expect(host.size).toBe(0);
    expect(onQuarantined).toHaveBeenCalledTimes(4);
    for (const call of onQuarantined.mock.calls) {
      expect(String(call[0])).toContain('envelope');
    }
  });

  it('lazily drops stale records whose block is no longer a furnace on first simulating tick', () => {
    const { world, persistence, host } = makeRig();
    world.setBlock(X, Y, Z, 20);
    host.hydrate([furnaceRecord(midCookState())]);
    // The block vanishes (e.g. broken in a previous session without cleanup).
    world.blocks.delete(`${X},${Y},${Z}`);
    world.simulating.add('0,-1');
    persistence.calls.length = 0;

    host.tickFurnaces();
    expect(host.has(X, Y, Z)).toBe(false);
    expect(host.size).toBe(0);
    expect(persistence.calls.at(-1)?.entities).toHaveLength(0);
  });
});

describe('LiveBlockEntityHost experience and corruption guards (251)', () => {
  it('takeExperience drains the integer floor and carries the fraction', () => {
    const { host } = makeRig();
    worldPlaceAndHydrate(host, midCookState({ xp: 2.75 }));

    expect(host.takeExperience(X, Y, Z)).toBe(2);
    expect(host.getFurnaceState(X, Y, Z)?.xp).toBeCloseTo(0.75, 10);
    expect(host.takeExperience(X, Y, Z)).toBe(0); // fraction stays
    expect(host.takeExperience(123, 0, 123)).toBe(0); // absent furnace
  });

  it('ticking tolerates an empty host and multiple resident chunks', () => {
    const { world, host } = makeRig();
    world.simulating.add('0,-1');
    expect(host.tickFurnaces()).toBe(0);

    world.setBlock(X, Y, Z, 20);
    world.setBlock(40, 64, 40, 20); // chunk 2,2
    world.simulating.add('2,2');
    host.placeFurnace(X, Y, Z);
    host.placeFurnace(40, 64, 40);
    expect(host.tickFurnaces()).toBe(0); // both idle → no observable change
    expect(host.size).toBe(2);
  });
});

/** Hydrate one furnace at the rig position with the given full state. */
function worldPlaceAndHydrate(host: LiveBlockEntityHost, state: FurnaceState): void {
  const result = host.hydrate([furnaceRecord(state)]);
  if (result.hydrated !== 1) throw new Error('test setup: hydration failed');
}
