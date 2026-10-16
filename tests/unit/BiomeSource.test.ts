import { describe, it, expect } from 'vitest';
import {
  biomeClimateTargets,
  BiomeSource,
  type ClimateSamplerLike,
} from '../../src/worldgen/BiomeSource';
import { createDefaultBiomeRegistry } from '../../src/data/Biome';
import type { ClimateSample } from '../../src/worldgen/ClimateSampler';

const registry = createDefaultBiomeRegistry();

function fixedSampler(sample: ClimateSample): ClimateSamplerLike {
  return { sample: () => sample };
}

describe('biomeClimateTargets', () => {
  it('maps temperature per the documented formula', () => {
    const plains = registry.getByKey('plains')!; // temperature 0.8
    const desert = registry.getByKey('desert')!; // temperature 2.0
    const ocean = registry.getByKey('ocean')!; // temperature 0.5
    const snowy = registry.getByKey('snowy_tundra')!; // temperature 0.0

    expect(biomeClimateTargets(plains).temperature).toBeCloseTo(0.32);
    expect(biomeClimateTargets(desert).temperature).toBe(0.8);
    expect(biomeClimateTargets(ocean).temperature).toBeCloseTo(0.2);
    expect(biomeClimateTargets(snowy).temperature).toBe(0);
  });

  it('applies the category tables and zero weirdness', () => {
    const plains = biomeClimateTargets(registry.getByKey('plains')!);
    const desert = biomeClimateTargets(registry.getByKey('desert')!);
    const ocean = biomeClimateTargets(registry.getByKey('ocean')!);
    const snowy = biomeClimateTargets(registry.getByKey('snowy_tundra')!);

    expect(plains.humidity).toBe(0.3);
    expect(desert.humidity).toBe(-0.9);
    expect(ocean.humidity).toBe(0.9);
    expect(snowy.humidity).toBe(0.2);

    expect(ocean.continentalness).toBe(-1);
    expect(plains.continentalness).toBe(0.2);
    expect(desert.erosion).toBe(0.6);
    expect(registry.getByKey('mountains')!.category).toBe('EXTREME_HILLS');
    expect(biomeClimateTargets(registry.getByKey('mountains')!).erosion).toBe(-0.8);

    expect(plains.weirdness).toBe(0);
  });
});

describe('BiomeSource', () => {
  it('resolves an exact target sample to its biome', () => {
    const plains = registry.getByKey('plains')!;
    const source = new BiomeSource(1, registry, fixedSampler(biomeClimateTargets(plains)));
    expect(source.getBiome(0, 0).key).toBe('plains');
  });

  it('selects the nearest target', () => {
    const plains = biomeClimateTargets(registry.getByKey('plains')!);
    const desert = biomeClimateTargets(registry.getByKey('desert')!);
    // A sample exactly halfway between plains and desert targets.
    const midway: ClimateSample = {
      temperature: (plains.temperature + desert.temperature) / 2,
      humidity: (plains.humidity + desert.humidity) / 2,
      continentalness: (plains.continentalness + desert.continentalness) / 2,
      erosion: (plains.erosion + desert.erosion) / 2,
      weirdness: 0,
    };
    // plains (humidity 0.3) vs desert (humidity -0.9): midway humidity -0.3 is equidistant in
    // that axis, but temperature differs (0.32 vs 0.8 → midway 0.56): distances are equal only if
    // all axes are symmetric. temperature: plains 0.32, desert 0.8 → midway 0.56: both differ by
    // 0.24; humidity differs by 0.6 each; continentalness 0.2 vs 0.7 → 0.45: 0.25 each; erosion
    // 0.5 vs 0.6 → 0.55: 0.05 each. All symmetric → tie → lowest registration order wins.
    const tie = new BiomeSource(1, registry, fixedSampler(midway));
    expect(tie.getBiome(0, 0).key).toBe('plains'); // plains is registered before desert

    // Bias toward desert by nudging temperature.
    const nearDesert: ClimateSample = { ...midway, temperature: midway.temperature + 0.1 };
    const biased = new BiomeSource(1, registry, fixedSampler(nearDesert));
    expect(biased.getBiome(0, 0).key).toBe('desert');
  });

  it('is deterministic with the real sampler', () => {
    const source = new BiomeSource(2024, registry);
    expect(source.getBiomeKey(10, 20)).toBe(source.getBiomeKey(10, 20));
  });

  it('only ever returns registry biomes', () => {
    const source = new BiomeSource(2024, registry);
    const keys = new Set(registry.entries().map((b) => b.key));
    for (let x = -40; x <= 40; x += 8) {
      for (let z = -40; z <= 40; z += 8) {
        expect(keys.has(source.getBiomeKey(x, z))).toBe(true);
      }
    }
  });
});
