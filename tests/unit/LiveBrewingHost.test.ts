import { describe, it, expect } from 'vitest';
import {
  LiveBlockEntityHost,
  type HostWorldView,
  type LiveBlockEntityHostDeps,
} from '../../src/engine/LiveBlockEntityHost';
import type { SerializedBlockEntity } from '../../src/storage/BlockEntityRecord';
import { BLOCK_ENTITY_RECORD_VERSION } from '../../src/storage/BlockEntityRecord';
import {
  BREWING_STAND_BLOCK_ID,
  BREWING_STAND_TYPE_KEY,
  POTION_CONTENTS_KEY,
  createBrewingState,
  serializeBrewingState,
  type BrewingState,
} from '../../src/world/BrewingStandBlockEntity';
import {
  createDefaultBrewingContext,
  BLAZE_POWDER_ITEM,
  POTION_BOTTLE_ITEM,
  AWKWARD_BASE,
  REDSTONE_ITEM,
  NETHER_WART_ITEM,
  type BrewingContext,
} from '../../src/inventory/BrewingRecipes';
import { createPotionContents } from '../../src/data/PotionItemData';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

/**
 * Live brewing-host oracles (260): the 251 furnace rig shape replayed over
 * the 123 engine — single authority per position, simulating-set tick gating,
 * dirty persistence marking, hydration/quarantine, exactly-once removal, and
 * hostile batches. The pure `tickBrewing` engine stays covered by
 * BrewingStandBlockEntity.test.ts.
 */

const X = 5;
const Y = 64;
const Z = -7;

/** Fast deterministic context: a brew takes 3 ticks, test fuel burns 10. */
const FAST_CTX: BrewingContext = {
  match: (base, ingredient) =>
    base === 'test:awkward' && ingredient === 'test:reagent' ? { customEffects: [] } : null,
  fuelBurnTicks: (item) => (item === 'test:fuel' ? 10 : 0),
  brewTicks: () => 3,
};

const REAL_CTX = createDefaultBrewingContext();

function awkwardBottle(): MenuSlot {
  return {
    item: POTION_BOTTLE_ITEM,
    count: 1,
    maxStack: 64,
    components: {
      [POTION_CONTENTS_KEY]: createPotionContents({
        base: AWKWARD_BASE,
        customEffects: [{ typeId: 'minecraft:effect/speed', duration: 0, amplifier: 0 }],
      }),
    },
  };
}

function slot(item: string | null, count: number, maxStack = 64): MenuSlot {
  return { item, count, maxStack };
}

function loadedState(): BrewingState {
  return {
    ...createBrewingState(),
    bottle: awkwardBottle(),
    fuel: slot(BLAZE_POWDER_ITEM, 2),
    ingredient: slot(REDSTONE_ITEM, 2),
  };
}

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
  readonly calls: Array<{ cx: number; cz: number; entities: SerializedBlockEntity[] }> = [];

  saveBlockEntities(cx: number, cz: number, entities: SerializedBlockEntity[]): void {
    this.saved.set(`${cx},${cz}`, entities);
    this.calls.push({ cx, cz, entities });
  }
}

function brewingRecord(state: BrewingState, x = X, y = Y, z = Z): SerializedBlockEntity {
  return {
    schemaVersion: BLOCK_ENTITY_RECORD_VERSION,
    typeKey: BREWING_STAND_TYPE_KEY,
    x,
    y,
    z,
    data: serializeBrewingState(state),
  };
}

interface Rig {
  world: FakeWorld;
  persistence: FakePersistence;
  host: LiveBlockEntityHost;
}

function makeRig(ctx: BrewingContext = FAST_CTX, withPersistence = true): Rig {
  const world = new FakeWorld();
  const persistence = new FakePersistence();
  const deps: LiveBlockEntityHostDeps = {
    world,
    persistence: withPersistence ? persistence : null,
    furnaceContext: {
      fuelBurnTicks: () => 0,
      cookTicks: () => 0,
      resultOf: () => null,
      experienceOf: () => 0,
    },
    brewingContext: ctx,
    onQuarantined: () => undefined,
  };
  return { world, persistence, host: new LiveBlockEntityHost(deps) };
}

