import { describe, it, expect } from 'vitest';
import {
  AWKWARD_BASE,
  BLAZE_POWDER_ITEM,
  DEFAULT_BREW_TICKS,
  GUNPOWDER_ITEM,
  NETHER_WART_ITEM,
  POTION_BOTTLE_ITEM,
  REDSTONE_ITEM,
  WATER_BASE,
  createDefaultBrewingContext,
} from '../../src/inventory/BrewingRecipes';
import {
  POTION_CONTENTS_KEY,
  createBrewingState,
  deserializeBrewingState,
  serializeBrewingState,
  tickBrewing,
  type BrewingState,
} from '../../src/world/BrewingStandBlockEntity';
import {
  POTION_CONTENTS_COMPONENT,
  createPotionContents,
  potionContentsComponentType,
  type PotionContents,
} from '../../src/data/PotionItemData';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';
import { createWaterBottleContents } from '../../src/simulation/BottleFilling';
import { Inventory } from '../../src/inventory/Inventory';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';
import { StackComponentMap, createDefaultStackComponentRegistry } from '../../src/inventory/StackDataComponents';

/**
 * Base-only potion contents (298, legacy alignment of the 122/123 rule):
 * empty customEffects are valid iff a non-empty base is named (vanilla water /
 * awkward / mundane), so the real water + nether wart brew completes to an
 * awkward potion and the chain continues through redstone and gunpowder with
 * no seam. Contents with neither effects nor base stay invalid.
 */

const CTX = createDefaultBrewingContext();
const SPEED = { typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 };

function slot(item: string | null, count: number): MenuSlot {
  return { item, count, maxStack: 64 };
}

function waterBottleSlot(): MenuSlot {
  return { item: POTION_BOTTLE_ITEM, count: 1, maxStack: 64, components: { [POTION_CONTENTS_KEY]: createWaterBottleContents() } };
}

function contentsOf(state: BrewingState): PotionContents {
  return state.bottle.components?.[POTION_CONTENTS_KEY] as PotionContents;
}

describe('base-only potion contents (298)', () => {
  it('empty effects are valid with a non-empty base (factory and read guard)', () => {
    for (const base of [WATER_BASE, AWKWARD_BASE, 'minecraft:potion/mundane']) {
      const c = createPotionContents({ base, customEffects: [] });
      expect(c).toEqual({ base, kind: 'NORMAL', customEffects: [] });
      expect(potionContentsComponentType.validate(c)).toBe(true);
    }
    expect(potionContentsComponentType.validate({ base: WATER_BASE, kind: 'SPLASH', customEffects: [] })).toBe(true);
  });

  it('no base and no effects stays invalid (the 122/123 no-op guard)', () => {
    expect(() => createPotionContents({ customEffects: [] })).toThrow(/unless base/);
    expect(() => createPotionContents({ base: '', customEffects: [] })).toThrow();
    expect(potionContentsComponentType.validate({ kind: 'NORMAL', customEffects: [] })).toBe(false);
    expect(potionContentsComponentType.validate({ base: '', kind: 'NORMAL', customEffects: [] })).toBe(false);
    expect(potionContentsComponentType.validate({ base: 7, kind: 'NORMAL', customEffects: [] })).toBe(false);
    expect(potionContentsComponentType.validate({ base: WATER_BASE, kind: 'NORMAL' })).toBe(false);
  });

  it('effects rules are unchanged (duplicates, negative amplifiers)', () => {
    expect(() => createPotionContents({ base: WATER_BASE, customEffects: [SPEED, SPEED] })).toThrow(/duplicate/);
    expect(potionContentsComponentType.validate({ base: WATER_BASE, kind: 'NORMAL', customEffects: [{ ...SPEED, amplifier: -1 }] })).toBe(false);
  });
});

