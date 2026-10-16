import { describe, expect, it } from 'vitest';
import { LiveBlockEntityHost, type HostWorldView } from '../../src/engine/LiveBlockEntityHost';
import type { SerializedBlockEntity } from '../../src/storage/BlockEntityRecord';
import { BLOCK_ENTITY_RECORD_VERSION } from '../../src/storage/BlockEntityRecord';
import { GamePersistence } from '../../src/storage/GamePersistence';
import { createIdbFactoryMock } from './IdbFactoryMock';
import {
  FURNACE_FUEL_SLOT,
  FURNACE_OUTPUT_SLOT,
  createFurnaceState,
  serializeFurnaceState,
  tickFurnace,
  validateFurnaceState,
  type FurnaceContext,
  type FurnaceState,
} from '../../src/world/FurnaceBlockEntity';
import {
  applyFurnaceMenuTransaction,
  createFurnaceMenu,
  extractFurnacePlayerSlots,
  extractFurnaceSlots,
} from '../../src/world/FurnaceBlockEntity';
import { transferOneItem } from '../../src/simulation/HopperTransfer';
import type { MenuSlot, MenuTransaction } from '../../src/inventory/MenuTransaction';

/**
 * Live-furnace integration campaign (251). These tests compose the REAL
 * production pieces — LiveBlockEntityHost over the 052 manager, the pure
 * 109/110 engine, and the GamePersistence 036/038 envelope — and prove the
 * end-to-end invariants Change 251 certifies:
 *
 *   A. close/reopen continuity        B. persistent burning without UI ownership
 *   C. autosave/reload exactness      D. blocked-output fuel discipline
 *   E. deterministic fractional XP    F. break/removal without resurrection
 *   G. stale/quarantined persistence  H. player/automation single rules engine
 *
 * Everything is driven by exact host ticks (20 TPS equivalents) — no sleeps.
 */

// ─── Deterministic rig ────────────────────────────────────────────────────────

const X = 5;
const Y = 64;
const Z = -7;
const CHUNK = `${Math.floor(X / 16)},${Math.floor(Z / 16)}`;

/** Cook takes 3 ticks; coal burns 10; stone is not a fuel; dirt is not smeltable. */
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

class SpyPersistence {
  readonly saved = new Map<string, SerializedBlockEntity[]>();
  readonly calls: Array<{ cx: number; cz: number; entities: SerializedBlockEntity[] }> = [];

  saveBlockEntities(cx: number, cz: number, entities: SerializedBlockEntity[]): void {
    this.saved.set(`${cx},${cz}`, entities);
    this.calls.push({ cx, cz, entities });
  }
}

function slot(item: string | null, count: number, maxStack = 64): MenuSlot {
  return { item, count, maxStack };
}

interface Rig {
  world: FakeWorld;
  persistence: SpyPersistence;
  host: LiveBlockEntityHost;
}

function makeRig(opts?: { simulating?: boolean }): Rig {
  const world = new FakeWorld();
  const persistence = new SpyPersistence();
  const host = new LiveBlockEntityHost({
    world,
    persistence,
    furnaceContext: CTX,
    onQuarantined: () => undefined,
  });
  world.setBlock(X, Y, Z, 20);
  if (opts?.simulating !== false) world.simulating.add(CHUNK);
  return { world, persistence, host };
}

/** Place a furnace and load it with the given working slots in one step. */
function startFurnace(
  rig: Rig,
  init?: { input?: MenuSlot; fuel?: MenuSlot; output?: MenuSlot },
): void {
  expect(rig.host.placeFurnace(X, Y, Z)).toBe(true);
  const base = createFurnaceState();
  const applied = rig.host.applyMenuSlots(X, Y, Z, {
    input: init?.input ?? base.input,
    fuel: init?.fuel ?? base.fuel,
    output: init?.output ?? base.output,
  });
  expect(applied).not.toBeNull();
}

function state(rig: Rig): FurnaceState {
  const s = rig.host.getFurnaceState(X, Y, Z);
  expect(s).not.toBeNull();
  return s!;
}

function tick(rig: Rig, n = 1): void {
  for (let i = 0; i < n; i++) rig.host.tickFurnaces();
}

/** Total count of one item across all three furnace slots. */
function furnaceTotal(s: FurnaceState, item: string): number {
  return [s.input, s.fuel, s.output].reduce(
    (sum, f) => sum + (f.item === item ? f.count : 0),
    0,
  );
}

// ─── A. Close/reopen continuity ───────────────────────────────────────────────

