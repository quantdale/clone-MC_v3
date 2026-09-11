import { describe, expect, it } from 'vitest';
import { LiveBlockEntityHost, type HostWorldView } from '../../src/engine/LiveBlockEntityHost';
import {
  BREWING_STAND_BLOCK_ID,
  POTION_CONTENTS_KEY,
  applyBrewingMenuTransaction,
  createBrewingMenu,
  createBrewingState,
  extractBrewingSlots,
  serializeBrewingState,
  type BrewingState,
} from '../../src/world/BrewingStandBlockEntity';
import {
  AWKWARD_BASE,
  BLAZE_POWDER_ITEM,
  POTION_BOTTLE_ITEM,
  REDSTONE_ITEM,
  createDefaultBrewingContext,
} from '../../src/inventory/BrewingRecipes';
import { createPotionContents, POTION_CONTENTS_COMPONENT } from '../../src/data/PotionItemData';
import {
  StackComponentMap,
  createDefaultStackComponentRegistry,
} from '../../src/inventory/StackDataComponents';
import { createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';
import { menuSlotToStack, stackToMenuSlot } from '../../src/inventory/MenuSlots';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

/**
 * Live-brewing integration campaign (260). These tests compose the REAL
 * production pieces — LiveBlockEntityHost over the 052 manager, the pure 123
 * engine over the default brewing context, the real item registry, and the
 * MenuSlots component conversions — and prove the end-to-end invariants:
 *
 *   A. menu insert continuity     B. brewing without UI ownership
 *   C. autosave/reload exactness  D. fuel discipline without a bottle
 *   E. break/removal/resurrection F. registry conversion round-trip
 *   G. stale/quarantine           H. first-fit quick-move ordering
 *
 * Everything is driven by exact host ticks (20 TPS equivalents) — no sleeps.
 */

const X = 5;
const Y = 64;
const Z = -7;
const CHUNK = `${Math.floor(X / 16)},${Math.floor(Z / 16)}`;
const REAL_CTX = createDefaultBrewingContext();
const registry = createDefaultItemRegistry();
const componentRegistry = createDefaultStackComponentRegistry();

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
  readonly saved = new Map<string, { cx: number; cz: number; entities: ReturnType<LiveBlockEntityHost['serializeChunkForSave']> }>();
  saveBlockEntities(cx: number, cz: number, entities: ReturnType<LiveBlockEntityHost['serializeChunkForSave']>): void {
    this.saved.set(`${cx},${cz}`, { cx, cz, entities });
  }
}

function slot(item: string | null, count: number, maxStack = 64): MenuSlot {
  return { item, count, maxStack };
}

function awkwardBottleSlot(): MenuSlot {
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
    furnaceContext: {
      fuelBurnTicks: () => 0,
      cookTicks: () => 0,
      resultOf: () => null,
      experienceOf: () => 0,
    },
    brewingContext: REAL_CTX,
    onQuarantined: () => undefined,
  });
  world.setBlock(X, Y, Z, BREWING_STAND_BLOCK_ID);
  if (opts?.simulating !== false) world.simulating.add(CHUNK);
  return { world, persistence, host };
}

function state(rig: Rig): BrewingState {
  const s = rig.host.getBrewingState(X, Y, Z);
  expect(s).not.toBeNull();
  return s!;
}

function tick(rig: Rig, n = 1): void {
  for (let i = 0; i < n; i++) rig.host.tickBrewingStands();
}

describe('A. menu insert continuity (260)', () => {
  it('quick-move bottle→fuel→ingredient lands each role with contents intact', () => {
    const rig = makeRig();
    expect(rig.host.placeBrewing(X, Y, Z)).toBe(true);
    const playerSlots: MenuSlot[] = Array.from({ length: 36 }, () => slot(null, 0));
    playerSlots[0] = awkwardBottleSlot();
    playerSlots[1] = slot(BLAZE_POWDER_ITEM, 4);
    playerSlots[2] = slot(REDSTONE_ITEM, 5);

    let menu = createBrewingMenu(state(rig), playerSlots);
    menu = applyBrewingMenuTransaction(menu, { type: 'quickMove', index: 3 });
    menu = applyBrewingMenuTransaction(menu, { type: 'quickMove', index: 4 });
    menu = applyBrewingMenuTransaction(menu, { type: 'quickMove', index: 5 });
    const stand = extractBrewingSlots(menu);
    const applied = rig.host.applyBrewingMenuSlots(X, Y, Z, stand);
    expect(applied?.bottle.item).toBe(POTION_BOTTLE_ITEM);
    expect(applied?.bottle.components?.[POTION_CONTENTS_KEY]).toBeDefined();
    expect(applied?.fuel).toEqual(slot(BLAZE_POWDER_ITEM, 4));
    expect(applied?.ingredient).toEqual(slot(REDSTONE_ITEM, 5));
    // Reopening derives the same menu from authority (close/reopen continuity).
    const reopened = createBrewingMenu(state(rig), playerSlots);
    expect(extractBrewingSlots(reopened).bottle).toEqual(applied?.bottle);
  });
});

