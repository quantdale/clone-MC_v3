import { describe, it, expect } from "vitest";
import {
  createBrewingState,
  createBrewingStandBlockEntity,
  deserializeBrewingState,
  readBottleContents,
  serializeBrewingState,
  tickBrewing,
  validateBrewingState,
  brewingIsLit,
  brewingBrewProgress,
  brewingFuelFraction,
  readBrewingState,
  updateBrewingState,
  BREWING_STAND_TYPE_KEY,
  POTION_CONTENTS_KEY,
  type BrewingState,
} from "../../src/world/BrewingStandBlockEntity";
import { BlockEntityInstance } from "../../src/simulation/BlockEntityManager";
import {
  createDefaultBrewingContext,
  BLAZE_POWDER_ITEM,
  POTION_BOTTLE_ITEM,
  WATER_BASE,
  AWKWARD_BASE,
  NETHER_WART_ITEM,
  REDSTONE_ITEM,
  GLOWSTONE_ITEM,
} from "../../src/inventory/BrewingRecipes";
import { createPotionContents } from "../../src/data/PotionItemData";
import type { MenuSlot } from "../../src/inventory/MenuTransaction";

const ctx = createDefaultBrewingContext();

function potionBottle(
  base: string | undefined,
  effects: { typeId: string; duration: number; amplifier: number }[],
): MenuSlot {
  return {
    item: POTION_BOTTLE_ITEM,
    count: 1,
    maxStack: 64,
    components: {
      [POTION_CONTENTS_KEY]: createPotionContents({
        base,
        customEffects: effects,
      }),
    },
  };
}

function slot(item: string | null, count: number, maxStack = 64): MenuSlot {
  return { item, count, maxStack };
}

function waterBottle(): MenuSlot {
  // 122 requires at least one effect; carry a benign zeroed placeholder so the bottle is valid.
  return potionBottle(WATER_BASE, [
    { typeId: "minecraft:effect/water", duration: 0, amplifier: 0 },
  ]);
}

function awkwardBottle(): MenuSlot {
  return potionBottle(AWKWARD_BASE, [
    { typeId: "minecraft:effect/speed", duration: 0, amplifier: 0 },
  ]);
}

describe("createBrewingState / validateBrewingState", () => {
  it("builds an empty state with a placeholder bottle and zero timers", () => {
    const s = createBrewingState();
    expect(s.bottle).toEqual({ item: null, count: 0, maxStack: 64 });
    expect(s.fuel).toEqual(slot(null, 0));
    expect([
      s.brewTime,
      s.brewTimeTotal,
      s.fuelBurnTime,
      s.fuelBurnTimeTotal,
    ]).toEqual([0, 0, 0, 0]);
  });

  it("rejects brewTime over total and negative timers", () => {
    const base = createBrewingState();
    expect(() =>
      validateBrewingState({ ...base, brewTime: 1, brewTimeTotal: 0 }),
    ).toThrow(/brewTimeTotal 0/);
    expect(() =>
      validateBrewingState({ ...base, brewTime: 5, brewTimeTotal: 4 }),
    ).toThrow(/brewTime must not exceed/);
    expect(() =>
      validateBrewingState({ ...base, fuelBurnTime: 5, fuelBurnTimeTotal: 4 }),
    ).toThrow(/fuelBurnTime must not exceed/);
    expect(() => validateBrewingState({ ...base, brewTime: -1 })).toThrow(
      /non-negative integer/,
    );
  });

  it("rejects a malformed bottle components map", () => {
    const bad = createBrewingState();
    expect(() =>
      validateBrewingState({
        ...bad,
        bottle: {
          item: POTION_BOTTLE_ITEM,
          count: 1,
          maxStack: 64,
          components: [] as unknown as Record<string, unknown>,
        },
      }),
    ).toThrow(/components must be an object/);
  });
});

describe("readBottleContents", () => {
  it("reads a valid potion and returns its base", () => {
    const b = awkwardBottle();
    const read = readBottleContents(b);
    expect(read).not.toBeNull();
    expect(read!.base).toBe(AWKWARD_BASE);
  });

  it("returns null when the bottle has no item or no valid potion_contents", () => {
    expect(readBottleContents(slot(null, 0))).toBeNull();
    expect(readBottleContents(slot(POTION_BOTTLE_ITEM, 1))).toBeNull();
    expect(
      readBottleContents({
        item: POTION_BOTTLE_ITEM,
        count: 1,
        maxStack: 64,
        components: {
          [POTION_CONTENTS_KEY]: { kind: "NORMAL", customEffects: [] },
        },
      }),
    ).toBeNull();
  });
});

