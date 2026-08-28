/**
 * Registry-driven biome selection (090). `biomeClimateTargets` derives a five-field climate
 * target from a 016 biome definition (temperature mapped as `clamp(t / 2.5, -1, 1)`; humidity,
 * continentalness, erosion from the documented category table; weirdness 0). `BiomeSource`
 * selects the registry biome whose target is nearest the sampled climate (089 `climateDistance`),
 * breaking ties by lowest registration order. The sampler is injectable for exact tests.
 */
import { climateDistance, ClimateSampler, type ClimateSample } from './ClimateSampler';
import type { BiomeRegistry, BiomeTypeDefinition } from '../data/Biome';

/** Humidity by 016 category (documented placeholder table). */
const HUMIDITY: Record<BiomeTypeDefinition['category'], number> = {
  OCEAN: 0.9,
  SWAMP: 0.9,
  JUNGLE: 0.9,
  MUSHROOM: 0.9,
  RIVER: 0.8,
  FOREST: 0.6,
  PLAINS: 0.3,
  TAIGA: 0.2,
  SNOWY_TUNDRA: 0.2,
  EXTREME_HILLS: 0.2,
  DESERT: -0.9,
};

/** Continentalness by 016 category (documented placeholder table). */
const CONTINENTALNESS: Record<BiomeTypeDefinition['category'], number> = {
  OCEAN: -1,
  RIVER: -1,
  MUSHROOM: -0.5,
  PLAINS: 0.2,
  SWAMP: 0.3,
  FOREST: 0.4,
  TAIGA: 0.5,
  JUNGLE: 0.6,
  SNOWY_TUNDRA: 0.6,
  DESERT: 0.7,
  EXTREME_HILLS: 0.9,
};

/** Erosion by 016 category (documented placeholder table). */
const EROSION: Record<BiomeTypeDefinition['category'], number> = {
  OCEAN: 0.9,
  RIVER: 0.8,
  MUSHROOM: 0.7,
  DESERT: 0.6,
  PLAINS: 0.5,
  SNOWY_TUNDRA: 0.4,
  FOREST: 0.3,
  TAIGA: 0.3,
  JUNGLE: 0.3,
  SWAMP: 0.3,
  EXTREME_HILLS: -0.8,
};

/** Derive the five-field climate target of a biome from its 016 definition (deterministic). */
export function biomeClimateTargets(biome: BiomeTypeDefinition): ClimateSample {
  return {
    temperature: Math.min(1, Math.max(-1, biome.temperature / 2.5)),
    humidity: HUMIDITY[biome.category],
    continentalness: CONTINENTALNESS[biome.category],
    erosion: EROSION[biome.category],
    weirdness: 0,
  };
}

/** Injectable climate sampler shape (structural). */
export interface ClimateSamplerLike {
  sample(x: number, z: number): ClimateSample;
}

/** Registry-driven biome selection by nearest climate target. */
export class BiomeSource {
  private readonly sampler: ClimateSamplerLike;
  private readonly biomes: readonly BiomeTypeDefinition[];
  private readonly targets: ReadonlyMap<string, ClimateSample>;

  constructor(seed: number, registry: BiomeRegistry, sampler?: ClimateSamplerLike) {
    this.sampler = sampler ?? new ClimateSampler(seed);
    this.biomes = registry.entries();
    const targets = new Map<string, ClimateSample>();
    for (const biome of this.biomes) {
      targets.set(biome.key, biomeClimateTargets(biome));
    }
    this.targets = targets;
  }

  /** The biome at (x, z): nearest climate target, ties → lowest registration order. */
  getBiome(x: number, z: number): BiomeTypeDefinition {
    const sample = this.sampler.sample(x, z);
    let best = this.biomes[0]!;
    let bestDistance = Infinity;
    for (const biome of this.biomes) {
      const distance = climateDistance(sample, this.targets.get(biome.key)!);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = biome;
      }
    }
    return best;
  }

  /** The biome key at (x, z). */
  getBiomeKey(x: number, z: number): string {
    return this.getBiome(x, z).key;
  }
}
