import { describe, expect, it } from 'vitest';
import { createSmokerContext } from '../../src/inventory/SmokerRecipes';
import type { FurnaceContext } from '../../src/world/FurnaceBlockEntity';

const furnace: FurnaceContext = {
  fuelBurnTicks: (item) => (item === 'minecraft:coal' ? 1600 : 0),
  cookTicks: (item) => item === 'minecraft:sand' ? 200 : item === 'minecraft:test' ? 3 : 0,
  resultOf: (item) => item === 'minecraft:sand'
    ? { item: 'minecraft:glass', count: 1 }
    : item === 'minecraft:test'
      ? { item: 'minecraft:cooked_test', count: 2 }
      : null,
  experienceOf: (item) => item === 'minecraft:sand' ? 0.1 : item === 'minecraft:test' ? 0.7 : 0,
};

describe('SmokerRecipes (281)', () => {
  it('halves even durations and rounds odd positive durations upward', () => {
    const smoker = createSmokerContext(furnace);
    expect(smoker.cookTicks('minecraft:sand')).toBe(100);
    expect(smoker.cookTicks('minecraft:test')).toBe(2);
  });

  it('keeps unknown inputs unsmeltable and delegates fuel/result/xp', () => {
    const smoker = createSmokerContext(furnace);
    expect(smoker.cookTicks('minecraft:stone')).toBe(0);
    expect(smoker.resultOf('minecraft:stone')).toBeNull();
    expect(smoker.fuelBurnTicks('minecraft:coal')).toBe(1600);
    expect(smoker.resultOf('minecraft:test')).toEqual({ item: 'minecraft:cooked_test', count: 2 });
    expect(smoker.experienceOf?.('minecraft:test')).toBe(0.7);
  });

  it('never turns a malformed non-finite base duration into a recipe', () => {
    const malformed: FurnaceContext = {
      ...furnace,
      cookTicks: () => Number.NaN,
    };
    expect(createSmokerContext(malformed).cookTicks('minecraft:bad')).toBe(0);
  });
});
