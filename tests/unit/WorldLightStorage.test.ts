import { describe, it, expect } from 'vitest';
import {
  WorldLightStorage,
  SectionLightStorage,
  borderSliceCell,
  BORDER_SLICE_LENGTH,
} from '../../src/rendering/LightStorage';

describe('WorldLightStorage — section lifecycle', () => {
  it('writing auto-creates the target section', () => {
    const storage = new WorldLightStorage();
    expect(storage.size).toBe(0);
    storage.setSkyLight(5, 3, 7, 9);
    expect(storage.size).toBe(1);
    expect(storage.getSection(0, 0, 0)).toBeInstanceOf(SectionLightStorage);
    expect(storage.getSkyLight(5, 3, 7)).toBe(9);
  });

  it('reads outside any known section default to 0 for both channels', () => {
    const storage = new WorldLightStorage();
    expect(storage.getSkyLight(-33, -5, 100)).toBe(0);
    expect(storage.getBlockLight(16, 0, 0)).toBe(0);
    // A write in one section does not leak into a neighboring section.
    storage.setBlockLight(15, 15, 15, 12);
    expect(storage.getBlockLight(16, 15, 15)).toBe(0);
    expect(storage.getBlockLight(15, 15, 15)).toBe(12);
  });

  it('negative world coordinates route to the correct section', () => {
    const storage = new WorldLightStorage();
    storage.setSkyLight(-1, -17, -16, 6); // sections (-1, -2, -1)
    expect(storage.size).toBe(1);
    expect(storage.getSkyLight(-1, -17, -16)).toBe(6);
    expect(storage.getSkyLight(-16, -17, -16)).toBe(0); // different x section
  });
});

describe('WorldLightStorage — border slices', () => {
  it('documents a deterministic per-face cell layout via borderSliceCell', () => {
    expect(borderSliceCell('west', 0)).toEqual({ x: 0, y: 0, z: 0 });
    expect(borderSliceCell('west', 17)).toEqual({ x: 0, y: 1, z: 1 });
    expect(borderSliceCell('east', 0)).toEqual({ x: 15, y: 0, z: 0 });
    expect(borderSliceCell('down', 18)).toEqual({ x: 2, y: 0, z: 1 });
    expect(borderSliceCell('up', 0)).toEqual({ x: 0, y: 15, z: 0 });
    expect(borderSliceCell('north', 20)).toEqual({ x: 4, y: 1, z: 0 });
    expect(borderSliceCell('south', 3)).toEqual({ x: 3, y: 0, z: 15 });
  });

  it('writeBorderSlice then readBorderSlice round-trips identically on every face', () => {
    const faces = ['up', 'down', 'north', 'south', 'west', 'east'] as const;
    const channels = ['sky', 'block'] as const;
    for (const face of faces) {
      for (const channel of channels) {
        const storage = new WorldLightStorage();
        const src = new Uint8Array(BORDER_SLICE_LENGTH);
        for (let i = 0; i < src.length; i++) src[i] = (i * 7 + face.length) % 16;
        storage.writeBorderSlice(2, -1, 3, face, channel, src);
        const out = storage.readBorderSlice(2, -1, 3, face, channel);
        expect([...out]).toEqual([...src]);
      }
    }
  });

  it('reading is deterministic across repeated calls and missing sections yield zeros', () => {
    const storage = new WorldLightStorage();
    const a = storage.readBorderSlice(0, 0, 0, 'north', 'sky');
    const b = storage.readBorderSlice(0, 0, 0, 'north', 'sky');
    expect([...a]).toEqual([...b]);
    expect(a.every((v) => v === 0)).toBe(true);

    // Writing one face/channel does not disturb another channel of the same face.
    const src = new Uint8Array(BORDER_SLICE_LENGTH).fill(5);
    storage.writeBorderSlice(0, 0, 0, 'north', 'block', src);
    expect(storage.readBorderSlice(0, 0, 0, 'north', 'sky').every((v) => v === 0)).toBe(true);
  });

  it('rejects malformed slices and unknown faces', () => {
    const storage = new WorldLightStorage();
    const short = new Uint8Array(BORDER_SLICE_LENGTH - 1);
    expect(() => storage.writeBorderSlice(0, 0, 0, 'up', 'sky', short)).toThrow(RangeError);
    expect(() =>
      storage.writeBorderSlice(0, 0, 0, 'sideways' as never, 'sky', new Uint8Array(BORDER_SLICE_LENGTH)),
    ).toThrow(RangeError);
    expect(() =>
      storage.readBorderSlice(0, 0, 0, 'up', 'sky', new Uint8Array(4)),
    ).toThrow(RangeError);
  });
});

describe('WorldLightStorage — snapshot/restore', () => {
  function seededStorage(): WorldLightStorage {
    const storage = new WorldLightStorage();
    storage.setSkyLight(0, 0, 0, 15);
    storage.setSkyLight(1, 2, 3, 7);
    storage.setBlockLight(4, 5, 6, 11);
    storage.setBlockLight(-16, 31, -1, 2); // negative-section coverage
    return storage;
  }

  it('snapshot round-trips byte-for-byte, including clearing prior data', () => {
    const original = seededStorage();

    const other = new WorldLightStorage();
    other.setSkyLight(9, 9, 9, 13); // stale data that must be wiped by restore
    other.restore(original.snapshot());

    expect(other.snapshot()).toEqual(original.snapshot());
    for (const [x, y, z] of [
      [0, 0, 0],
      [1, 2, 3],
      [4, 5, 6],
      [-16, 31, -1],
    ] as const) {
      expect(other.getSkyLight(x, y, z)).toBe(original.getSkyLight(x, y, z));
      expect(other.getBlockLight(x, y, z)).toBe(original.getBlockLight(x, y, z));
    }
    expect(other.getSkyLight(9, 9, 9)).toBe(0);
  });

  it('restores into the same instance and snapshot arrays are copies', () => {
    const original = seededStorage();
    const snap = original.snapshot();

    // Mutating the snapshot must not affect the live store.
    snap.sections[0]!.sky[0] = 1;
    expect(original.getSkyLight(0, 0, 0)).toBe(15);

    original.restore(snap);
    expect(original.size).toBe(snap.sections.length);
  });

  it('restore of an empty snapshot clears everything', () => {
    const storage = seededStorage();
    storage.restore({ sections: [] });
    expect(storage.size).toBe(0);
    expect(storage.getSkyLight(0, 0, 0)).toBe(0);
  });
});