describe('A. close/reopen continuity (251)', () => {
  it('reopening returns to the existing live runtime — timers untouched, no second instance', () => {
    const rig = makeRig();
    startFurnace(rig, { input: slot('minecraft:sand', 4), fuel: slot('minecraft:coal', 2) });

    tick(rig, 2); // smeltTime 2/3, burnTime 8/10 mid-cook
    const beforeOpen = state(rig);

    // "Opening" the UI is a pure read of the authoritative runtime.
    expect(rig.host.getFurnaceState(X, Y, Z)).toEqual(beforeOpen);
    expect(rig.host.has(X, Y, Z)).toBe(true);
    expect(rig.host.size).toBe(1);

    // "Closing" settles the session: the cursor is gone and accumulated XP
    // drains to the player (Game.closeFurnace contract) — timers are not reset.
    const drained = rig.host.takeExperience(X, Y, Z);
    expect(drained).toBe(0); // no completed cook yet

    // Reopening sees the same runtime; simulation continued identically.
    tick(rig, 1);
    const reopened = state(rig);
    expect(reopened.output).toEqual(slot('minecraft:glass', 1));
    expect(reopened.smeltTime).toBe(0);
    expect(reopened.burnTime).toBe(beforeOpen.burnTime - 1);
    expect(rig.host.size).toBe(1);
  });

  it('a cook interrupted by arbitrary open/close cycles still finishes in exactly the remaining canonical ticks', () => {
    const rig = makeRig();
    startFurnace(rig, { input: slot('minecraft:sand', 1), fuel: slot('minecraft:coal', 1) });

    // One tick of progress, then a burst of UI churn, then finish.
    tick(rig, 1);
    for (let i = 0; i < 5; i++) {
      void rig.host.getFurnaceState(X, Y, Z);
      void rig.host.takeExperience(X, Y, Z);
    }
    tick(rig, 2);
    const done = state(rig);
    expect(done.output.count).toBe(1);
    expect(done.input.item).toBeNull();

    // Exactly-once: further ticks without input produce nothing more.
    tick(rig, 5);
    expect(state(rig).output.count).toBe(1);
  });
});

// ─── B. Persistent burning without UI ownership ───────────────────────────────

describe('B. persistent burning without UI ownership (251)', () => {
  it('processing continues to completion with no UI involvement whatsoever', () => {
    const rig = makeRig();
    startFurnace(rig, { input: slot('minecraft:sand', 12), fuel: slot('minecraft:coal', 4) });

    // 40 ticks: each 10-tick coal window yields exactly 3 cooks (36 burn
    // ticks total across 4 windows). All FOUR coals are consumed lighting
    // those windows; the 12 inputs convert fully.
    tick(rig, 40);
    const s = state(rig);
    expect(s.output).toEqual(slot('minecraft:glass', 12));
    expect(s.input.item).toBeNull();
    expect(s.fuel.item).toBeNull();
    // All four coals were consumed lighting the four 10-tick windows; the
    // final window's burn froze at its residual once the input ran out —
    // burning never continues without a cookable input.
    expect(s.burnTime).toBe(4);
    expect(s.smeltTime).toBe(0);
    expect(s.xp).toBeCloseTo(8.4, 10);
  });

  it('host ticking is frame-rate independent: N single ticks ≡ one N-tick application', () => {
    const build = (): FurnaceState => ({
      ...createFurnaceState(),
      input: slot('minecraft:sand', 7),
      fuel: slot('minecraft:coal', 3),
      burnTime: 4,
      burnTimeTotal: 10,
      smeltTime: 2,
      smeltTimeTotal: 3,
      xp: 1.4,
    });

    // Hydrate the FULL state (timers included) — the menu-slot contract only
    // carries the three slots.
    const stepped = makeRig();
    stepped.host.hydrate([
      { schemaVersion: BLOCK_ENTITY_RECORD_VERSION, typeKey: 'furnace', x: X, y: Y, z: Z, data: serializeFurnaceState(build()) },
    ]);

    const oneShot = tickFurnace(build(), CTX, 37);
    tick(stepped, 37);

    expect(state(stepped)).toEqual(validateFurnaceState(oneShot));
  });
});

// ─── C. Autosave/reload exact continuity ──────────────────────────────────────