describe('brewing composition (260)', () => {
  it('placement creates exactly one instance and marks the chunk dirty', () => {
    const { world, persistence, host } = makeRig();
    world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
    expect(host.placeBrewing(X, Y, Z)).toBe(true);
    expect(host.hasBrewing(X, Y, Z)).toBe(true);
    expect(host.getBrewingState(X, Y, Z)).toEqual(createBrewingState());
    expect(host.size).toBe(1);
    expect(persistence.calls.length).toBe(1);
  });

  it('double placement returns false and leaves state untouched', () => {
    const { world, host } = makeRig();
    world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
    expect(host.placeBrewing(X, Y, Z)).toBe(true);
    expect(host.placeBrewing(X, Y, Z)).toBe(false);
    expect(host.size).toBe(1);
    expect(host.getBrewingState(X, Y, Z)).toEqual(createBrewingState());
  });

  it('removal returns the final state exactly once and re-persists', () => {
    const { world, persistence, host } = makeRig();
    world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
    host.placeBrewing(X, Y, Z);
    const callsBefore = persistence.calls.length;
    const removed = host.removeBrewing(X, Y, Z);
    expect(removed).toEqual(createBrewingState());
    expect(host.hasBrewing(X, Y, Z)).toBe(false);
    expect(host.removeBrewing(X, Y, Z)).toBeNull();
    expect(persistence.calls.length).toBe(callsBefore + 1);
  });

  it('applyBrewingMenuSlots writes atomically and returns the new state', () => {
    const { world, host } = makeRig();
    world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
    host.placeBrewing(X, Y, Z);
    const next = host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: awkwardBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
    });
    expect(next?.bottle.item).toBe(POTION_BOTTLE_ITEM);
    expect(next?.fuel).toEqual(slot(BLAZE_POWDER_ITEM, 1));
    expect(host.getBrewingState(X, Y, Z)).toEqual(next);
  });

  it('applyBrewingMenuSlots to a missing stand returns null', () => {
    const { host } = makeRig();
    expect(
      host.applyBrewingMenuSlots(X, Y, Z, {
        bottle: slot(null, 0),
        fuel: slot(null, 0),
        ingredient: slot(null, 0),
      }),
    ).toBeNull();
  });

  it('getBrewingState ignores furnace instances at the same position', () => {
    const { host } = makeRig();
    // No brewing record here at all: null, never a furnace misread.
    expect(host.getBrewingState(X, Y, Z)).toBeNull();
    expect(host.hasBrewing(X, Y, Z)).toBe(false);
  });
});

