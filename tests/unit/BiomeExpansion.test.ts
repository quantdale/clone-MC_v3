import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  biomeById,
  createBiomeDefinition,
  createBiomeExpansion,
  featuresFor,
} from '../../src/data/BiomeExpansion';

describe('creation', () => {
  it('applies explicit fields and documented defaults', () => {
    const hot = createBiomeDefinition({
      id: 'minecraft:scorched_plains',
      name: 'biome.scorched_plains',
      temperature: 1.5,
      precipitation: 'none',
      category: 'desert',
      features: ['minecraft:cactus'],
    });
    expect(hot).toMatchObject({
      temperature: 1.5,
      precipitation: 'none',
      category: 'desert',
      features: ['minecraft:cactus'],
    });

    const quiet = createBiomeDefinition({
      id: createResourceId('minecraft', 'quiet_forest'),
      name: 'biome.quiet_forest',
    });
    expect(quiet.temperature).toBe(0.5);
    expect(quiet.precipitation).toBe('rain');
    expect(quiet.category).toBe('plains');
    expect(quiet.features).toEqual([]);
  });
});

describe('rejections', () => {
  const base = { id: 'minecraft:stone_fields', name: 'biome.stone_fields' };

  it('rejects invalid ids and prefixed paths', () => {
    expect(() => createBiomeDefinition({ ...base, id: 'Bad Id' })).toThrow(
      'BiomeExpansion: id must be a valid namespaced id',
    );
    expect(() => createBiomeDefinition({ ...base, id: 'minecraft:biome/stone' })).toThrow(
      "BiomeExpansion: id path must not start with 'biome/'",
    );
  });

  it('rejects empty names', () => {
    expect(() => createBiomeDefinition({ ...base, name: '' })).toThrow(
      'BiomeExpansion: name must be a non-empty string',
    );
  });

  it('rejects bad temperatures', () => {
    for (const temperature of [-2.5, 3, NaN]) {
      expect(() => createBiomeDefinition({ ...base, temperature })).toThrow(
        'BiomeExpansion: temperature must be a finite number in [-2, 2]',
      );
    }
    expect(() => createBiomeDefinition({ ...base, temperature: -2 })).not.toThrow();
    expect(() => createBiomeDefinition({ ...base, temperature: 2 })).not.toThrow();
  });

  it('rejects unknown precipitations and categories', () => {
    expect(() =>
      createBiomeDefinition({ ...base, precipitation: 'hail' as never }),
    ).toThrow('BiomeExpansion: precipitation must be none, rain, or snow');
    expect(() => createBiomeDefinition({ ...base, category: 'swamp' as never })).toThrow(
      'BiomeExpansion: category must be one of plains, forest, desert, snowy, ocean, nether, end, or mountain',
    );
  });

  it('rejects malformed features', () => {
    expect(() => createBiomeDefinition({ ...base, features: [''] })).toThrow(
      'BiomeExpansion: features must be non-empty strings',
    );
    expect(() =>
      createBiomeDefinition({ ...base, features: [5 as unknown as string] }),
    ).toThrow('BiomeExpansion: features must be non-empty strings');
  });
});

describe('expansion', () => {
  const a = createBiomeDefinition({ id: 'minecraft:a', name: 'biome.a', features: ['f1', 'f2'] });
  const b = createBiomeDefinition({ id: 'minecraft:b', name: 'biome.b' });

  it('preserves registration order and rejects duplicates', () => {
    const expansion = createBiomeExpansion([a, b]);
    expect(expansion.biomes).toEqual([a, b]);
    expect(() => createBiomeExpansion([a, a])).toThrow(
      'BiomeExpansion: duplicate biome id minecraft:a',
    );
  });

  it('looks up by string and ResourceId and reports features', () => {
    const expansion = createBiomeExpansion([a, b]);
    expect(biomeById(expansion, 'minecraft:b')).toEqual(b);
    expect(biomeById(expansion, createResourceId('minecraft', 'a'))).toEqual(a);
    expect(biomeById(expansion, 'minecraft:nope')).toBeUndefined();
    expect(featuresFor(a)).toEqual(['f1', 'f2']);
    expect(featuresFor(b)).toEqual([]);
  });

  it('supports empty expansions', () => {
    const empty = createBiomeExpansion([]);
    expect(empty.biomes).toEqual([]);
    expect(biomeById(empty, 'minecraft:a')).toBeUndefined();
  });
});
