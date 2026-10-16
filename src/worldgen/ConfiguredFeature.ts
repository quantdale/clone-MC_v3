/**
 * Configured feature core (094). `ConfiguredFeature` pairs a key with a validated typed config;
 * the core vocabulary is `simpleBlock` (place one block) and `blockPatch` (scatter up to `tries`
 * blocks within `radiusXZ` × `radiusY`); 096 added `ore` (tag-driven ore veins, see OreFeature)
 * and 097 added `tree` (configurable trunk/foliage, see TreeFeature).
 * `ConfiguredFeatureRegistry` stores only validated
 * definitions with atomic rejection (003 pattern); `createDefaultConfiguredFeatures` provides
 * documented deterministic defaults.
 */
import type { TreeFoliageConfig, TreeTrunkConfig } from './TreeFeature';

export type ConfiguredFeatureConfig =
  | { type: 'simpleBlock'; blockId: number }
  | { type: 'blockPatch'; blockId: number; tries: number; radiusXZ: number; radiusY: number }
  | { type: 'ore'; blockId: number; size: number; discardChanceOnAirExposure: number; targetTags: string[] }
  | { type: 'tree'; trunk: TreeTrunkConfig; foliage: TreeFoliageConfig };

/** A keyed, validated configured feature. */
export interface ConfiguredFeature {
  key: string;
  config: ConfiguredFeatureConfig;
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function assertBlockId(value: unknown, path: string): void {
  if (!isInteger(value) || value < 0) {
    throw new Error(`ConfiguredFeature: ${path} must be a non-negative integer, got ${String(value)}`);
  }
}

function assertPositive(value: unknown, path: string): void {
  if (!isInteger(value) || value <= 0) {
    throw new Error(`ConfiguredFeature: ${path} must be a positive integer, got ${String(value)}`);
  }
}

/** Validate an unknown value as a configured feature config; throws descriptively otherwise. */
export function validateConfiguredFeatureConfig(input: unknown): ConfiguredFeatureConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('ConfiguredFeature: config must be an object');
  }
  const r = input as Record<string, unknown>;
  switch (r.type) {
    case 'simpleBlock':
      assertBlockId(r.blockId, 'simpleBlock.blockId');
      return input as ConfiguredFeatureConfig;
    case 'blockPatch':
      assertBlockId(r.blockId, 'blockPatch.blockId');
      assertPositive(r.tries, 'blockPatch.tries');
      assertPositive(r.radiusXZ, 'blockPatch.radiusXZ');
      assertPositive(r.radiusY, 'blockPatch.radiusY');
      return input as ConfiguredFeatureConfig;
    case 'ore':
      assertBlockId(r.blockId, 'ore.blockId');
      assertPositive(r.size, 'ore.size');
      if (typeof r.discardChanceOnAirExposure !== 'number' || Number.isNaN(r.discardChanceOnAirExposure)) {
        throw new Error(`ConfiguredFeature: ore.discardChanceOnAirExposure must be a number in [0, 1], got ${String(r.discardChanceOnAirExposure)}`);
      }
      if (r.discardChanceOnAirExposure < 0 || r.discardChanceOnAirExposure > 1) {
        throw new Error(`ConfiguredFeature: ore.discardChanceOnAirExposure must be in [0, 1], got ${r.discardChanceOnAirExposure}`);
      }
      if (!Array.isArray(r.targetTags) || r.targetTags.length === 0) {
        throw new Error('ConfiguredFeature: ore.targetTags must be a non-empty array');
      }
      for (const t of r.targetTags) {
        if (typeof t !== 'string' || t.length === 0) {
          throw new Error('ConfiguredFeature: ore.targetTags entries must be non-empty strings');
        }
      }
      return input as ConfiguredFeatureConfig;
    case 'tree': {
      if (typeof r.trunk !== 'object' || r.trunk === null) {
        throw new Error('ConfiguredFeature: tree.trunk must be an object');
      }
      const trunk = r.trunk as Record<string, unknown>;
      assertBlockId(trunk.blockId, 'tree.trunk.blockId');
      assertPositive(trunk.minHeight, 'tree.trunk.minHeight');
      assertPositive(trunk.maxHeight, 'tree.trunk.maxHeight');
      if ((trunk.minHeight as number) > (trunk.maxHeight as number)) {
        throw new Error(`ConfiguredFeature: tree.trunk.minHeight must be <= maxHeight (got ${String(trunk.minHeight)} > ${String(trunk.maxHeight)})`);
      }
      if (typeof r.foliage !== 'object' || r.foliage === null) {
        throw new Error('ConfiguredFeature: tree.foliage must be an object');
      }
      const foliage = r.foliage as Record<string, unknown>;
      assertBlockId(foliage.blockId, 'tree.foliage.blockId');
      if (foliage.shape !== 'round' && foliage.shape !== 'flatTop' && foliage.shape !== 'spruce') {
        throw new Error(`ConfiguredFeature: tree.foliage.shape must be one of round/flatTop/spruce, got ${String(foliage.shape)}`);
      }
      assertPositive(foliage.radius, 'tree.foliage.radius');
      return input as ConfiguredFeatureConfig;
    }
    default:
      throw new Error(`ConfiguredFeature: unknown feature type: ${String(r.type)}`);
  }
}

/** Validate an unknown value as a configured feature (key + config). */
export function validateConfiguredFeature(input: unknown): ConfiguredFeature {
  if (typeof input !== 'object' || input === null) {
    throw new Error('ConfiguredFeature: must be an object');
  }
  const r = input as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0) {
    throw new Error('ConfiguredFeature: key must be a non-empty string');
  }
  return { key: r.key, config: validateConfiguredFeatureConfig(r.config) };
}

/** Registry of validated configured features (duplicate/invalid rejection, no partial state). */
export class ConfiguredFeatureRegistry {
  private readonly features = new Map<string, ConfiguredFeature>();

  register(key: string, config: ConfiguredFeatureConfig): void {
    if (this.features.has(key)) {
      throw new Error(`ConfiguredFeatureRegistry: duplicate key: ${key}`);
    }
    this.features.set(key, { key, config: validateConfiguredFeatureConfig(config) });
  }

  get(key: string): ConfiguredFeature | null {
    return this.features.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.features.has(key);
  }

  get size(): number {
    return this.features.size;
  }

  clear(): void {
    this.features.clear();
  }
}

/**
 * Documented default configured features: a dirt patch and a gravel patch (blockPatch shapes).
 */
export function createDefaultConfiguredFeatures(): ConfiguredFeatureRegistry {
  const registry = new ConfiguredFeatureRegistry();
  registry.register('overworld/dirt_patch', { type: 'blockPatch', blockId: 3, tries: 64, radiusXZ: 4, radiusY: 3 });
  registry.register('overworld/gravel_patch', { type: 'blockPatch', blockId: 13, tries: 32, radiusXZ: 3, radiusY: 2 });
  return registry;
}