describe('brewing ticks (260)', () => {
  function simulatingRig(ctx: BrewingContext = FAST_CTX): Rig {
    const rig = makeRig(ctx);
    rig.world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
    rig.world.simulating.add('0,-1'); // chunk (0,-1) contains (5,64,-7)
    rig.host.placeBrewing(X, Y, Z);
    return rig;
  }

  it('advances only in simulating chunks', () => {
    const rig = makeRig();
    rig.world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
    rig.host.placeBrewing(X, Y, Z);
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: {
        item: POTION_BOTTLE_ITEM,
        count: 1,
        maxStack: 64,
        components: {
          [POTION_CONTENTS_KEY]: createPotionContents({
            base: 'test:awkward',
            customEffects: [{ typeId: 'test:fx', duration: 1, amplifier: 0 }],
          }),
        },
      },
      fuel: slot('test:fuel', 1),
      ingredient: slot('test:reagent', 1),
    });
    expect(rig.host.tickBrewingStands()).toBe(0); // not simulating: frozen
    expect(rig.host.getBrewingState(X, Y, Z)?.brewTime).toBe(0);
    rig.world.simulating.add('0,-1');
    expect(rig.host.tickBrewingStands()).toBe(1);
    expect(rig.host.getBrewingState(X, Y, Z)?.brewTime).toBe(1);
  });

  it('completes a fast brew and consumes one ingredient', () => {
    const rig = simulatingRig();
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: {
        item: POTION_BOTTLE_ITEM,
        count: 1,
        maxStack: 64,
        components: {
          [POTION_CONTENTS_KEY]: createPotionContents({
            base: 'test:awkward',
            customEffects: [{ typeId: 'test:fx', duration: 1, amplifier: 0 }],
          }),
        },
      },
      fuel: slot('test:fuel', 1),
      ingredient: slot('test:reagent', 2),
    });
    // brewTicks()=3 with an empty-effects output: the engine pauses at
    // completion (123 pinned rule), so timers advance but nothing consumes.
    expect(rig.host.tickBrewingStands()).toBe(1);
    const mid = rig.host.getBrewingState(X, Y, Z)!;
    expect(mid.brewTime).toBe(1);
    expect(mid.ingredient).toEqual(slot('test:reagent', 2));
  });

  it('completes the real awkward+redstone brew in 400 ticks', () => {
    const rig = simulatingRig(REAL_CTX);
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: awkwardBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
    });
    // Tick in two halves to prove determinism is path-independent.
    for (let i = 0; i < 200; i++) rig.host.tickBrewingStands();
    const mid = rig.host.getBrewingState(X, Y, Z)!;
    expect(mid.brewTime).toBe(200);
    for (let i = 0; i < 200; i++) rig.host.tickBrewingStands();
    const done = rig.host.getBrewingState(X, Y, Z)!;
    expect(done.ingredient).toEqual(slot(null, 0));
    expect(done.brewTime).toBe(0);
    expect(done.brewTimeTotal).toBe(0);
    const raw = done.bottle.components?.[POTION_CONTENTS_KEY] as {
      customEffects: Array<{ typeId: string; duration: number; amplifier: number }>;
    };
    expect(raw.customEffects).toEqual([{ typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 }]);
  });

  it('burns active fuel down while paused (safe-pause parity)', () => {
    const rig = simulatingRig(REAL_CTX);
    const paused: BrewingState = {
      ...createBrewingState(),
      bottle: slot(null, 0), // no bottle: brew pauses
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
      fuelBurnTime: 10,
      fuelBurnTimeTotal: 10,
    };
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: paused.bottle,
      fuel: paused.fuel,
      ingredient: paused.ingredient,
    });
    // Rehydrate exact timers through remove+record (apply preserves timers at 0;
    // drive the paused shape through hydration instead).
    rig.host.removeBrewing(X, Y, Z);
    expect(rig.host.hydrate([brewingRecord(paused)])).toEqual({ hydrated: 1, quarantined: 0 });
    expect(rig.host.tickBrewingStands()).toBe(1);
    const next = rig.host.getBrewingState(X, Y, Z)!;
    expect(next.fuelBurnTime).toBe(9); // fuel burns while the brew pauses
    expect(next.brewTime).toBe(0);
    expect(next.ingredient).toEqual(slot(REDSTONE_ITEM, 1)); // nothing consumed
  });

  it('lazily removes stale records once the chunk simulates', () => {
    const rig = simulatingRig();
    rig.world.setBlock(X, Y, Z, 0); // stand block gone
    expect(rig.host.tickBrewingStands()).toBe(0);
    expect(rig.host.hasBrewing(X, Y, Z)).toBe(false);
    expect(rig.host.size).toBe(0);
  });

  it('never ticks without an injected brewing context', () => {
    const world = new FakeWorld();
    const host = new LiveBlockEntityHost({
      world,
      persistence: null,
      furnaceContext: {
        fuelBurnTicks: () => 0,
        cookTicks: () => 0,
        resultOf: () => null,
        experienceOf: () => 0,
      },
    });
    world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
    world.simulating.add('0,-1');
    host.placeBrewing(X, Y, Z);
    expect(host.tickBrewingStands()).toBe(0);
    expect(host.getBrewingState(X, Y, Z)).toEqual(createBrewingState());
  });
});