describe("tickBrewing: fuel gating", () => {
  it("lights the fuel when a brew is possible and consumes one fuel", () => {
    const s: BrewingState = {
      bottle: waterBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(NETHER_WART_ITEM, 1),
      brewTime: 0,
      brewTimeTotal: 0,
      fuelBurnTime: 0,
      fuelBurnTimeTotal: 0,
    };
    const next = tickBrewing(s, ctx, 1);
    expect(next.fuel).toEqual(slot(null, 0));
    expect(next.fuelBurnTime).toBe(1199); // 1200 - 1 (lit + burned)
    expect(next.fuelBurnTimeTotal).toBe(1200);
    expect(brewingIsLit(next)).toBe(true);
  });

  it("does not consume fuel when no recipe applies", () => {
    const s: BrewingState = {
      bottle: waterBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(GLOWSTONE_ITEM, 1), // water + glowstone has no recipe
      brewTime: 0,
      brewTimeTotal: 0,
      fuelBurnTime: 0,
      fuelBurnTimeTotal: 0,
    };
    const next = tickBrewing(s, ctx, 1);
    expect(next.fuel).toEqual(slot(BLAZE_POWDER_ITEM, 1));
    expect(next.fuelBurnTime).toBe(0);
  });
});

describe("tickBrewing: brew completion (modifier)", () => {
  it("brews the modifier into the bottle, consumes one ingredient, and resets timers", () => {
    const s: BrewingState = {
      bottle: awkwardBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
      brewTime: 0,
      brewTimeTotal: 0,
      fuelBurnTime: 0,
      fuelBurnTimeTotal: 0,
    };
    const next = tickBrewing(s, ctx, 400);
    const read = readBottleContents(next.bottle);
    expect(read).not.toBeNull();
    expect(read!.base).toBe(AWKWARD_BASE); // base unchanged by the modifier
    expect(read!.contents.customEffects).toEqual([
      { typeId: "minecraft:effect/speed", duration: 480, amplifier: 1 },
    ]);
    expect(next.ingredient).toEqual(slot(null, 0)); // one consumed
    expect(next.brewTime).toBe(0);
    expect(next.brewTimeTotal).toBe(0);
  });
});

describe("tickBrewing: safe pause", () => {
  it("pauses without throwing when the bottle slot is empty", () => {
    const s: BrewingState = {
      bottle: slot(null, 0),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
      brewTime: 0,
      brewTimeTotal: 0,
      fuelBurnTime: 10,
      fuelBurnTimeTotal: 10,
    };
    const next = tickBrewing(s, ctx, 1);
    expect(next.bottle).toEqual(slot(null, 0));
    expect(next.ingredient).toEqual(slot(REDSTONE_ITEM, 1));
    expect(next.fuelBurnTime).toBe(9); // active fuel still burns down
  });
});

describe("persistence", () => {
  it("round-trips a valid state through serialize / deserialize", () => {
    const s: BrewingState = {
      bottle: awkwardBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 3),
      ingredient: slot(REDSTONE_ITEM, 2),
      brewTime: 100,
      brewTimeTotal: 400,
      fuelBurnTime: 500,
      fuelBurnTimeTotal: 1200,
    };
    const restored = deserializeBrewingState(serializeBrewingState(s));
    expect(restored).toEqual(s);
  });

  it("throws on a malformed payload", () => {
    expect(() => deserializeBrewingState(null)).toThrow(
      /payload must be an object/,
    );
    expect(() => deserializeBrewingState({ bottle: null })).toThrow();
  });
});