describe('C. autosave/reload exact continuity (251)', () => {
  it('a runtime that passes through a real persistence boundary ends byte-identical to one that never reloads', async () => {
    // Reference host: runs 60 ticks uninterrupted.
    const reference = makeRig();
    startFurnace(reference, { input: slot('minecraft:sand', 9), fuel: slot('minecraft:coal', 3) });
    tick(reference, 60);

    // Traveler host: 23 ticks → real IndexedDB save → flush → reopen →
    // hydrate → 37 more ticks. Must land exactly on the reference state.
    const factory = createIdbFactoryMock();
    const p1 = new GamePersistence({ seed: 11, factory, legacyStorage: null, flushTarget: null });
    await p1.open();

    const traveler = makeRig();
    startFurnace(traveler, { input: slot('minecraft:sand', 9), fuel: slot('minecraft:coal', 3) });
    tick(traveler, 23);

    const snapshot = traveler.host.serializeChunkForSave(Math.floor(X / 16), Math.floor(Z / 16));
    expect(snapshot).toHaveLength(1);
    p1.saveBlockEntities(Math.floor(X / 16), Math.floor(Z / 16), snapshot);
    await p1.flush();

    // "Page reload": a brand-new facade over the same storage.
    const p2 = new GamePersistence({ seed: 11, factory, legacyStorage: null });
    const reopened = await p2.open();
    expect(reopened.initialBlockEntities).toHaveLength(1);

    const world2 = new FakeWorld();
    world2.setBlock(X, Y, Z, 20);
    world2.simulating.add(CHUNK);
    const host2 = new LiveBlockEntityHost({
      world: world2,
      persistence: null,
      furnaceContext: CTX,
      onQuarantined: () => undefined,
    });
    expect(host2.hydrate(reopened.initialBlockEntities).hydrated).toBe(1);

    // Hydration restored the committed boundary exactly (all eight fields).
    expect(host2.getFurnaceState(X, Y, Z)).toEqual(traveler.host.getFurnaceState(X, Y, Z));

    const rig2: Rig = { world: world2, persistence: new SpyPersistence(), host: host2 };
    tick(rig2, 37);

    expect(state(rig2)).toEqual(state(reference));

    // And the committed snapshot never double-produced: the second cook after
    // reload needs a further full canonical cook, not a free output.
    const committed = JSON.parse(JSON.stringify(snapshot[0]!.data)) as FurnaceState;
    expect(() => validateFurnaceState(committed)).not.toThrow();
  });

  it('every observable change marks its chunk dirty — autosave can never drop a live runtime', () => {
    const rig = makeRig();
    startFurnace(rig, { input: slot('minecraft:sand', 2), fuel: slot('minecraft:coal', 1) });
    const marksAfterSetup = rig.persistence.calls.length;

    tick(rig, 3); // one cook completes
    expect(rig.persistence.calls.length).toBeGreaterThan(marksAfterSetup);
    expect(rig.persistence.saved.get(CHUNK)).toHaveLength(1);

    // The newest persisted snapshot always equals the live runtime state.
    const last = rig.persistence.calls.at(-1)!.entities[0]!;
    expect(last.data).toEqual(serializeFurnaceState(state(rig)));
  });
});

// ─── D. Blocked-output fuel discipline ────────────────────────────────────────