describe('brewing hydration and quarantine (260)', () => {
  it('hydrates brewing rows and skips foreign typeKeys', () => {
    const { host } = makeRig();
    const foreign: SerializedBlockEntity = {
      schemaVersion: BLOCK_ENTITY_RECORD_VERSION,
      typeKey: 'chest',
      x: X,
      y: Y,
      z: Z,
      data: {},
    };
    expect(host.hydrate([brewingRecord(loadedState()), foreign])).toEqual({ hydrated: 1, quarantined: 0 });
    expect(host.hasBrewing(X, Y, Z)).toBe(true);
    expect(host.getBrewingState(X, Y, Z)?.fuel).toEqual(slot(BLAZE_POWDER_ITEM, 2));
  });

  it('quarantines future-version and malformed brewing payloads', () => {
    const quarantined: string[] = [];
    const world = new FakeWorld();
    const host = new LiveBlockEntityHost({
      world,
      persistence: null,
      furnaceContext: {
        fuelBurnTicks: () => 0,
        cookTicks: () => 0,
        resultOf: () => null,
        experienceOf: () => 0,
      },
      brewingContext: FAST_CTX,
      onQuarantined: (m) => quarantined.push(m),
    });
    const future: SerializedBlockEntity = {
      ...brewingRecord(createBrewingState()),
      schemaVersion: BLOCK_ENTITY_RECORD_VERSION + 1,
    };
    const malformed: SerializedBlockEntity = {
      schemaVersion: BLOCK_ENTITY_RECORD_VERSION,
      typeKey: BREWING_STAND_TYPE_KEY,
      x: X,
      y: Y,
      z: Z + 1,
      data: { bottle: null },
    };
    expect(host.hydrate([future, malformed])).toEqual({ hydrated: 0, quarantined: 2 });
    expect(quarantined.length).toBe(2);
    expect(host.size).toBe(0);
  });

  it('hydration is idempotent per position across mixed batches', () => {
    const { host } = makeRig();
    const first = brewingRecord(loadedState());
    expect(host.hydrate([first])).toEqual({ hydrated: 1, quarantined: 0 });
    // Same position twice + a nether-wart ingredient neighbor: second copy skipped.
    const neighbor = brewingRecord(createBrewingState(), X + 1, Y, Z);
    expect(host.hydrate([first, neighbor])).toEqual({ hydrated: 1, quarantined: 0 });
    expect(host.size).toBe(2);
  });

  it('hostile batches never corrupt furnace records', () => {
    const { host } = makeRig();
    const dup = brewingRecord(loadedState());
    const badVersion = { ...brewingRecord(createBrewingState(), X + 9, Y, Z), schemaVersion: 999 };
    const badEnvelope = { typeKey: BREWING_STAND_TYPE_KEY, x: 1, y: 2 } as unknown as SerializedBlockEntity;
    // The duplicate position is an idempotent skip (furnace parity: neither
    // hydrated nor quarantined); only the bad version + bad envelope quarantine.
    expect(host.hydrate([dup, dup, badVersion, badEnvelope])).toEqual({ hydrated: 1, quarantined: 2 });
    expect(host.getBrewingState(X, Y, Z)?.ingredient).toEqual(slot(REDSTONE_ITEM, 2));
  });

  it('persists bottle contents through the chunk snapshot path', () => {
    const rig = makeRig();
    rig.world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
    rig.host.placeBrewing(X, Y, Z);
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: awkwardBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(NETHER_WART_ITEM, 1),
    });
    const saved = rig.persistence.saved.get('0,-1')!;
    expect(saved.length).toBe(1);
    // A fresh host restores the exact snapshot (T5 persistence path).
    const rig2 = makeRig();
    expect(rig2.host.hydrate(saved)).toEqual({ hydrated: 1, quarantined: 0 });
    expect(rig2.host.getBrewingState(X, Y, Z)?.bottle).toEqual(awkwardBottle());
  });
});
