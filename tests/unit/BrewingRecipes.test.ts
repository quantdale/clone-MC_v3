import { describe, it, expect } from 'vitest';
import {
  createDefaultBrewingContext,
  BLAZE_POWDER_ITEM,
  WATER_BASE,
  AWKWARD_BASE,
  NETHER_WART_ITEM,
  REDSTONE_ITEM,
  GLOWSTONE_ITEM,
  FERMENTED_SPIDER_EYE_ITEM,
  SPEED_REAGENT_ITEM,
  STRENGTH_REAGENT_ITEM,
  HEALING_REAGENT_ITEM,
  DEFAULT_BREW_TICKS,
  BLAZE_POWDER_BURN_TICKS,
} from '../../src/inventory/BrewingRecipes';

describe('createDefaultBrewingContext: recipe matching', () => {
  const ctx = createDefaultBrewingContext();

  it('resolves water + nether_wart to an awkward base with no effects', () => {
    const out = ctx.match(WATER_BASE, NETHER_WART_ITEM);
    expect(out).not.toBeNull();
    expect(out!.base).toBe(AWKWARD_BASE);
    expect(out!.customEffects).toEqual([]);
  });

  it('resolves awkward + redstone to a single extended speed effect', () => {
    const out = ctx.match(AWKWARD_BASE, REDSTONE_ITEM);
    expect(out).not.toBeNull();
    expect(out!.base).toBeUndefined();
    expect(out!.customEffects).toEqual([{ typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 }]);
  });

  it('resolves awkward + glowstone to a stronger (amplifier 2) short speed effect', () => {
    const out = ctx.match(AWKWARD_BASE, GLOWSTONE_ITEM);
    expect(out!.customEffects).toEqual([{ typeId: 'minecraft:effect/speed', duration: 120, amplifier: 2 }]);
  });

  it('resolves awkward + fermented_spider_eye to a mundane base with no effects', () => {
    const out = ctx.match(AWKWARD_BASE, FERMENTED_SPIDER_EYE_ITEM);
    expect(out!.base).toBe('minecraft:potion/mundane');
    expect(out!.customEffects).toEqual([]);
  });

  it('resolves the reagent modifiers', () => {
    expect(ctx.match(AWKWARD_BASE, SPEED_REAGENT_ITEM)!.customEffects).toEqual([
      { typeId: 'minecraft:effect/speed', duration: 180, amplifier: 1 },
    ]);
    expect(ctx.match(AWKWARD_BASE, STRENGTH_REAGENT_ITEM)!.customEffects).toEqual([
      { typeId: 'minecraft:effect/strength', duration: 180, amplifier: 1 },
    ]);
    expect(ctx.match(AWKWARD_BASE, HEALING_REAGENT_ITEM)!.customEffects).toEqual([
      { typeId: 'minecraft:effect/healing', duration: 0, amplifier: 1 },
    ]);
  });

  it('returns null for any unknown (base, ingredient) pair', () => {
    expect(ctx.match(WATER_BASE, GLOWSTONE_ITEM)).toBeNull();
    expect(ctx.match(AWKWARD_BASE, NETHER_WART_ITEM)).toBeNull();
    expect(ctx.match(WATER_BASE, REDSTONE_ITEM)).toBeNull();
    expect(ctx.match('minecraft:potion/mundane', REDSTONE_ITEM)).toBeNull();
    expect(ctx.match(undefined, NETHER_WART_ITEM)).toBeNull();
  });
});

describe('createDefaultBrewingContext: fuel and timing', () => {
  const ctx = createDefaultBrewingContext();

  it('treats blaze powder as fuel with a positive burn value', () => {
    expect(ctx.fuelBurnTicks(BLAZE_POWDER_ITEM)).toBe(BLAZE_POWDER_BURN_TICKS);
    expect(ctx.fuelBurnTicks(BLAZE_POWDER_ITEM)).toBeGreaterThan(0);
  });

  it('returns 0 burn ticks for non-fuels', () => {
    expect(ctx.fuelBurnTicks('minecraft:item/cobblestone')).toBe(0);
    expect(ctx.fuelBurnTicks('minecraft:item/nether_wart')).toBe(0);
  });

  it('returns a fixed positive brew-tick count', () => {
    expect(ctx.brewTicks()).toBe(DEFAULT_BREW_TICKS);
    expect(ctx.brewTicks()).toBeGreaterThan(0);
  });
});