describe('D. blocked-output fuel discipline (251)', () => {
  it('a saturated same-item output consumes neither fuel nor input and never lights', () => {
    const rig = makeRig();
    startFurnace(rig, {
      input: slot('minecraft:sand', 5),
      fuel: slot('minecraft:coal', 3),
      output: slot('minecraft:glass', 64),
    });

    tick(rig, 50);
    const s = state(rig);
    expect(s.fuel).toEqual(slot('minecraft:coal', 3));
    expect(s.input).toEqual(slot('minecraft:sand', 5));
    expect(s.burnTime).toBe(0);
    expect(s.smeltTime).toBe(0);
  });

  it('an output blocked by a different item freezes processing identically', () => {
    const rig = makeRig();
    startFurnace(rig, {
      input: slot('minecraft:sand', 5),
      fuel: slot('minecraft:coal', 3),
      output: slot('minecraft:dirt', 1),
    });

    tick(rig, 20);
    const s = state(rig);
    expect(s.fuel.count).toBe(3);
    expect(s.output.item).toBe('minecraft:dirt');
  });

  it('unblocking resumes with exactly one new fuel unit and normal progression', () => {
    const rig = makeRig();
    startFurnace(rig, {
      input: slot('minecraft:sand', 5),
      fuel: slot('minecraft:coal', 3),
      output: slot('minecraft:glass', 64),
    });
    tick(rig, 10);
    expect(state(rig).fuel.count).toBe(3); // frozen while blocked

    // Player extracts the whole saturated output through the host contract.
    const cleared = rig.host.applyMenuSlots(X, Y, Z, {
      input: state(rig).input,
      fuel: state(rig).fuel,
      output: slot(null, 0),
    });
    expect(cleared).not.toBeNull();

    tick(rig, 1); // lights: consumes exactly one coal, begins cooking
    let s = state(rig);
    expect(s.fuel).toEqual(slot('minecraft:coal', 2));
    expect(s.burnTime).toBe(9); // 10 − this tick
    expect(s.smeltTime).toBe(1);

    tick(rig, 2);
    s = state(rig);
    expect(s.output).toEqual(slot('minecraft:glass', 1));
    expect(s.input.count).toBe(4);
  });

  it('fuel never ignites merely because it exists — invalid fuel and unsmeltable input stay inert', () => {
    const invalidFuel = makeRig();
    startFurnace(invalidFuel, { input: slot('minecraft:sand', 2), fuel: slot('minecraft:stone', 5) });
    tick(invalidFuel, 15);
    let s = state(invalidFuel);
    expect(s.fuel).toEqual(slot('minecraft:stone', 5));
    expect(s.burnTime).toBe(0);
    // Progress never advances while unlit (the pending recipe may advertise
    // its cook total, but the fraction stays 0 and nothing is ever consumed).
    expect(s.smeltTime).toBe(0);
    expect(s.input).toEqual(slot('minecraft:sand', 2));

    const unsmeltable = makeRig();
    startFurnace(unsmeltable, { input: slot('minecraft:dirt', 2), fuel: slot('minecraft:coal', 5) });
    tick(unsmeltable, 15);
    s = state(unsmeltable);
    expect(s.fuel).toEqual(slot('minecraft:coal', 5));
    expect(s.burnTime).toBe(0);
    expect(s.input).toEqual(slot('minecraft:dirt', 2));
  });
});

// ─── E. Deterministic fractional values ───────────────────────────────────────

describe('E. deterministic fractional values (251)', () => {
  it('fractional XP accumulates identically across repeated runs and persistence boundaries', async () => {
    const runOnce = async (throughStorage: boolean): Promise<FurnaceState> => {
      const rig = makeRig();
      startFurnace(rig, { input: slot('minecraft:sand', 6), fuel: slot('minecraft:coal', 2) });
      tick(rig, 19); // 6 cooks (18 burn ticks within two 10-tick burns)
      const final = state(rig);
      if (!throughStorage) return final;

      const factory = createIdbFactoryMock();
      const p1 = new GamePersistence({ seed: 11, factory, legacyStorage: null, flushTarget: null });
      await p1.open();
      p1.saveBlockEntities(Math.floor(X / 16), Math.floor(Z / 16), rig.host.serializeChunkForSave(Math.floor(X / 16), Math.floor(Z / 16)));
      await p1.flush();
      const p2 = new GamePersistence({ seed: 11, factory, legacyStorage: null });
      const reopened = await p2.open();
      const world2 = new FakeWorld();
      world2.setBlock(X, Y, Z, 20);
      world2.simulating.add(CHUNK);
      const host2 = new LiveBlockEntityHost({
        world: world2,
        persistence: null,
        furnaceContext: CTX,
        onQuarantined: () => undefined,
      });
      host2.hydrate(reopened.initialBlockEntities);
      return host2.getFurnaceState(X, Y, Z)!;
    };

    const a = await runOnce(false);
    const b = await runOnce(false);
    const stored = await runOnce(true);
    // Bit-exact (Object.is) — no frame-rate, ordering, or save/reload drift.
    expect(Object.is(a.xp, b.xp)).toBe(true);
    expect(Object.is(a.xp, stored.xp)).toBe(true);
    expect(a).toEqual(stored);
    expect(a.output.count).toBe(6);
    expect(a.xp).toBeGreaterThan(4); // six 0.7 grants
  });

  it('XP drains its integer floor and carries the fraction across reload exactly once', async () => {
    const rig = makeRig();
    startFurnace(rig, { input: slot('minecraft:sand', 6), fuel: slot('minecraft:coal', 2) });
    tick(rig, 19);
    const before = state(rig);

    const first = rig.host.takeExperience(X, Y, Z);
    expect(first).toBe(Math.floor(before.xp));
    const carried = state(rig).xp;
    expect(carried).toBeLessThan(1);
    expect(rig.host.takeExperience(X, Y, Z)).toBe(0); // fraction stays put

    // Reload carries the same fraction — never re-awarded, never duplicated.
    const factory = createIdbFactoryMock();
    const p1 = new GamePersistence({ seed: 11, factory, legacyStorage: null, flushTarget: null });
    await p1.open();
    p1.saveBlockEntities(Math.floor(X / 16), Math.floor(Z / 16), rig.host.serializeChunkForSave(Math.floor(X / 16), Math.floor(Z / 16)));
    await p1.flush();
    const p2 = new GamePersistence({ seed: 11, factory, legacyStorage: null });
    const reopened = await p2.open();
    const world2 = new FakeWorld();
    world2.setBlock(X, Y, Z, 20);
    const host2 = new LiveBlockEntityHost({ world: world2, persistence: null, furnaceContext: CTX });
    host2.hydrate(reopened.initialBlockEntities);
    expect(Object.is(host2.getFurnaceState(X, Y, Z)!.xp, carried)).toBe(true);
    expect(host2.takeExperience(X, Y, Z)).toBe(0);
  });

  it('fractional burn/cook timers are rejected by validation — timing stays integer-canonical', () => {
    const rig = makeRig();
    startFurnace(rig);
    const fractional = {
      ...state(rig),
      input: slot('minecraft:sand', 1),
      burnTime: 5.5,
      burnTimeTotal: 10,
    };
    expect(() => validateFurnaceState(fractional)).toThrow(/non-negative integer/);
    // Such a payload can never enter the runtime via hydration — at a FREE
    // position (a resident one would be skipped before payload parsing).
    const bad: SerializedBlockEntity[] = [
      {
        schemaVersion: BLOCK_ENTITY_RECORD_VERSION,
        typeKey: 'furnace',
        x: 777,
        y: Y,
        z: Z,
        data: { ...(serializeFurnaceState(createFurnaceState()) as Record<string, unknown>), burnTime: 0.5 },
      },
    ];
    expect(rig.host.hydrate(bad)).toEqual({ hydrated: 0, quarantined: 1 });
  });
});