describe('seamless brewing chain from a water bottle (298)', () => {
  it('water + nether wart → awkward (base-only) after exactly 400 ticks on blaze powder', () => {
    const start: BrewingState = {
      ...createBrewingState(),
      bottle: waterBottleSlot(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(NETHER_WART_ITEM, 1),
    };
    const almost = tickBrewing(start, CTX, DEFAULT_BREW_TICKS - 1);
    expect(contentsOf(almost).base).toBe(WATER_BASE);
    const done = tickBrewing(almost, CTX, 1);
    expect(contentsOf(done)).toEqual({ base: AWKWARD_BASE, kind: 'NORMAL', customEffects: [] });
    expect(done.ingredient.count).toBe(0);
    expect(done.brewTime).toBe(0);
  });

  it('continues awkward → speed (redstone) → splash speed (gunpowder) on one blaze powder', () => {
    let state: BrewingState = {
      ...createBrewingState(),
      bottle: waterBottleSlot(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(NETHER_WART_ITEM, 1),
    };
    state = tickBrewing(state, CTX, DEFAULT_BREW_TICKS);
    state = tickBrewing({ ...state, ingredient: slot(REDSTONE_ITEM, 1) }, CTX, DEFAULT_BREW_TICKS);
    expect(contentsOf(state)).toEqual({ base: AWKWARD_BASE, kind: 'NORMAL', customEffects: [SPEED] });
    state = tickBrewing({ ...state, ingredient: slot(GUNPOWDER_ITEM, 1) }, CTX, DEFAULT_BREW_TICKS);
    expect(contentsOf(state)).toEqual({ base: AWKWARD_BASE, kind: 'SPLASH', customEffects: [SPEED] });
    expect(state.fuel.count).toBe(0);
  });

  it('water + gunpowder → splash water bottle (vanilla), still base-only', () => {
    const done = tickBrewing(
      { ...createBrewingState(), bottle: waterBottleSlot(), fuel: slot(BLAZE_POWDER_ITEM, 1), ingredient: slot(GUNPOWDER_ITEM, 1) },
      CTX,
      DEFAULT_BREW_TICKS,
    );
    expect(contentsOf(done)).toEqual({ base: WATER_BASE, kind: 'SPLASH', customEffects: [] });
  });

  it('water + redstone has no recipe (no fuel lit, nothing consumed)', () => {
    const start: BrewingState = {
      ...createBrewingState(),
      bottle: waterBottleSlot(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
    };
    expect(tickBrewing(start, CTX, 10)).toEqual(start);
  });

  it('a mid-brew water bottle round-trips through the envelope and finishes identically', () => {
    const mid = tickBrewing(
      { ...createBrewingState(), bottle: waterBottleSlot(), fuel: slot(BLAZE_POWDER_ITEM, 1), ingredient: slot(NETHER_WART_ITEM, 1) },
      CTX,
      123,
    );
    const restored = deserializeBrewingState(JSON.parse(JSON.stringify(serializeBrewingState(mid))));
    expect(restored).toEqual(mid);
    expect(tickBrewing(restored, CTX, DEFAULT_BREW_TICKS - 123)).toEqual(tickBrewing(mid, CTX, DEFAULT_BREW_TICKS - 123));
  });
});

describe('water bottles and glass bottles persist in the inventory snapshot (298/289)', () => {
  it('round-trips a water bottle stack with its base-only contents and plain glass bottles', () => {
    const registry = createDefaultItemRegistry();
    const inv = new Inventory([ItemId.Grass, ItemId.Grass, ItemId.Grass], [0, 0, 0], [], registry);
    const water = new StackComponentMap(createDefaultStackComponentRegistry()).with(
      POTION_CONTENTS_COMPONENT,
      createWaterBottleContents() as never,
    );
    inv.slots[0] = { id: ItemId.Potion, count: 1, components: water };
    inv.addItem(ItemId.GlassBottle, 5);
    const snapshot = JSON.parse(JSON.stringify(inv.snapshot()));
    const restored = new Inventory([], [], [], registry);
    expect(restored.restore(snapshot, (id) => registry.has(id), (id) => registry.getByLegacyId(id)?.maxDurability ?? 0)).toBe(true);
    expect(restored.slots[0]!.id).toBe(ItemId.Potion);
    expect(restored.slots[0]!.components?.get(POTION_CONTENTS_COMPONENT)).toEqual({
      base: WATER_BASE,
      kind: 'NORMAL',
      customEffects: [],
    });
    expect(restored.getItemCount(ItemId.GlassBottle)).toBe(5);
  });
});