describe('B. brewing without UI ownership (260)', () => {
  it('completes awkward+redstone over exact host ticks with the panel closed', () => {
    const rig = makeRig();
    rig.host.placeBrewing(X, Y, Z);
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: awkwardBottleSlot(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
    });
    tick(rig, 399);
    expect(state(rig).brewTime).toBe(399);
    expect(state(rig).ingredient).toEqual(slot(REDSTONE_ITEM, 1)); // not yet consumed
    tick(rig, 1);
    const done = state(rig);
    expect(done.ingredient).toEqual(slot(null, 0));
    expect(done.fuel).toEqual(slot(null, 0)); // the single powder burned
    const contents = done.bottle.components?.[POTION_CONTENTS_KEY] as {
      customEffects: Array<{ typeId: string; duration: number; amplifier: number }>;
    };
    expect(contents.customEffects).toEqual([{ typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 }]);
  });
});

describe('C. autosave/reload exactness (260)', () => {
  it('snapshot → fresh host hydrate restores slots, contents, and timers', () => {
    const rig = makeRig();
    rig.host.placeBrewing(X, Y, Z);
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: awkwardBottleSlot(),
      fuel: slot(BLAZE_POWDER_ITEM, 2),
      ingredient: slot(REDSTONE_ITEM, 2),
    });
    tick(rig, 100);
    const snapshot = rig.host.serializeChunkForSave(0, -1);
    expect(snapshot).toHaveLength(1);

    const rig2 = makeRig();
    expect(rig2.host.hydrate(snapshot)).toEqual({ hydrated: 1, quarantined: 0 });
    expect(rig2.host.getBrewingState(X, Y, Z)).toEqual(state(rig));
  });
});

describe('D. fuel discipline without a bottle (260)', () => {
  it('never lights fuel when no brew is possible', () => {
    const rig = makeRig();
    rig.host.placeBrewing(X, Y, Z);
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: slot(null, 0),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
    });
    tick(rig, 50);
    const s = state(rig);
    expect(s.fuel).toEqual(slot(BLAZE_POWDER_ITEM, 1));
    expect(s.fuelBurnTime).toBe(0);
  });
});

describe('E. break/removal without resurrection (260)', () => {
  it('removeBrewing returns contents once; re-persisted emptiness never restores', () => {
    const rig = makeRig();
    rig.host.placeBrewing(X, Y, Z);
    rig.host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: awkwardBottleSlot(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
    });
    const removed = rig.host.removeBrewing(X, Y, Z);
    expect(removed?.bottle.item).toBe(POTION_BOTTLE_ITEM);
    expect(rig.host.removeBrewing(X, Y, Z)).toBeNull();
    // The removal re-persisted an empty chunk snapshot.
    const snapshot = rig.host.serializeChunkForSave(0, -1);
    expect(snapshot).toHaveLength(0);
    const rig2 = makeRig();
    expect(rig2.host.hydrate(snapshot)).toEqual({ hydrated: 0, quarantined: 0 });
    expect(rig2.host.hasBrewing(X, Y, Z)).toBe(false);
  });
});

describe('F. registry conversion round-trip (260)', () => {
  it('a real componented inventory stack survives menu conversion both ways', () => {
    const contents = createPotionContents({
      base: AWKWARD_BASE,
      customEffects: [{ typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 }],
    });
    const stack = {
      id: registry.getByKey('potion')!.id,
      count: 1,
      components: new StackComponentMap(componentRegistry).with(POTION_CONTENTS_COMPONENT, contents as never),
    };
    const menuSlot = stackToMenuSlot(stack, registry);
    expect(menuSlot.item).toBe(POTION_BOTTLE_ITEM);
    const back = menuSlotToStack(menuSlot, registry);
    expect(back?.id).toBe(stack.id);
    expect(back?.components?.equals(stack.components)).toBe(true);
  });
});

describe('G. stale/quarantine (260)', () => {
  it('a stand whose block vanished is dropped at the next simulating tick', () => {
    const rig = makeRig();
    rig.host.placeBrewing(X, Y, Z);
    rig.world.setBlock(X, Y, Z, 0);
    tick(rig, 1);
    expect(rig.host.hasBrewing(X, Y, Z)).toBe(false);
  });

  it('a corrupt brewing payload quarantines without touching a valid neighbor', () => {
    const rig = makeRig();
    rig.host.placeBrewing(X, Y, Z);
    const good = {
      schemaVersion: 1,
      typeKey: 'brewing_stand',
      x: X + 1,
      y: Y,
      z: Z,
      data: serializeBrewingState(createBrewingState()),
    };
    const bad = { schemaVersion: 1, typeKey: 'brewing_stand', x: X + 2, y: Y, z: Z, data: { bottle: null } };
    expect(rig.host.hydrate([good, bad] as never)).toEqual({ hydrated: 1, quarantined: 1 });
    expect(rig.host.hasBrewing(X + 1, Y, Z)).toBe(true);
    expect(rig.host.hasBrewing(X + 2, Y, Z)).toBe(false);
  });
});

describe('H. brewing and furnace stores stay independent (260)', () => {
  it('ticks, hydration, and size compose across both types', () => {
    const rig = makeRig();
    rig.host.placeBrewing(X, Y, Z);
    rig.world.setBlock(X + 1, Y, Z, 20);
    expect(rig.host.placeFurnace(X + 1, Y, Z)).toBe(true);
    expect(rig.host.size).toBe(2);
    expect(rig.host.hasBrewing(X + 1, Y, Z)).toBe(false);
    expect(rig.host.has(X, Y, Z)).toBe(false); // has() stays furnace-only
    tick(rig, 5); // empty brewing stand: no observable change, no crash
    expect(rig.host.size).toBe(2);
  });
});
