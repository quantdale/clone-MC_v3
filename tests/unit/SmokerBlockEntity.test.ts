import { describe, expect, it } from 'vitest';
import {
  createFurnaceState,
  type FurnaceState,
} from '../../src/world/FurnaceBlockEntity';
import {
  createSmokerBlockEntity,
  readSmokerState,
  SMOKER_TYPE_KEY,
  updateSmokerState,
} from '../../src/world/SmokerBlockEntity';
import { BlockEntityInstance } from '../../src/simulation/BlockEntityManager';

function state(): FurnaceState {
  return {
    ...createFurnaceState(),
    input: { item: 'minecraft:sand', count: 2, maxStack: 64 },
    fuel: { item: 'minecraft:coal', count: 1, maxStack: 64 },
    burnTime: 8,
    burnTimeTotal: 10,
    smeltTime: 17,
    smeltTimeTotal: 100,
    xp: 0.7,
  };
}

describe('SmokerBlockEntity (281)', () => {
  it('round-trips slots, timers, and fractional XP under the smoker type key', () => {
    const original = state();
    const entity = createSmokerBlockEntity(4, 64, -2, original);
    expect(entity.typeKey).toBe(SMOKER_TYPE_KEY);
    expect(readSmokerState(entity)).toEqual(original);
    expect(readSmokerState(updateSmokerState(entity, original))).toEqual(original);
  });

  it('rejects a furnace entity without mutating the foreign instance', () => {
    const foreign = new BlockEntityInstance({
      typeKey: 'furnace',
      x: 4,
      y: 64,
      z: -2,
      data: { untouched: true },
    });
    expect(() => readSmokerState(foreign)).toThrow(/expected typeKey 'smoker'/);
    expect(foreign.typeKey).toBe('furnace');
    expect(foreign.data).toEqual({ untouched: true });
  });
});
