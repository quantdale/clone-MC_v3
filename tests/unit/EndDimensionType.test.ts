import { describe, it, expect } from 'vitest';
import {
  END_DIMENSION_TYPE,
  dimensionSaveNamespace,
} from '../../src/data/DimensionTypes';
import { resourceIdToString } from '../../src/data/ResourceId';
import { DimensionManager } from '../../src/world/DimensionManager';
import type { WorldAccess } from '../../src/world/WorldAccess';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function makeFakeWorld(): WorldAccess {
  const store = new Map<string, number>();
  return {
    getBlock(x, y, z) {
      return store.get(key(x, y, z)) ?? 0;
    },
    setBlock(x, y, z, id) {
      store.set(key(x, y, z), id);
    },
    isSolid(x, y, z) {
      return (store.get(key(x, y, z)) ?? 0) !== 0;
    },
  };
}

describe('end dimension type', () => {
  it('matches vanilla End bounds, ambient rules, and fixed time', () => {
    expect(resourceIdToString(END_DIMENSION_TYPE.id)).toBe('minecraft:the_end');
    expect(END_DIMENSION_TYPE.minY).toBe(0);
    expect(END_DIMENSION_TYPE.height).toBe(256);
    expect(END_DIMENSION_TYPE.logicalHeight).toBe(256);
    expect(END_DIMENSION_TYPE.sectionCount).toBe(16); // ceil(256/16)
    expect(END_DIMENSION_TYPE.hasSkylight).toBe(false);
    expect(END_DIMENSION_TYPE.ultrawarm).toBe(false);
    expect(END_DIMENSION_TYPE.natural).toBe(false);
    expect(END_DIMENSION_TYPE.fixedTime).toBe(6000); // the End's perpetual dawn lock
    expect(END_DIMENSION_TYPE.containsY(0)).toBe(true);
    expect(END_DIMENSION_TYPE.containsY(255)).toBe(true);
    expect(END_DIMENSION_TYPE.containsY(256)).toBe(false);
    expect(END_DIMENSION_TYPE.containsY(-1)).toBe(false);
  });

  it('registers through the dimension manager under its key with a fresh queue', () => {
    const manager = new DimensionManager();
    manager.registerDimension(END_DIMENSION_TYPE, makeFakeWorld());
    expect(manager.hasDimension('minecraft:the_end')).toBe(true);
    const loaded = manager.getDimension('minecraft:the_end')!;
    expect(loaded.type).toBe(END_DIMENSION_TYPE);
    expect(loaded.tickQueue.size).toBe(0);
    expect(manager.tickAll(0).get('minecraft:the_end')).toEqual([]);
  });

  it('passes the save-namespace validation for its key', () => {
    expect(dimensionSaveNamespace('minecraft:the_end')).toBe('minecraft:the_end');
  });
});