// ─── F. Break/removal without resurrection ────────────────────────────────────

describe('F. break/removal without resurrection (251)', () => {
  it('breaking mid-cook returns the full final state exactly once and empties persistence', async () => {
    const rig = makeRig();
    startFurnace(rig, { input: slot('minecraft:sand', 4), fuel: slot('minecraft:coal', 2) });
    tick(rig, 7); // mid second cook, actively burning
    const live = state(rig);
    expect(live.burnTime).toBeGreaterThan(0);

    const dropsSource = rig.host.removeFurnace(X, Y, Z);
    expect(dropsSource).toEqual(live);
    expect(rig.host.removeFurnace(X, Y, Z)).toBeNull(); // exactly once
    expect(rig.host.size).toBe(0);

    // Persisted record invalidated: an empty snapshot overwrote the chunk.
    const last = rig.persistence.calls.at(-1)!;
    expect(last.entities).toHaveLength(0);

    // A fresh boot over real storage sees nothing to resurrect.
    const factory = createIdbFactoryMock();
    const p1 = new GamePersistence({ seed: 11, factory, legacyStorage: null, flushTarget: null });
    await p1.open();
    p1.saveBlockEntities(Math.floor(X / 16), Math.floor(Z / 16), last.entities);
    await p1.flush();
    const p2 = new GamePersistence({ seed: 11, factory, legacyStorage: null });
    const reopened = await p2.open();
    expect(reopened.initialBlockEntities).toHaveLength(0);
    const world2 = new FakeWorld();
    world2.setBlock(X, Y, Z, 20);
    const host2 = new LiveBlockEntityHost({ world: world2, persistence: null, furnaceContext: CTX });
    host2.hydrate(reopened.initialBlockEntities);
    expect(host2.size).toBe(0);
    expect(host2.has(X, Y, Z)).toBe(false);
  });

  it('drops carry every occupied stack plus the floored XP; placement afterward starts legitimately fresh', () => {
    const rig = makeRig();
    startFurnace(rig, {
      input: slot('minecraft:sand', 9),
      fuel: slot('minecraft:coal', 3),
      output: slot('minecraft:glass', 2),
    });
    tick(rig, 13);
    const live = state(rig);

    const drops = rig.host.removeFurnace(X, Y, Z)!;
    const dropTotal = (item: string) =>
      [drops.input, drops.fuel, drops.output].reduce((n, f) => n + (f.item === item ? f.count : 0), 0);
    expect(dropTotal('minecraft:sand')).toBe(furnaceTotal(live, 'minecraft:sand'));
    expect(dropTotal('minecraft:coal')).toBe(furnaceTotal(live, 'minecraft:coal'));
    expect(dropTotal('minecraft:glass')).toBe(furnaceTotal(live, 'minecraft:glass'));
    expect(Math.floor(drops.xp)).toBe(Math.floor(live.xp)); // orb value

    // New placement at the same coordinates inherits nothing.
    expect(rig.host.placeFurnace(X, Y, Z)).toBe(true);
    const fresh = state(rig);
    expect(fresh).toEqual(createFurnaceState());
    expect(fresh.xp).toBe(0);
  });
});

