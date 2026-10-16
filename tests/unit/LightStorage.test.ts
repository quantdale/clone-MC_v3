import { describe, it, expect } from 'vitest';
import { NibbleArray, SectionLightStorage } from '../../src/rendering/LightStorage';

describe('NibbleArray', () => {
  it('round-trips all 4096 cells including both nibbles of each byte', () => {
    const array = new NibbleArray();
    for (let i = 0; i < array.size; i++) {
      array.set(i, i % 16);
    }
    for (let i = 0; i < array.size; i++) {
      expect(array.get(i)).toBe(i % 16);
    }
    // Adjacent cells share a byte: verify both nibbles are independent.
    array.set(0, 5);
    array.set(1, 10);
    expect(array.get(0)).toBe(5);
    expect(array.get(1)).toBe(10);
  });

  it('validates indices and values', () => {
    const array = new NibbleArray();
    expect(() => array.get(4096)).toThrow(RangeError);
    expect(() => array.get(-1)).toThrow(RangeError);
    expect(() => array.set(0, 16)).toThrow(RangeError);
    expect(() => array.set(0, -1)).toThrow(RangeError);
    expect(() => array.set(0, 1.5)).toThrow(RangeError);
  });

  it('serializes and deserializes byte-identically; rejects wrong lengths', () => {
    const array = new NibbleArray();
    array.set(0, 15);
    array.set(4095, 3);

    const fresh = NibbleArray.deserialize(array.serialize());
    expect(fresh.get(0)).toBe(15);
    expect(fresh.get(4095)).toBe(3);
    expect(fresh.serialize()).toEqual(array.serialize());

    expect(() => new NibbleArray(new Uint8Array(10))).toThrow(RangeError);
    expect(() => NibbleArray.deserialize(new Uint8Array(0))).toThrow(RangeError);
  });

  it('defaults to zeros', () => {
    const array = new NibbleArray();
    expect(array.get(1234)).toBe(0);
  });
});

describe('SectionLightStorage', () => {
  it('exposes sky and block light accessors by coordinate', () => {
    const storage = new SectionLightStorage();
    storage.setSkyLight(3, 4, 5, 9);
    storage.setBlockLight(3, 4, 5, 14);

    expect(storage.getSkyLight(3, 4, 5)).toBe(9);
    expect(storage.getBlockLight(3, 4, 5)).toBe(14);
    expect(storage.getSkyLight(0, 0, 0)).toBe(0);

    expect(() => storage.getSkyLight(16, 0, 0)).toThrow(RangeError);
    expect(() => storage.setBlockLight(0, -1, 0, 1)).toThrow(RangeError);
    expect(() => storage.setSkyLight(0, 0, 0, 16)).toThrow(RangeError);
  });

  it('fill sets every cell of both light types', () => {
    const storage = new SectionLightStorage();
    storage.setSkyLight(1, 1, 1, 3);
    storage.fill(7);

    expect(storage.getSkyLight(1, 1, 1)).toBe(7);
    expect(storage.getBlockLight(1, 1, 1)).toBe(7);
    expect(storage.getSkyLight(15, 15, 15)).toBe(7);
  });

  it('serializes and deserializes round-trip', () => {
    const storage = new SectionLightStorage();
    storage.setSkyLight(0, 0, 0, 15);
    storage.setBlockLight(15, 15, 15, 5);

    const fresh = SectionLightStorage.deserialize(storage.serialize());
    expect(fresh.getSkyLight(0, 0, 0)).toBe(15);
    expect(fresh.getBlockLight(15, 15, 15)).toBe(5);
    expect(fresh.serialize().sky).toEqual(storage.serialize().sky);
    expect(fresh.serialize().block).toEqual(storage.serialize().block);
  });

  it('copies constructor inputs (no aliasing)', () => {
    const sky = new Uint8Array(2048);
    sky[0] = 0xff;
    const storage = new SectionLightStorage(sky, new Uint8Array(2048));

    sky[0] = 0x00; // mutate the input after construction
    expect(storage.getSkyLight(0, 0, 0)).toBe(15); // unchanged
    expect(storage.getSkyLight(1, 0, 0)).toBe(15);
  });
});
