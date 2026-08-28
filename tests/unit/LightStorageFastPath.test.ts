import { describe, it, expect } from 'vitest';
import {
  SectionLightStorage,
  WorldLightStorage,
} from '../../src/rendering/LightStorage';
import { localIndex } from '../../src/math/SectionCoordinate';

/**
 * Change 254 R3/R4: numeric section-cache transparency and allocation-free
 * section indexing with identical validation and layout semantics.
 */

describe('WorldLightStorage numeric cache (254 R3)', () => {
  it('cache does not resurrect deleted sections across repeated reads', () => {
    const storage = new WorldLightStorage();
    storage.setSkyLight(1, 70, 1, 9);
    expect(storage.getSkyLight(1, 70, 1)).toBe(9);
    // Warm the one-entry cache on this exact section.
    expect(storage.getSkyLight(2, 70, 2)).toBe(0);
    storage.deleteSection(0, 4, 0);
    expect(storage.getSkyLight(1, 70, 1)).toBe(0);
    expect(storage.getSkyLight(1, 70, 1)).toBe(0);
    expect(storage.getBlockLight(1, 70, 1)).toBe(0);
  });

  it('clear empties everything; restore repopulates with identical values', () => {
    const storage = new WorldLightStorage();
    storage.setSkyLight(5, 66, 7, 11);
    storage.setBlockLight(5, 66, 7, 4);
    const snapshot = storage.snapshot();
    storage.clear();
    expect(storage.getSkyLight(5, 66, 7)).toBe(0);
    storage.restore(snapshot);
    expect(storage.getSkyLight(5, 66, 7)).toBe(11);
    expect(storage.getBlockLight(5, 66, 7)).toBe(4);
  });

  it('missing sections read zero without creating them', () => {
    const storage = new WorldLightStorage();
    expect(storage.getSkyLight(100, -40, 100)).toBe(0);
    expect(storage.size).toBe(0);
  });

  it('malformed world coordinates throw the documented RangeError', () => {
    const storage = new WorldLightStorage();
    expect(() => storage.getSkyLight(1.5, 0, 0)).toThrow(RangeError);
    expect(() => storage.getBlockLight(0, 0, NaN)).toThrow(RangeError);
    // Negative world Y is legal section space for this store (keyed numerically).
    storage.setSkyLight(0, -1, 0, 3);
    expect(storage.getSkyLight(0, -1, 0)).toBe(3);
  });
});

describe('SectionLightStorage direct indexing (254 R4)', () => {
  it('layout matches x + y*16 + z*256 at the corners', () => {
    const s = new SectionLightStorage();
    s.setSkyLight(0, 0, 0, 15);
    s.setBlockLight(15, 15, 15, 8);
    s.setSkyLight(0, 15, 7, 5);

    const sky = s.serialize().sky;
    const block = s.serialize().block;
    // Cell 0 low nibble = 15.
    expect(sky[localIndex(0, 0, 0) >> 1]! & 0x0f).toBe(15);
    // Odd cell (index 4095) high nibble = 8.
    expect(block[localIndex(15, 15, 15) >> 1]! >> 4).toBe(8 & 0x0f);
    expect(sky[localIndex(0, 15, 7) >> 1]! & 0x0f).toBe(5);
    expect(s.getSkyLight(15, 15, 15)).toBe(0);
  });

  it('rejects out-of-range and non-integer locals per axis in order', () => {
    const s = new SectionLightStorage();
    expect(() => s.getSkyLight(-1, 0, 0)).toThrow(
      'SectionLightStorage: local coordinates must be in [0, 16): -1',
    );
    expect(() => s.setSkyLight(0, 16, 0, 1)).toThrow(
      'SectionLightStorage: local coordinates must be in [0, 16): 16',
    );
    expect(() => s.getBlockLight(0, 0, 3.5)).toThrow(
      'SectionLightStorage: local coordinates must be in [0, 16): 3.5',
    );
    expect(() => s.setBlockLight(NaN, 0, 0, 1)).toThrow(
      'SectionLightStorage: local coordinates must be in [0, 16): NaN',
    );
  });

  it('nibble value bounds are still enforced through world accessors', () => {
    const world = new WorldLightStorage();
    expect(() => world.setSkyLight(0, 0, 0, 16)).toThrow(/value out of range \[0, 15\]/);
    expect(() => world.setBlockLight(0, 0, 0, -1)).toThrow(/value out of range \[0, 15\]/);
  });
});
