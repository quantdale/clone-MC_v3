import { describe, it, expect } from 'vitest';
import {
  NETHER_DIMENSION_TYPE,
  OVERWORLD_DIMENSION_TYPE,
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

describe('overworld dimension type', () => {
  it('matches vanilla 1.18+ bounds and rules', () => {
    expect(resourceIdToString(OVERWORLD_DIMENSION_TYPE.id)).toBe('minecraft:overworld');
    expect(OVERWORLD_DIMENSION_TYPE.minY).toBe(-64);
    expect(OVERWORLD_DIMENSION_TYPE.height).toBe(384);
    expect(OVERWORLD_DIMENSION_TYPE.logicalHeight).toBe(384);
    expect(OVERWORLD_DIMENSION_TYPE.sectionCount).toBe(24); // ceil(384/16)
    expect(OVERWORLD_DIMENSION_TYPE.hasSkylight).toBe(true);
    expect(OVERWORLD_DIMENSION_TYPE.ultrawarm).toBe(false);
    expect(OVERWORLD_DIMENSION_TYPE.natural).toBe(true);
    expect(OVERWORLD_DIMENSION_TYPE.fixedTime).toBeNull();
    expect(OVERWORLD_DIMENSION_TYPE.containsY(-64)).toBe(true);
    expect(OVERWORLD_DIMENSION_TYPE.containsY(319)).toBe(true);
    expect(OVERWORLD_DIMENSION_TYPE.containsY(320)).toBe(false);
  });
});

describe('nether dimension type', () => {
  it('matches vanilla Nether bounds, ambient rules, and fixed time', () => {
    expect(resourceIdToString(NETHER_DIMENSION_TYPE.id)).toBe('minecraft:the_nether');
    expect(NETHER_DIMENSION_TYPE.minY).toBe(0);
    expect(NETHER_DIMENSION_TYPE.height).toBe(256);
    expect(NETHER_DIMENSION_TYPE.logicalHeight).toBe(256);
    expect(NETHER_DIMENSION_TYPE.sectionCount).toBe(16); // ceil(256/16)
    expect(NETHER_DIMENSION_TYPE.hasSkylight).toBe(false);
    expect(NETHER_DIMENSION_TYPE.ultrawarm).toBe(true);
    expect(NETHER_DIMENSION_TYPE.natural).toBe(false);
    expect(NETHER_DIMENSION_TYPE.fixedTime).toBe(18000); // noon lock
    expect(NETHER_DIMENSION_TYPE.containsY(0)).toBe(true);
    expect(NETHER_DIMENSION_TYPE.containsY(255)).toBe(true);
    expect(NETHER_DIMENSION_TYPE.containsY(256)).toBe(false);
    expect(NETHER_DIMENSION_TYPE.containsY(-1)).toBe(false);
  });

  it('registers through the dimension manager under its key with a fresh queue', () => {
    const manager = new DimensionManager();
    manager.registerDimension(NETHER_DIMENSION_TYPE, makeFakeWorld());
    expect(manager.hasDimension('minecraft:the_nether')).toBe(true);
    const loaded = manager.getDimension('minecraft:the_nether')!;
    expect(loaded.type).toBe(NETHER_DIMENSION_TYPE);
    expect(loaded.tickQueue.size).toBe(0);
    expect(manager.tickAll(0).get('minecraft:the_nether')).toEqual([]);
  });
});

describe('dimensionSaveNamespace', () => {
  it('returns a legal full resource id unchanged', () => {
    expect(dimensionSaveNamespace('minecraft:overworld')).toBe('minecraft:overworld');
    expect(dimensionSaveNamespace('minecraft:the_nether')).toBe('minecraft:the_nether');
  });

  it('rejects malformed keys with INVALID_ID', () => {
    expect(() => dimensionSaveNamespace('')).toThrow(/INVALID_ID/);
    expect(() => dimensionSaveNamespace('Bad Key')).toThrow(/INVALID_ID/);
    expect(() => dimensionSaveNamespace('minecraft:')).toThrow(/INVALID_ID/);
    expect(() => dimensionSaveNamespace('the_nether')).toThrow(/INVALID_ID/); // no namespace part
  });
});