// ─── G. Stale/quarantined persistence ─────────────────────────────────────────

describe('G. stale/quarantined persistence (251)', () => {
  function record(data: unknown, version = BLOCK_ENTITY_RECORD_VERSION, at = { x: X, y: Y, z: Z }): SerializedBlockEntity {
    return { schemaVersion: version, typeKey: 'furnace', x: at.x, y: at.y, z: at.z, data };
  }

  it('a hostile batch quarantines exactly the unsafe rows and hydrates the safe ones', () => {
    const rig = makeRig();
    const good = record(serializeFurnaceState({ ...createFurnaceState(), xp: 1.4 }));
    const batch: SerializedBlockEntity[] = [
      good,
      record(serializeFurnaceState(createFurnaceState()), 99, { x: 1, y: 1, z: 1 }), // future version
      record({ input: { item: 'minecraft:sand', count: 999, maxStack: 64 } }, BLOCK_ENTITY_RECORD_VERSION, { x: 2, y: 1, z: 1 }), // impossible stack
      record(null, BLOCK_ENTITY_RECORD_VERSION, { x: 3, y: 1, z: 1 }), // malformed payload
      { schemaVersion: 1, typeKey: '', x: 4, y: 1, z: 1, data: {} }, // broken envelope
    ];
    expect(rig.host.hydrate(batch)).toEqual({ hydrated: 1, quarantined: 4 });
    expect(rig.host.size).toBe(1);
    expect(rig.host.getFurnaceState(X, Y, Z)?.xp).toBe(1.4);

    // Ticking with hostile neighbors present stays stable.
    tick(rig, 5);
    expect(rig.host.size).toBe(1);
  });

  it('stale rows for removed furnaces vanish lazily on the first simulating tick and stay gone', () => {
    const rig = makeRig({ simulating: false }); // chunk not yet simulating
    const stale = record(serializeFurnaceState({ ...createFurnaceState(), xp: 2 }));
    rig.world.blocks.delete(`${X},${Y},${Z}`); // block no longer a furnace
    rig.world.simulating.add(CHUNK);

    rig.host.hydrate([stale]);
    tick(rig, 1);
    expect(rig.host.size).toBe(0);
    // The cleanup persisted the empty snapshot.
    expect(rig.persistence.calls.at(-1)!.entities).toHaveLength(0);

    // Even if a stale row were re-offered (no production path does this after
    // boot), every simulating tick re-cleans it — self-healing, never sticky.
    rig.host.hydrate([stale]);
    tick(rig, 1);
    expect(rig.host.size).toBe(0);
    expect(rig.persistence.calls.at(-1)!.entities).toHaveLength(0);
  });

  it('one coordinate can never hold two runtimes — placement and hydration dedupe', () => {
    const rig = makeRig();
    startFurnace(rig, { input: slot('minecraft:sand', 1), fuel: slot('minecraft:coal', 1) });
    const before = state(rig);

    // Chunk activation / rehydration paths skip resident positions…
    const duplicateRow = record(serializeFurnaceState({ ...createFurnaceState(), xp: 42 }), BLOCK_ENTITY_RECORD_VERSION, { x: X, y: Y, z: Z });
    expect(rig.host.hydrate([duplicateRow]).hydrated).toBe(0);
    // …and placement over an occupied position fails outright.
    expect(rig.host.placeFurnace(X, Y, Z)).toBe(false);
    expect(rig.host.size).toBe(1);
    expect(state(rig)).toEqual(before); // authoritative state untouched
    expect(state(rig).xp).not.toBe(42);
  });
});

// ─── H. Player + automation single rules engine ───────────────────────────────

/**
 * Headless player driver: the exact exported primitive chain FurnacePanel
 * executes per click (derive menu → ONE 106 transaction → host write-back),
 * minus DOM concerns. The panel's own DOM/policy layer is pinned separately
 * by FurnacePanelTransactions.test.ts; here we prove state convergence.
 */
class PlayerSession {
  readonly hotbar: MenuSlot[] = Array.from({ length: 9 }, () => slot(null, 0));
  cursor: { item: string | null; count: number } = { item: null, count: 0 };

  constructor(private readonly host: LiveBlockEntityHost) {}