describe("block-entity lifecycle", () => {
  it("creates, reads, and updates a brewing-stand instance", () => {
    const instance = createBrewingStandBlockEntity(1, 2, 3);
    expect(instance.typeKey).toBe(BREWING_STAND_TYPE_KEY);
    expect(readBrewingState(instance)).toEqual(createBrewingState());

    const s: BrewingState = {
      ...createBrewingState(),
      bottle: awkwardBottle(),
      ingredient: slot(REDSTONE_ITEM, 1),
    };
    const updated = updateBrewingState(instance, s);
    expect(updated.x).toBe(1);
    expect(readBrewingState(updated)).toEqual(s);
  });

  it("readBrewingState throws on the wrong type key", () => {
    const fake = new BlockEntityInstance({
      typeKey: "furnace",
      x: 0,
      y: 0,
      z: 0,
      data: null,
    });
    expect(() => readBrewingState(fake)).toThrow(/expected typeKey/);
  });
});

describe("progress helpers", () => {
  it("reports brew and fuel fractions", () => {
    const s: BrewingState = {
      bottle: awkwardBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(REDSTONE_ITEM, 1),
      brewTime: 200,
      brewTimeTotal: 400,
      fuelBurnTime: 600,
      fuelBurnTimeTotal: 1200,
    };
    expect(brewingBrewProgress(s)).toBeCloseTo(0.5);
    expect(brewingFuelFraction(s)).toBeCloseTo(0.5);
    expect(brewingBrewProgress(createBrewingState())).toBe(0);
    expect(brewingFuelFraction(createBrewingState())).toBe(0);
  });
});

// ── Brewing menu coverage (verification campaign) ───────────────────────────

import {
  createBrewingMenu,
  applyBrewingMenuTransaction,
  extractBrewingSlots,
  extractBrewingPlayerSlots,
  BREWING_MENU_SLOT_COUNT,
} from "../../src/world/BrewingStandBlockEntity";
import type { ContainerMenu } from "../../src/inventory/MenuTransaction";

function playerSlots(): MenuSlot[] {
  return Array.from({ length: 36 }, () => slot(null, 0)).map((s, i) =>
    i === 0 ? slot("minecraft:dirt", 5) : s,
  );
}

describe("brewing menu composition", () => {
  it("builds a 39-slot menu with player region starting at 3 and round-trips extraction", () => {
    const state: BrewingState = {
      ...createBrewingState(),
      bottle: waterBottle(),
      fuel: slot(BLAZE_POWDER_ITEM, 2),
      ingredient: slot(NETHER_WART_ITEM, 3),
    };
    const menu = createBrewingMenu(state, playerSlots());

    expect(menu.slots.length).toBe(BREWING_MENU_SLOT_COUNT);
    expect(menu.playerSlotStart).toBe(3);
    expect(menu.cursor).toEqual({ item: null, count: 0 });

    const brewing = extractBrewingSlots(menu);
    expect(brewing.bottle.item).toBe(POTION_BOTTLE_ITEM);
    expect(brewing.fuel.count).toBe(2);
    expect(brewing.ingredient.count).toBe(3);

    const players = extractBrewingPlayerSlots(menu);
    expect(players.length).toBe(36);
    expect(players[0]!.item).toBe("minecraft:dirt");
    // Extraction returns defensive copies.
    players[0]!.count = 99;
    expect(extractBrewingPlayerSlots(menu)[0]!.count).toBe(5);
  });

  it("applies a leftClick transaction immutably (pick up from the ingredient slot)", () => {
    const state: BrewingState = {
      ...createBrewingState(),
      ingredient: slot(NETHER_WART_ITEM, 4),
    };
    const menu = createBrewingMenu(state, playerSlots());
    const next = applyBrewingMenuTransaction(menu, {
      type: "leftClick",
      index: 2,
    });

    expect(next).not.toBe(menu); // new immutable menu
    expect(next.slots[2]).toEqual(slot(null, 0));
    expect(next.cursor).toEqual({ item: NETHER_WART_ITEM, count: 4 });
    // Original untouched.
    expect(menu.slots[2]!.count).toBe(4);
  });

  it("rejects a non-brewing menu in the extract helpers", () => {
    const bad = {
      slots: Array.from({ length: 10 }, () => slot(null, 0)),
      playerSlotStart: 4,
      cursor: { item: null, count: 0 },
    } as unknown as ContainerMenu;
    expect(() => extractBrewingSlots(bad)).toThrow(/not a brewing menu/);
    expect(() => extractBrewingPlayerSlots(bad)).toThrow(/not a brewing menu/);
  });
});
