import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  createStructureDefinition,
  createStructureExpansion,
  structureById,
  structuresInCategory,
} from '../../src/data/StructureExpansion';

const basePlacement = {
  biomeCategories: ['plains', 'forest'] as const,
  spacing: 24,
  yRange: [40, 80] as [number, number],
};

describe('creation', () => {
  it('applies explicit fields and documented defaults', () => {
    const library = createStructureDefinition({
      id: 'minecraft:ruined_library',
      name: 'structure.ruined_library',
      template: 'templates/library',
      placement: { ...basePlacement, separation: 4, rarity: 0.5 },
    });
    expect(library).toMatchObject({
      name: 'structure.ruined_library',
      template: 'templates/library',
      placement: {
        biomeCategories: ['plains', 'forest'],
        spacing: 24,
        separation: 4,
        rarity: 0.5,
        yRange: [40, 80],
      },
    });

    const shrine = createStructureDefinition({
      id: createResourceId('minecraft', 'small_shrine'),
      name: 'structure.small_shrine',
      template: 'templates/shrine',
      placement: { biomeCategories: ['plains'], spacing: 16, yRange: [30, 60] },
    });
    expect(shrine.placement.separation).toBe(0);
    expect(shrine.placement.rarity).toBe(1);
  });
});

describe('rejections', () => {
  const base = {
    id: 'minecraft:old_tower',
    name: 'structure.old_tower',
    template: 'templates/tower',
    placement: basePlacement,
  };

  it('rejects invalid ids and prefixed paths', () => {
    expect(() => createStructureDefinition({ ...base, id: 'Bad Id' })).toThrow(
      'StructureExpansion: id must be a valid namespaced id',
    );
    expect(() => createStructureDefinition({ ...base, id: 'minecraft:structure/hut' })).toThrow(
      "StructureExpansion: id path must not start with 'structure/'",
    );
  });

  it('rejects empty names and templates', () => {
    expect(() => createStructureDefinition({ ...base, name: '' })).toThrow(
      'StructureExpansion: name must be a non-empty string',
    );
    expect(() => createStructureDefinition({ ...base, template: '' })).toThrow(
      'StructureExpansion: template must be a non-empty string',
    );
  });

  it('rejects empty or unknown biome categories', () => {
    expect(() =>
      createStructureDefinition({ ...base, placement: { ...basePlacement, biomeCategories: [] } }),
    ).toThrow('StructureExpansion: biomeCategories must not be empty');
    expect(() =>
      createStructureDefinition({
        ...base,
        placement: { ...basePlacement, biomeCategories: ['swamp' as never] },
      }),
    ).toThrow('StructureExpansion: biomeCategories must be known biome categories');
  });

  it('rejects bad spacing, separation, rarity, and yRange', () => {
    for (const spacing of [0, 1.5]) {
      expect(() =>
        createStructureDefinition({ ...base, placement: { ...basePlacement, spacing } }),
      ).toThrow('StructureExpansion: spacing must be a positive integer');
    }
    for (const separation of [-1, 24]) {
      expect(() =>
        createStructureDefinition({ ...base, placement: { ...basePlacement, separation } }),
      ).toThrow('StructureExpansion: separation must be an integer in [0, spacing)');
    }
    for (const rarity of [0, 1.5, NaN]) {
      expect(() =>
        createStructureDefinition({ ...base, placement: { ...basePlacement, rarity } }),
      ).toThrow('StructureExpansion: rarity must be a finite number in (0, 1]');
    }
    expect(() =>
      createStructureDefinition({ ...base, placement: { ...basePlacement, yRange: [80, 40] } }),
    ).toThrow('StructureExpansion: yRange must be an integer [min, max] pair with min <= max');
    expect(() =>
      createStructureDefinition({ ...base, placement: { ...basePlacement, yRange: [30, 30.5] } }),
    ).toThrow('StructureExpansion: yRange must be an integer [min, max] pair with min <= max');
  });
});

describe('expansion', () => {
  const a = createStructureDefinition({
    id: 'minecraft:a',
    name: 'structure.a',
    template: 'templates/a',
    placement: { biomeCategories: ['plains', 'forest'], spacing: 16, yRange: [30, 60] },
  });
  const b = createStructureDefinition({
    id: 'minecraft:b',
    name: 'structure.b',
    template: 'templates/b',
    placement: { biomeCategories: ['desert'], spacing: 16, yRange: [30, 60] },
  });

  it('preserves registration order and rejects duplicates', () => {
    const expansion = createStructureExpansion([a, b]);
    expect(expansion.structures).toEqual([a, b]);
    expect(() => createStructureExpansion([a, a])).toThrow(
      'StructureExpansion: duplicate structure id minecraft:a',
    );
  });

  it('looks up by string and ResourceId and filters by category', () => {
    const expansion = createStructureExpansion([a, b]);
    expect(structureById(expansion, 'minecraft:b')).toEqual(b);
    expect(structureById(expansion, createResourceId('minecraft', 'a'))).toEqual(a);
    expect(structureById(expansion, 'minecraft:nope')).toBeUndefined();
    expect(structuresInCategory(expansion, 'plains')).toEqual([a]);
    expect(structuresInCategory(expansion, 'desert')).toEqual([b]);
    expect(structuresInCategory(expansion, 'ocean')).toEqual([]);
  });

  it('supports empty expansions', () => {
    const empty = createStructureExpansion([]);
    expect(empty.structures).toEqual([]);
    expect(structureById(empty, 'minecraft:a')).toBeUndefined();
  });
});
