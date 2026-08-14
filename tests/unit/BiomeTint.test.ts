import { describe, it, expect } from 'vitest';
import { biomeTint, biomeTintColor } from '../../src/rendering/BiomeTint';
import { BiomeRegistry, createDefaultBiomeRegistry, DEFAULT_WATER_COLOR } from '../../src/data/Biome';
import { createResourceId } from '../../src/data/ResourceId';

describe('biomeTintColor', () => {
  it('resolves grass to the biome grass color', () => {
    const registry = createDefaultBiomeRegistry();
    const plains = registry.getByKey('plains')!;
    expect(biomeTintColor(plains, 'grass')).toBe(plains.grassColor);
    expect(biomeTintColor(plains, 'grass')).toBe(0x7cbd6b);
  });

  it('resolves foliage to the biome foliage color', () => {
    const registry = createDefaultBiomeRegistry();
    const jungle = registry.getByKey('jungle')!;
    expect(biomeTintColor(jungle, 'foliage')).toBe(jungle.foliageColor);
    expect(biomeTintColor(jungle, 'foliage')).toBe(0x4b9c3a);
  });

  it('resolves water to the biome water color when present', () => {
    const registry = createDefaultBiomeRegistry();
    const swampland = registry.getByKey('swampland')!;
    expect(biomeTintColor(swampland, 'water')).toBe(swampland.waterColor);
    expect(biomeTintColor(swampland, 'water')).toBe(0x4e7a4e);
  });

  it('falls back to the shared default water color when absent', () => {
    const registry = new BiomeRegistry([
      {
        id: createResourceId('minecraft', 'biome/no_water'),
        key: 'no_water',
        name: 'No Water',
        category: 'PLAINS',
        temperature: 0.5,
        precipitation: 'RAIN',
        grassColor: 0x7cbd6b,
        foliageColor: 0x4b9c3a,
        // waterColor intentionally absent
      },
    ]);
    const biome = registry.getByKey('no_water')!;
    expect(biome.waterColor).toBeUndefined();
    expect(biomeTintColor(biome, 'water')).toBe(DEFAULT_WATER_COLOR);
    expect(biomeTintColor(biome, 'water')).toBe(0x3f76e4);
  });

  it('is pure and deterministic', () => {
    const registry = createDefaultBiomeRegistry();
    const forest = registry.getByKey('forest')!;
    expect(biomeTintColor(forest, 'grass')).toBe(biomeTintColor(forest, 'grass'));
    expect(biomeTintColor(forest, 'grass')).toBe(0x79c05a);
  });
});

describe('biomeTint', () => {
  it('returns the full tint attribute with the RGB split', () => {
    const registry = createDefaultBiomeRegistry();
    const forest = registry.getByKey('forest')!;
    expect(biomeTint(forest, 'grass')).toEqual({
      kind: 'grass',
      color: 0x79c05a,
      rgb: { r: 0x79, g: 0xc0, b: 0x5a },
    });
  });

  it('covers every default biome for every kind', () => {
    const registry = createDefaultBiomeRegistry();
    const kinds = ['grass', 'foliage', 'water'] as const;
    for (const biome of registry.entries()) {
      for (const kind of kinds) {
        const tint = biomeTint(biome, kind);
        expect(tint.kind).toBe(kind);
        expect(Number.isInteger(tint.color)).toBe(true);
        expect(tint.color).toBeGreaterThanOrEqual(0);
        expect(tint.color).toBeLessThanOrEqual(0xffffff);
        if (kind === 'water' && biome.waterColor !== undefined) {
          expect(tint.color).toBe(biome.waterColor);
        } else if (kind === 'water') {
          expect(tint.color).toBe(DEFAULT_WATER_COLOR);
        }
        // rgb round-trips through the color pack.
        expect(((tint.rgb.r << 16) | (tint.rgb.g << 8) | tint.rgb.b) & 0xffffff).toBe(tint.color);
      }
    }
  });
});