  /** Run one 106 transaction against the live furnace and write the result back. */
  transact(tx: MenuTransaction): void {
    const furnace = this.host.getFurnaceState(X, Y, Z);
    expect(furnace).not.toBeNull();
    // Player region = 9 hotbar slots + 27 untouched storage empties (the panel
    // derives the same 36 from the Inventory).
    const playerSlots = [...this.hotbar, ...Array.from({ length: 27 }, () => slot(null, 0))];
    const menu = createFurnaceMenu(furnace!, playerSlots, { ...this.cursor });
    const next = applyFurnaceMenuTransaction(menu, tx);
    const applied = this.host.applyMenuSlots(X, Y, Z, extractFurnaceSlots(next));
    expect(applied).not.toBeNull();
    const playerNext = extractFurnacePlayerSlots(next);
    for (let i = 0; i < 9; i++) this.hotbar[i] = playerNext[i]!;
    this.cursor = { item: next.cursor.item, count: next.cursor.count };
  }

  quickMoveTo(index: number): void {
    this.transact({ type: 'quickMove', index });
  }

  leftClick(index: number): void {
    this.transact({ type: 'leftClick', index });
  }

  /** Hotbar menu indices are 3..11 for hotbar slots 0..8 (player region). */
  static hotbarMenuIndex(hotbarIndex: number): number {
    return 3 + hotbarIndex;
  }
}

/**
 * Automation driver: vanilla-correct hopper routing through the shared
 * `transferOneItem` primitive (166) — above feeds the input slot, below pulls
 * from the output slot. Write-back goes through the same host contract as the
 * player path.
 */
class HopperAutomation {
  constructor(private readonly host: LiveBlockEntityHost) {}

  /** Push one item from a hopper above into the furnace input slot. */
  pushIntoInput(from: MenuSlot[]): boolean {
    const furnace = this.host.getFurnaceState(X, Y, Z)!;
    const result = transferOneItem(from, [furnace.input]);
    if (result.moved) {
      from.length = 0;
      from.push(...result.source); // adopt the primitive's updated source side
      this.host.applyMenuSlots(X, Y, Z, { input: result.destination[0]!, fuel: furnace.fuel, output: furnace.output });
    }
    return result.moved;
  }

  /** Pull one item from the furnace output into a hopper below. */
  pullOutput(into: MenuSlot[]): boolean {
    const furnace = this.host.getFurnaceState(X, Y, Z)!;
    const result = transferOneItem([furnace.output], into);
    if (result.moved) {
      this.host.applyMenuSlots(X, Y, Z, { input: furnace.input, fuel: furnace.fuel, output: result.source[0]! });
      into.length = 0;
      into.push(...result.destination);
    }
    return result.moved;
  }
}

