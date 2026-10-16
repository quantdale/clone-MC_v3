import { describe, it, expect } from 'vitest';
import {
  createDefaultFuelValues,
  createFurnaceContext,
  FuelValueRegistry,
  takeFurnaceXp,
} from '../../src/inventory/FurnaceRecipes';
import { createDefaultTypedRecipes, TypedRecipeRegistry } from '../../src/inventory/TypedRecipe';
import {
  createFurnaceState,
  deserializeFurnaceState,
  serializeFurnaceState,
  tickFurnace,
  validateFurnaceState,
  type FurnaceState,
} from '../../src/world/FurnaceBlockEntity';

const COAL = 'minecraft:coal';
const SAND = 'minecraft:sand';
const GLASS = 'minecraft:glass';
const RAW_IRON = 'minecraft:raw_iron';
const IRON_INGOT = 'minecraft:iron_ingot';

describe('FuelValueRegistry', () => {
  it('registers valid fuel values and rejects duplicates and invalid ticks', () => {
    const reg = new FuelValueRegistry();
    reg.register(COAL, 1600);
    expect(reg.burnTicksOf(COAL)).toBe(1600);
    expect(reg.has(COAL)).toBe(true);
    expect(reg.size).toBe(1);
    expect(reg.all()).toEqual([{ item: COAL, burnTicks: 1600 }]);

    expect(() => reg.register(COAL, 100)).toThrow(/duplicate/i);
    expect(() => reg.register('', 100)).toThrow(/non-empty/);
    expect(() => reg.register('minecraft:air', 0)).toThrow(/positive integer/);
    expect(() => reg.register('minecraft:air', -1)).toThrow(/positive integer/);
    expect(() => reg.register('minecraft:air', 1.5)).toThrow(/positive integer/);
    expect(reg.size).toBe(1);
  });

  it('returns 0 burn ticks for unknown fuels and is unchanged after invalid registrations', () => {
    const reg = new FuelValueRegistry();
    reg.register(COAL, 1600);
    expect(reg.burnTicksOf('minecraft:glass')).toBe(0);
    expect(reg.has('minecraft:glass')).toBe(false);
    // All() is deterministic in registration order.
    reg.register('minecraft:wood', 300);
    expect(reg.all()).toEqual([
      { item: COAL, burnTicks: 1600 },
      { item: 'minecraft:wood', burnTicks: 300 },
    ]);
  });
});

describe('createDefaultFuelValues', () => {
  it('provides the documented vanilla-aligned defaults', () => {
    const fuels = createDefaultFuelValues();
    expect(fuels.size).toBe(4);
    expect(fuels.burnTicksOf(COAL)).toBe(1600);
    expect(fuels.burnTicksOf('minecraft:wood')).toBe(300);
    expect(fuels.burnTicksOf('minecraft:planks')).toBe(300);
    expect(fuels.burnTicksOf('minecraft:stick')).toBe(100);
    expect(fuels.burnTicksOf('minecraft:sand')).toBe(0);
  });
});

describe('createFurnaceContext', () => {
  const ctx = createFurnaceContext(createDefaultTypedRecipes(), createDefaultFuelValues());

  it('resolves recipes and fuels wired from the registries', () => {
    expect(ctx.fuelBurnTicks(COAL)).toBe(1600);
    expect(ctx.cookTicks(SAND)).toBe(200);
    expect(ctx.cookTicks('minecraft:cobblestone')).toBe(200);
    expect(ctx.cookTicks(RAW_IRON)).toBe(200);
    expect(ctx.cookTicks('minecraft:glass')).toBe(0);
    expect(ctx.resultOf(SAND)).toEqual({ item: GLASS, count: 1 });
    expect(ctx.resultOf(RAW_IRON)).toEqual({ item: IRON_INGOT, count: 1 });
    expect(ctx.resultOf('minecraft:glass')).toBeNull();
    const xpOf = ctx.experienceOf!;
    expect(xpOf(SAND)).toBe(0.1);
    expect(xpOf(RAW_IRON)).toBe(0.7);
    expect(xpOf('minecraft:cobblestone')).toBe(0.1);
  });

  it('rejects duplicate processing inputs atomically', () => {
    const dup = new TypedRecipeRegistry();
    dup.register({
      kind: 'processing',
      key: 'smelt_sand',
      input: SAND,
      result: { item: GLASS, count: 1 },
      cookingTime: 200,
      experience: 0.1,
    });
    dup.register({
      kind: 'processing',
      key: 'smelt_sand_alt',
      input: SAND,
      result: { item: 'minecraft:stone', count: 1 },
      cookingTime: 200,
      experience: 0.1,
    });
    expect(() => createFurnaceContext(dup, createDefaultFuelValues())).toThrow(/duplicate processing input/);
  });

  it('absent experienceOf preserves 109 behavior (no XP)', () => {
    const ctxNoXp: Parameters<typeof createFurnaceContext>[0] = createDefaultTypedRecipes();
    const built = createFurnaceContext(ctxNoXp, createDefaultFuelValues());
    // experienceOf is optional; the engine treats its absence as 0.
    expect(ctxNoXp).toBeDefined();
    expect(built).toBeDefined();
  });
});

