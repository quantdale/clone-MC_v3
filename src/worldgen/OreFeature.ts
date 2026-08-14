/**
 * Ore feature system (096). `ore` extends the 094 configured-feature config union; ore targets
 * are tag-driven: an ore config names block tags (ordered numeric block-id sets) resolved through
 * `OreBlockTagRegistry`. `createDefaultOreBlockTags`/`createDefaultOreConfiguredFeatures`/
 * `createDefaultOrePlacedFeatures` provide deterministic defaults over the 094/095 registries.
 * Block ids follow the `src/world/BlockRegistry.ts` vocabulary (stone=3, dirt=2, gravel=11,
 * sand=4, coal_ore=14, iron_ore=15) but this layer stays decoupled: ids are validated
 * structurally, and the wiring change validates them against the live registry.
 */

import {
  ConfiguredFeatureRegistry,
  type ConfiguredFeatureConfig,
} from './ConfiguredFeature';
import { PlacedFeatureRegistry, type PlacementModifier } from './PlacedFeature';

/** An ore replaceable-block tag: a named, ordered set of numeric block ids. */
export interface OreBlockTag {
  key: string;
  blockIds: number[];
}

/** Validate an unknown value as an ore block tag; throws descriptively otherwise. */
export function validateOreBlockTag(input: unknown): OreBlockTag {
  if (typeof input !== 'object' || input === null) {
    throw new Error('OreFeature: tag must be an object');
  }
  const r = input as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0) {
    throw new Error('OreFeature: tag key must be a non-empty string');
  }
  if (!Array.isArray(r.blockIds) || r.blockIds.length === 0) {
    throw new Error('OreFeature: tag blockIds must be a non-empty array');
  }
  const blockIds: number[] = [];
  const seen = new Set<number>();
  for (const id of r.blockIds) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) {
      throw new Error(`OreFeature: tag blockIds entries must be non-negative integers, got ${String(id)}`);
    }
    if (seen.has(id)) {
      throw new Error(`OreFeature: tag blockIds contain duplicate id ${id}`);
    }
    seen.add(id);
    blockIds.push(id);
  }
  return { key: r.key, blockIds };
}

/** Registry of validated ore block tags (duplicate/invalid rejection, no partial state). */
export class OreBlockTagRegistry {
  private readonly tags = new Map<string, OreBlockTag>();

  register(key: string, blockIds: number[]): void {
    const tag = validateOreBlockTag({ key, blockIds });
    if (this.tags.has(key)) {
      throw new Error(`OreBlockTagRegistry: duplicate key: ${key}`);
    }
    this.tags.set(key, tag);
  }

  get(key: string): OreBlockTag | null {
    return this.tags.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.tags.has(key);
  }

  get size(): number {
    return this.tags.size;
  }

  clear(): void {
    this.tags.clear();
  }
}

/**
 * Resolve an ore config's target tags to an ordered, deduplicated block-id list: `targetTags`
 * order, then each tag's member order, deduplicating by first occurrence. Throws on unknown tags.
 */
export function resolveOreTargetBlockIds(targetTags: string[], tags: OreBlockTagRegistry): number[] {
  const resolved: number[] = [];
  const seen = new Set<number>();
  for (const tagKey of targetTags) {
    const tag = tags.get(tagKey);
    if (tag === null) {
      throw new Error(`OreFeature: unknown target tag: ${tagKey}`);
    }
    for (const id of tag.blockIds) {
      if (!seen.has(id)) {
        seen.add(id);
        resolved.push(id);
      }
    }
  }
  return resolved;
}

/**
 * Documented default ore replaceable-block tags, matching the `BlockId` vocabulary
 * (stone=3, dirt=2, gravel=11, sand=4).
 */
export function createDefaultOreBlockTags(): OreBlockTagRegistry {
  const registry = new OreBlockTagRegistry();
  registry.register('overworld/stone_ore_replaceables', [3]);
  registry.register('overworld/soil_ore_replaceables', [2, 11, 4]);
  return registry;
}

/** Documented default ore configured features (coal and iron veins over both default tags). */
export function createDefaultOreConfiguredFeatures(): ConfiguredFeatureRegistry {
  const registry = new ConfiguredFeatureRegistry();
  const coal: ConfiguredFeatureConfig = {
    type: 'ore',
    blockId: 14,
    size: 17,
    discardChanceOnAirExposure: 0,
    targetTags: ['overworld/stone_ore_replaceables', 'overworld/soil_ore_replaceables'],
  };
  const iron: ConfiguredFeatureConfig = {
    type: 'ore',
    blockId: 15,
    size: 9,
    discardChanceOnAirExposure: 0,
    targetTags: ['overworld/stone_ore_replaceables', 'overworld/soil_ore_replaceables'],
  };
  registry.register('overworld/coal_ore', coal);
  registry.register('overworld/iron_ore', iron);
  return registry;
}

/** Documented default ore placed features (095 chains: count + heightRange, no survival probe). */
export function createDefaultOrePlacedFeatures(): PlacedFeatureRegistry {
  const registry = new PlacedFeatureRegistry();
  const coalModifiers: PlacementModifier[] = [
    { type: 'count', tries: 20 },
    { type: 'heightRange', minY: -64, maxY: 192 },
  ];
  const ironModifiers: PlacementModifier[] = [
    { type: 'count', tries: 9 },
    { type: 'heightRange', minY: -64, maxY: 72 },
  ];
  registry.register('overworld/coal_ore', 'overworld/coal_ore', coalModifiers);
  registry.register('overworld/iron_ore', 'overworld/iron_ore', ironModifiers);
  return registry;
}
