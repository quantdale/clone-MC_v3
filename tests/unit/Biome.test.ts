import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  BiomeRegistry,
  createDefaultBiomeRegistry,
  biomeColorFromRGB,
  biomeColorToRGB,
  type BiomeTypeDefinition,
} from '../../src/data/Biome';

const rid = (key: string) => createResourceId('test', `biome/${key}`);

function def(overrides: Partial<BiomeTypeDefinition> & Pick<BiomeTypeDefinition, 'category' | 'key'>): BiomeTypeDefinition {
  return {
    id: rid(overrides.key),
    name: overrides.key,
    temperature: 0.8,
    precipitation: 'RAIN',
    grassColor: 0x7cbd6b,
    foliageColor: 0x4b9c3a,
    ...overrides,
  };
}

describe('biome registry validation', () => {
  it('builds the default registry with ten biomes and finalizes', () => {
    const reg = createDefaultBiomeRegistry();
    expect(reg.size).toBe(10);
    expect(reg.finalized).toBe(true);
    expect(reg.entries().map((d) => d.key).sort()).toEqual([
      'desert', 'forest', 'jungle', 'mountains', 'mushroom_fields',
      'ocean', 'plains', 'snowy_tundra', 'swampland', 'taiga',
    ]);
  });

  it('rejects an out-of-range temperature', () => {
    expect(
      () => new BiomeRegistry([def({ category: 'PLAINS', key: 'x', temperature: 9 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects an out-of-range color', () => {
    expect(
      () => new BiomeRegistry([def({ category: 'PLAINS', key: 'x', grassColor: 0x1ffffff })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects a non-integer color', () => {
    expect(
      () => new BiomeRegistry([def({ category: 'PLAINS', key: 'x', grassColor: 12.5 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects an unknown category', () => {
    expect(
      () => new BiomeRegistry([def({ category: 'NOPE' as never, key: 'x' })]),
    ).toThrow(/INVALID_FLAG/);
  });

  it('rejects a warm snow biome', () => {
    expect(
      () => new BiomeRegistry([def({ category: 'SNOWY_TUNDRA', key: 'x', precipitation: 'SNOW', temperature: 0.8 })]),
    ).toThrow(/INVALID_DEFINITION/);
  });

  it('rejects a duplicate id', () => {
    const d = def({ category: 'PLAINS', key: 'x' });
    expect(() => new BiomeRegistry([d, d])).toThrow(/DUPLICATE_ID/);
  });
});

describe('default biome data', () => {
  it('encodes snowy_tundra as a cold snow biome with valid colors', () => {
    const reg = createDefaultBiomeRegistry();
    const tundra = reg.getByKey('snowy_tundra')!;
    expect(tundra.category).toBe('SNOWY_TUNDRA');
    expect(tundra.precipitation).toBe('SNOW');
    expect(tundra.temperature).toBe(0.0);
    expect(tundra.grassColor).toBe(0x80b497);
    expect(tundra.foliageColor).toBe(0x60a17b);
    expect(tundra.waterColor).toBeDefined();
    expect(tundra.fogColor).toBeDefined();
  });

  it('exposes biomes by runtime id in registration order', () => {
    const reg = createDefaultBiomeRegistry();
    expect(reg.getByRuntimeId(0).key).toBe('plains');
    expect(reg.getByRuntimeId(9).key).toBe('mushroom_fields');
  });
});

describe('biome color helpers', () => {
  it('round-trips a packed 24-bit color', () => {
    const color = 0x7cbd6b;
    const rgb = biomeColorToRGB(color);
    expect(rgb).toEqual({ r: 0x7c, g: 0xbd, b: 0x6b });
    expect(biomeColorFromRGB(rgb)).toBe(color);
  });

  it('round-trips extreme channel values', () => {
    expect(biomeColorFromRGB(biomeColorToRGB(0x000000))).toBe(0x000000);
    expect(biomeColorFromRGB(biomeColorToRGB(0xffffff))).toBe(0xffffff);
  });
});
