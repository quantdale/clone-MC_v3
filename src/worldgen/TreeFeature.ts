/**
 * Tree feature system (097). `tree` extends the 094 configured-feature config union; a tree is a
 * configurable trunk column plus a foliage canopy (documented shape tables: round / flatTop /
 * spruce). `buildTreeBlocks` produces the deterministic relative block layout for a config and
 * rng stream (one draw for the trunk height, uniform over [minHeight, maxHeight] inclusive).
 * The default oak (trunk 4-5 wood, round radius-2 leaves) matches the former hard-coded
 * TerrainGenerator tree. Block ids follow the `src/world/BlockRegistry.ts` vocabulary
 * (wood=7, leaves=8).
 */

import { ConfiguredFeatureRegistry, type ConfiguredFeatureConfig } from './ConfiguredFeature';

/** Foliage canopy shapes. */
export type TreeShape = 'round' | 'flatTop' | 'spruce';

/** Configurable trunk: a block-id column of uniform-random height. */
export interface TreeTrunkConfig {
  blockId: number;
  minHeight: number;
  maxHeight: number;
}

/** Configurable foliage: a block-id canopy of a documented shape and radius. */
export interface TreeFoliageConfig {
  blockId: number;
  shape: TreeShape;
  radius: number;
}

/** One relative block of a tree; dy = 1 is the trunk's first block, one above the surface. */
export interface TreeBlock {
  kind: 'trunk' | 'foliage';
  dx: number;
  dy: number;
  dz: number;
  blockId: number;
}

/**
 * Radius of foliage layer `i` (1-based, dy = trunk height + i), or null past the last layer.
 * round: layers 1..3, radii [r, r, max(r-1, 0)]; flatTop: layers 1..3, radii [r, r, r];
 * spruce: layers 1..(r+1), layer i has radius r - i + 1.
 */
function layerRadius(shape: TreeShape, radius: number, i: number): number | null {
  switch (shape) {
    case 'round':
      if (i > 3) {
        return null;
      }
      return i === 3 ? Math.max(radius - 1, 0) : radius;
    case 'flatTop':
      return i > 3 ? null : radius;
    case 'spruce':
      if (i > radius + 1) {
        return null;
      }
      return radius - i + 1;
  }
}

/**
 * Build the deterministic block layout for a tree config. Consumes exactly one rng draw
 * (the trunk height). Block order: trunk blocks first (dy ascending), then foliage layers
 * (layer, then dx ascending, then dz ascending).
 */
export function buildTreeBlocks(
  config: { trunk: TreeTrunkConfig; foliage: TreeFoliageConfig },
  rng: { nextFloat(): number },
): TreeBlock[] {
  const span = config.trunk.maxHeight - config.trunk.minHeight + 1;
  const height = config.trunk.minHeight + Math.floor(rng.nextFloat() * span);
  const blocks: TreeBlock[] = [];
  for (let dy = 1; dy <= height; dy++) {
    blocks.push({ kind: 'trunk', dx: 0, dy, dz: 0, blockId: config.trunk.blockId });
  }
  for (let i = 1; ; i++) {
    const r = layerRadius(config.foliage.shape, config.foliage.radius, i);
    if (r === null) {
      break;
    }
    const dy = height + i;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        blocks.push({ kind: 'foliage', dx, dy, dz, blockId: config.foliage.blockId });
      }
    }
  }
  return blocks;
}

/**
 * Documented default tree features: the oak that replaces the former hard-coded tree
 * (trunk 4-5, round canopy radius 2 — a 5x5, 5x5, 3x3 blob).
 */
export function createDefaultTreeConfiguredFeatures(): ConfiguredFeatureRegistry {
  const registry = new ConfiguredFeatureRegistry();
  const oak: ConfiguredFeatureConfig = {
    type: 'tree',
    trunk: { blockId: 7, minHeight: 4, maxHeight: 5 },
    foliage: { blockId: 8, shape: 'round', radius: 2 },
  };
  registry.register('overworld/oak_tree', oak);
  return registry;
}
