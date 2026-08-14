import { describe, it, expect } from 'vitest';
import {
  PackedIntegerArray,
  PalettedContainer,
  MIN_PALETTE_BITS,
  MAX_PALETTE_BITS,
} from '../../src/data/PalettedContainer';
import { SECTION_VOLUME } from '../../src/math/SectionCoordinate';

describe('PackedIntegerArray', () => {
  it('round-trips values within the configured bit width', () => {
    const arr = new PackedIntegerArray(4, 16);
    for (let i = 0; i < 16; i++) arr.set(i, i % 16);
    for (let i = 0; i < 16; i++) expect(arr.get(i)).toBe(i % 16);
  });

  it('handles cross-word bit boundaries', () => {
    const arr = new PackedIntegerArray(8, 8); // 8 words-ish, 8-bit entries
    for (let i = 0; i < 8; i++) arr.set(i, 200 + i);
    for (let i = 0; i < 8; i++) expect(arr.get(i)).toBe(200 + i);
  });

  it('throws on out-of-range index', () => {
    const arr = new PackedIntegerArray(4, 4);
    expect(() => arr.get(4)).toThrow(RangeError);
    expect(() => arr.set(-1, 1)).toThrow(RangeError);
  });

  it('resize preserves every value', () => {
    const arr = new PackedIntegerArray(4, 64);
    for (let i = 0; i < 64; i++) arr.set(i, (i * 7) % 16);
    arr.resize(8);
    expect(arr.bitsPerEntry).toBe(8);
    for (let i = 0; i < 64; i++) expect(arr.get(i)).toBe((i * 7) % 16);
  });

  it('serialize/deserialize round-trips the word array', () => {
    const arr = new PackedIntegerArray(5, 32);
    for (let i = 0; i < 32; i++) arr.set(i, (i * 3) % 32);
    const restored = PackedIntegerArray.deserialize(5, 32, arr.serialize());
    for (let i = 0; i < 32; i++) expect(restored.get(i)).toBe((i * 3) % 32);
  });
});

describe('PalettedContainer', () => {
  it('returns the default value for every unset slot', () => {
    const c = new PalettedContainer<number>({ capacity: 16, defaultValue: 0 });
    for (let i = 0; i < 16; i++) expect(c.get(i)).toBe(0);
    expect(c.paletteSize).toBe(1);
  });

  it('round-trips a single stored value', () => {
    const c = new PalettedContainer<number>({ capacity: 16, defaultValue: 0 });
    c.set(5, 42);
    expect(c.get(5)).toBe(42);
    expect(c.get(4)).toBe(0);
    expect(c.paletteSize).toBe(2);
  });

  it('de-duplicates equal values into one palette entry', () => {
    const c = new PalettedContainer<number>({ capacity: 16, defaultValue: -1 });
    c.set(0, 7);
    c.set(1, 7);
    c.set(2, 7);
    expect(c.get(0)).toBe(7);
    expect(c.get(1)).toBe(7);
    expect(c.paletteSize).toBe(2); // default + 7
  });

  it('widens bit width as the palette grows', () => {
    const c = new PalettedContainer<number>({ capacity: 64, defaultValue: 0 });
    expect(c.bitsPerEntry).toBe(MIN_PALETTE_BITS);
    for (let i = 1; i <= 17; i++) c.set(i % 64, i);
    expect(c.paletteSize).toBe(18);
    expect(c.bitsPerEntry).toBe(5);
    for (let i = 1; i <= 17; i++) expect(c.get(i % 64)).toBe(i);
  });

  it('keeps growing bit width up to the maximum', () => {
    const c = new PalettedContainer<number>({ capacity: 4096, defaultValue: 0 });
    for (let i = 1; i < 4096; i++) c.set(i, i * 3);
    expect(c.paletteSize).toBe(4096);
    expect(c.bitsPerEntry).toBeLessThanOrEqual(MAX_PALETTE_BITS);
  });

  it('stores large and negative values unchanged', () => {
    const c = new PalettedContainer<number>({ capacity: 16, defaultValue: 0 });
    c.set(0, 100000);
    c.set(1, -5);
    c.set(2, 0xffff);
    expect(c.get(0)).toBe(100000);
    expect(c.get(1)).toBe(-5);
    expect(c.get(2)).toBe(0xffff);
  });

  it('overwrites a previously set slot', () => {
    const c = new PalettedContainer<number>({ capacity: 8, defaultValue: 0 });
    c.set(3, 11);
    c.set(3, 22);
    expect(c.get(3)).toBe(22);
  });

  it('serializes and deserializes back to an identical container', () => {
    const c = new PalettedContainer<number>({ capacity: 64, defaultValue: 0 });
    for (let i = 0; i < 64; i++) c.set(i, (i * 5) % 20);
    const data = c.serialize();
    const restored = PalettedContainer.deserialize(data, { capacity: 64, defaultValue: 0 });
    for (let i = 0; i < 64; i++) expect(restored.get(i)).toBe((i * 5) % 20);
    expect(restored.bitsPerEntry).toBe(c.bitsPerEntry);
    expect(restored.paletteSize).toBe(c.paletteSize);
  });

  it('serializes a full section volume deterministically', () => {
    const c = new PalettedContainer<number>({ defaultValue: 0 }); // SECTION_VOLUME
    for (let i = 0; i < SECTION_VOLUME; i++) c.set(i, i % 33);
    const data = c.serialize();
    const restored = PalettedContainer.deserialize(data, { defaultValue: 0 });
    for (let i = 0; i < SECTION_VOLUME; i++) expect(restored.get(i)).toBe(i % 33);
  });

  it('rejects an unsupported serialization version', () => {
    const c = new PalettedContainer<number>({ capacity: 8, defaultValue: 0 });
    const data = c.serialize();
    expect(() => PalettedContainer.deserialize({ ...data, version: 999 }, { capacity: 8, defaultValue: 0 })).toThrow();
  });

  it('rejects a capacity mismatch on deserialize', () => {
    const c = new PalettedContainer<number>({ capacity: 8, defaultValue: 0 });
    const data = c.serialize();
    expect(() =>
      PalettedContainer.deserialize(data, { capacity: 16, defaultValue: 0 }),
    ).toThrow();
  });
});
