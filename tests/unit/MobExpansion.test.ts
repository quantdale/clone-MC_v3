import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  createMobDefinition,
  createMobExpansion,
  mobById,
  mobsByCategory,
  mobsInBiome,
} from '../../src/data/MobExpansion';

const baseSpawns = { biomes: ['nether'] as const, weight: 10, packSize: [1, 3] as [number, number] };

describe('creation', () => {
  it('applies explicit fields and documented defaults', () => {
    const blaze = createMobDefinition({
      id: 'minecraft:blaze_alt',
      name: 'entity.blaze_alt',
      category: 'hostile',
      archetype: 'melee',
      health: 40,
      speed: 0.6,
      spawns: baseSpawns,
    });
    expect(blaze).toMatchObject({
      archetype: 'melee',
      health: 40,
      speed: 0.6,
      hostileToPlayer: true,
      spawns: { biomes: ['nether'], weight: 10, packSize: [1, 3] },
    });

    const cow = createMobDefinition({
      id: createResourceId('minecraft', 'cow_alt'),
      name: 'entity.cow_alt',
      category: 'passive',
      health: 10,
      speed: 0.2,
      spawns: { biomes: ['plains'], weight: 8, packSize: [1, 4] },
    });
    expect(cow.archetype).toBe('wanderer');
    expect(cow.hostileToPlayer).toBe(false);
  });
});

describe('rejections', () => {
  const base = {
    id: 'minecraft:golem_alt',
    name: 'entity.golem_alt',
    category: 'utility' as const,
    health: 60,
    speed: 0.4,
    spawns: { biomes: ['plains'] as const, weight: 5, packSize: [1, 1] as [number, number] },
  };

  it('rejects invalid ids and prefixed paths', () => {
    expect(() => createMobDefinition({ ...base, id: 'Bad Id' })).toThrow(
      'MobExpansion: id must be a valid namespaced id',
    );
    expect(() => createMobDefinition({ ...base, id: 'minecraft:mob/creeper' })).toThrow(
      "MobExpansion: id path must not start with 'mob/'",
    );
  });

  it('rejects empty names and unknown categories/archetypes', () => {
    expect(() => createMobDefinition({ ...base, name: '' })).toThrow(
      'MobExpansion: name must be a non-empty string',
    );
    expect(() => createMobDefinition({ ...base, category: 'boss' as never })).toThrow(
      'MobExpansion: category must be passive, hostile, neutral, or utility',
    );
    expect(() => createMobDefinition({ ...base, archetype: 'flyer' as never })).toThrow(
      'MobExpansion: archetype must be melee, ranged, or wanderer',
    );
  });

  it('rejects bad health, speed, and hostileToPlayer', () => {
    for (const health of [0, 1.5]) {
      expect(() => createMobDefinition({ ...base, health })).toThrow(
        'MobExpansion: health must be a positive integer',
      );
    }
    for (const speed of [0, NaN]) {
      expect(() => createMobDefinition({ ...base, speed })).toThrow(
        'MobExpansion: speed must be a finite number > 0',
      );
    }
    expect(() => createMobDefinition({ ...base, hostileToPlayer: 'yes' as never })).toThrow(
      'MobExpansion: hostileToPlayer must be a boolean',
    );
  });

  it('rejects bad spawn data', () => {
    expect(() =>
      createMobDefinition({ ...base, spawns: { ...baseSpawns, biomes: [] } }),
    ).toThrow('MobExpansion: spawns.biomes must not be empty');
    expect(() =>
      createMobDefinition({ ...base, spawns: { ...baseSpawns, biomes: ['swamp' as never] } }),
    ).toThrow('MobExpansion: spawns.biomes must be known biome categories');
    for (const weight of [0, 2.5]) {
      expect(() => createMobDefinition({ ...base, spawns: { ...baseSpawns, weight } })).toThrow(
        'MobExpansion: spawns.weight must be a positive integer',
      );
    }
    for (const packSize of [[3, 1], [1, 0], [1, 1.5]] as const) {
      expect(() => createMobDefinition({ ...base, spawns: { ...baseSpawns, packSize } })).toThrow(
        'MobExpansion: spawns.packSize must be a positive integer [min, max] pair with min <= max',
      );
    }
  });
});

describe('expansion', () => {
  const a = createMobDefinition({
    id: 'minecraft:a',
    name: 'entity.a',
    category: 'hostile',
    health: 20,
    speed: 0.3,
    spawns: { biomes: ['nether'], weight: 5, packSize: [1, 2] },
  });
  const b = createMobDefinition({
    id: 'minecraft:b',
    name: 'entity.b',
    category: 'passive',
    health: 10,
    speed: 0.2,
    spawns: { biomes: ['plains'], weight: 8, packSize: [1, 4] },
  });

  it('preserves registration order and rejects duplicates', () => {
    const expansion = createMobExpansion([a, b]);
    expect(expansion.mobs).toEqual([a, b]);
    expect(() => createMobExpansion([a, a])).toThrow(
      'MobExpansion: duplicate mob id minecraft:a',
    );
  });

  it('looks up by id and filters by category and biome', () => {
    const expansion = createMobExpansion([a, b]);
    expect(mobById(expansion, 'minecraft:b')).toEqual(b);
    expect(mobById(expansion, createResourceId('minecraft', 'a'))).toEqual(a);
    expect(mobById(expansion, 'minecraft:nope')).toBeUndefined();
    expect(mobsByCategory(expansion, 'hostile')).toEqual([a]);
    expect(mobsInBiome(expansion, 'plains')).toEqual([b]);
    expect(mobsInBiome(expansion, 'ocean')).toEqual([]);
  });

  it('supports empty expansions', () => {
    const empty = createMobExpansion([]);
    expect(empty.mobs).toEqual([]);
    expect(mobById(empty, 'minecraft:a')).toBeUndefined();
  });
});