describe('H. player + automation single rules engine (251)', () => {
  it('hopper-fed input and player-added fuel interleave into one deterministic outcome', () => {
    const rig = makeRig();
    startFurnace(rig);

    const hopperFeed = [slot('minecraft:sand', 5)];
    const automation = new HopperAutomation(rig.host);
    const player = new PlayerSession(rig.host);
    player.hotbar[0] = slot('minecraft:coal', 4);

    // 1. hopper inserts input, 2. player adds fuel, 3. simulation advances.
    expect(automation.pushIntoInput(hopperFeed)).toBe(true);
    expect(hopperFeed).toEqual([slot('minecraft:sand', 4)]);
    player.leftClick(PlayerSession.hotbarMenuIndex(0));
    expect(player.hotbar[0]).toEqual(slot(null, 0));
    expect(player.cursor).toEqual({ item: 'minecraft:coal', count: 4 });
    player.leftClick(FURNACE_FUEL_SLOT);
    expect(player.cursor.item).toBeNull();

    tick(rig, 3);
    expect(state(rig).output).toEqual(slot('minecraft:glass', 1));

    // 4. hopper extracts the output while the session stays open.
    const hopperBelow: MenuSlot[] = [slot(null, 0)];
    expect(automation.pullOutput(hopperBelow)).toBe(true);
    expect(hopperBelow).toEqual([slot('minecraft:glass', 1)]);

    // 5. the hopper feeds the next input unit, 6. simulation advances again.
    expect(automation.pushIntoInput(hopperFeed)).toBe(true);
    expect(hopperFeed).toEqual([slot('minecraft:sand', 3)]);

    tick(rig, 6);
    const s = state(rig);

    // Conservation after the full interleave (engine ground truth): all 9
    // active ticks fall inside the FIRST coal's burn window → one coal unit
    // ever consumed; cooks completed at t3 and t6; with the input then spent,
    // the burn froze at its residual (bt 4) and no third cook began.
    // Glasses: two produced — one pulled by the hopper, one in the furnace.
    // Sand: two cooked + three still queued in the hopper above.
    const cursorGlass = player.cursor.item === 'minecraft:glass' ? player.cursor.count : 0;
    const cursorSand = player.cursor.item === 'minecraft:sand' ? player.cursor.count : 0;
    expect(furnaceTotal(s, 'minecraft:coal') + (player.hotbar[0]!.count || 0)).toBe(3);
    const glassInWorld = furnaceTotal(s, 'minecraft:glass') + cursorGlass + 1; // +1 in hopper below
    const sandAccounted =
      furnaceTotal(s, 'minecraft:sand') + cursorSand + 2 /* cooked */ + hopperFeed[0]!.count;
    expect(glassInWorld).toBe(2);
    expect(sandAccounted).toBe(5);
    expect(s.burnTime).toBe(4); // frozen residual — no fuel burned without input
    expect(s.xp).toBeCloseTo(1.4, 10);
  });

  it('player extraction immediately after hopper extraction never duplicates output', () => {
    const rig = makeRig();
    startFurnace(rig, { input: slot('minecraft:sand', 3), fuel: slot('minecraft:coal', 2) });
    tick(rig, 3); // one glass ready

    const automation = new HopperAutomation(rig.host);
    const hopper: MenuSlot[] = [slot(null, 0)];
    expect(automation.pullOutput(hopper)).toBe(true);
    expect(state(rig).output.item).toBeNull();

    const player = new PlayerSession(rig.host);
    player.leftClick(FURNACE_OUTPUT_SLOT); // nothing to take
    expect(player.cursor.item).toBeNull();

    tick(rig, 3); // second glass
    expect(automation.pullOutput(hopper)).toBe(true); // hopper wins this one
    expect(hopper).toEqual([slot('minecraft:glass', 2)]);
    expect(state(rig).output.item).toBeNull();

    // Total glass across furnace + hopper + player is exactly the produced 2.
    let glass = furnaceTotal(state(rig), 'minecraft:glass') + hopper[0]!.count;
    glass += player.cursor.item === 'minecraft:glass' ? player.cursor.count : 0;
    expect(glass).toBe(2);
  });

  it('activation/deactivation churn around interleaved mutations changes nothing', () => {
    const straight = makeRig();
    const churned = makeRig();

    // Identical ACTIVE tick schedule on both rigs; the churned one merely sits
    // deactivated (frozen) before it starts.
    const script = (rig: Rig): MenuSlot[] => {
      startFurnace(rig, { input: slot('minecraft:sand', 6), fuel: slot('minecraft:coal', 3) });
      const automation = new HopperAutomation(rig.host);
      const hopper: MenuSlot[] = [slot(null, 0)];
      tick(rig, 3); // first glass
      expect(automation.pullOutput(hopper)).toBe(true);
      tick(rig, 4);
      tick(rig, 2); // cooks at active t6 and t9
      return hopper;
    };

    const straightHopper = script(straight);

    churned.world.simulating.delete(CHUNK);
    tick(churned, 5); // fully frozen while deactivated
    churned.world.simulating.add(CHUNK);
    const churnedHopper = script(churned);

    expect(state(churned)).toEqual(state(straight));
    expect(straightHopper).toEqual(churnedHopper);
    expect(state(straight).output.count).toBe(2);
    expect(state(straight).xp).toBeCloseTo(2.1, 10);
  });

  it('mutations persist through the shared host revision path regardless of who mutated', () => {
    const rig = makeRig();
    startFurnace(rig);
    rig.persistence.calls.length = 0;

    const automation = new HopperAutomation(rig.host);
    const player = new PlayerSession(rig.host);

    automation.pushIntoInput([slot('minecraft:sand', 2)]);
    expect(rig.persistence.calls.at(-1)!.entities).toHaveLength(1);
    rig.persistence.calls.length = 0;

    player.hotbar[0] = slot('minecraft:coal', 1);
    player.leftClick(PlayerSession.hotbarMenuIndex(0));
    player.leftClick(FURNACE_FUEL_SLOT);
    expect(rig.persistence.calls.length).toBeGreaterThan(0);
    rig.persistence.calls.length = 0;

    tick(rig, 3);
    expect(rig.persistence.calls.length).toBeGreaterThan(0);
    expect(rig.persistence.calls.at(-1)!.entities[0]!.data).toEqual(serializeFurnaceState(state(rig)));
  });
});