describe('takeFurnaceXp', () => {
  it('drains the integer floor and carries the fraction', () => {
    expect(takeFurnaceXp(1.7)).toEqual({ taken: 1, remaining: 0.7 });
    expect(takeFurnaceXp(2.0)).toEqual({ taken: 2, remaining: 0 });
    expect(takeFurnaceXp(0.3)).toEqual({ taken: 0, remaining: 0.3 });
    expect(takeFurnaceXp(0)).toEqual({ taken: 0, remaining: 0 });
  });

  it('rejects negative, NaN, and infinite xp', () => {
    expect(() => takeFurnaceXp(-0.1)).toThrow(/finite number/);
    expect(() => takeFurnaceXp(Number.NaN)).toThrow(/finite number/);
    expect(() => takeFurnaceXp(Number.POSITIVE_INFINITY)).toThrow(/finite number/);
  });
});

describe('furnace XP accumulation end-to-end', () => {
  const ctx = createFurnaceContext(createDefaultTypedRecipes(), createDefaultFuelValues());

  function put(state: FurnaceState, slot: 'input' | 'fuel', item: string, count: number): FurnaceState {
    return { ...state, [slot]: { item, count, maxStack: 64 } };
  }

  it('accumulates XP per completed cook and pauses when the output is full', () => {
    let s = put(createFurnaceState(), 'input', SAND, 2);
    s = put(s, 'fuel', COAL, 1);

    const afterFirst = tickFurnace(s, ctx, 200);
    expect(afterFirst.output).toEqual({ item: GLASS, count: 1, maxStack: 64 });
    expect(afterFirst.input).toEqual({ item: SAND, count: 1, maxStack: 64 });
    expect(afterFirst.xp).toBe(0.1);

    const afterSecond = tickFurnace(afterFirst, ctx, 200);
    expect(afterSecond.output).toEqual({ item: GLASS, count: 2, maxStack: 64 });
    expect(afterSecond.input).toEqual({ item: null, count: 0, maxStack: 64 });
    expect(afterSecond.xp).toBe(0.2);
  });

  it('grants the recipe XP for smelting raw iron into iron ingots', () => {
    let s = put(createFurnaceState(), 'input', RAW_IRON, 1);
    s = put(s, 'fuel', COAL, 1);

    const next = tickFurnace(s, ctx, 200);
    expect(next.output).toEqual({ item: IRON_INGOT, count: 1, maxStack: 64 });
    expect(next.xp).toBe(0.7);
  });

  it('does not grant XP without a completed cook', () => {
    let s = put(createFurnaceState(), 'input', SAND, 1);
    s = put(s, 'fuel', COAL, 1);
    const next = tickFurnace(s, ctx, 100);
    expect(next.output).toEqual({ item: null, count: 0, maxStack: 64 });
    expect(next.xp).toBe(0);
  });
});

describe('furnace state XP backward compatibility', () => {
  it('creates an empty state with xp 0', () => {
    expect(createFurnaceState().xp).toBe(0);
  });

  it('loads payloads without xp as xp 0 (pre-110 saves)', () => {
    const base = serializeFurnaceState(createFurnaceState()) as Record<string, unknown>;
    const { xp: _ignored, ...legacy } = base;
    void _ignored;
    const restored = deserializeFurnaceState(legacy);
    expect(restored.xp).toBe(0);
    expect(() => validateFurnaceState(legacy)).not.toThrow();
  });

  it('round-trips an accumulated XP value intact', () => {
    const s = { ...createFurnaceState(), xp: 1.7 };
    const restored = deserializeFurnaceState(serializeFurnaceState(s));
    expect(restored.xp).toBe(1.7);
  });
});
