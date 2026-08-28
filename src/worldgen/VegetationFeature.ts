/**
 * Vegetation features (098). Vegetation is modeled with the existing vocabulary: `blockPatch`
 * configured features (094) scatter a block within a small horizontal/vertical radius, and
 * `surfaceHeight` placed modifiers (098 addition to the 095 union) pin candidates to the
 * terrain surface so `survivalFilter` can probe them. The vegetation block ids below are
 * documented vocabulary reserved for the future block-registry expansion; this layer stays
 * decoupled (ids are validated structurally, wiring materializes them).
 */

import { ConfiguredFeatureRegistry } from './ConfiguredFeature';
import { PlacedFeatureRegistry } from './PlacedFeature';

/**
 * Documented vegetation block ids (reserved; the block expansion must materialize them):
 * short grass = 19, poppy = 20, dandelion = 21, red mushroom = 22, brown mushroom = 23.
 */
export const VEGETATION_BLOCK_IDS = {
  shortGrass: 19,
  poppy: 20,
  dandelion: 21,
  redMushroom: 22,
  brownMushroom: 23,
} as const;

/**
 * Documented default vegetation configured features: blockPatch scatter patches over the
 * vegetation block ids (tries/radiusXZ/radiusY balance density per kind).
 */
export function createDefaultVegetationConfiguredFeatures(): ConfiguredFeatureRegistry {
  const registry = new ConfiguredFeatureRegistry();
  registry.register('overworld/short_grass', {
    type: 'blockPatch',
    blockId: VEGETATION_BLOCK_IDS.shortGrass,
    tries: 16,
    radiusXZ: 4,
    radiusY: 1,
  });
  registry.register('overworld/poppy', {
    type: 'blockPatch',
    blockId: VEGETATION_BLOCK_IDS.poppy,
    tries: 6,
    radiusXZ: 3,
    radiusY: 1,
  });
  registry.register('overworld/dandelion', {
    type: 'blockPatch',
    blockId: VEGETATION_BLOCK_IDS.dandelion,
    tries: 6,
    radiusXZ: 3,
    radiusY: 1,
  });
  registry.register('overworld/red_mushroom', {
    type: 'blockPatch',
    blockId: VEGETATION_BLOCK_IDS.redMushroom,
    tries: 3,
    radiusXZ: 2,
    radiusY: 1,
  });
  registry.register('overworld/brown_mushroom', {
    type: 'blockPatch',
    blockId: VEGETATION_BLOCK_IDS.brownMushroom,
    tries: 3,
    radiusXZ: 2,
    radiusY: 1,
  });
  return registry;
}

/**
 * Documented default vegetation placed features: surface-relative chains (count, optional
 * rarity, surfaceHeight, survivalFilter) that the wiring change executes per column.
 */
export function createDefaultVegetationPlacedFeatures(): PlacedFeatureRegistry {
  const registry = new PlacedFeatureRegistry();
  registry.register('overworld/short_grass', 'overworld/short_grass', [
    { type: 'count', tries: 8 },
    { type: 'surfaceHeight' },
    { type: 'survivalFilter' },
  ]);
  registry.register('overworld/poppy', 'overworld/poppy', [
    { type: 'count', tries: 2 },
    { type: 'rarity', chance: 2 },
    { type: 'surfaceHeight' },
    { type: 'survivalFilter' },
  ]);
  registry.register('overworld/dandelion', 'overworld/dandelion', [
    { type: 'count', tries: 2 },
    { type: 'rarity', chance: 2 },
    { type: 'surfaceHeight' },
    { type: 'survivalFilter' },
  ]);
  registry.register('overworld/red_mushroom', 'overworld/red_mushroom', [
    { type: 'count', tries: 1 },
    { type: 'rarity', chance: 4 },
    { type: 'surfaceHeight' },
    { type: 'survivalFilter' },
  ]);
  registry.register('overworld/brown_mushroom', 'overworld/brown_mushroom', [
    { type: 'count', tries: 1 },
    { type: 'rarity', chance: 4 },
    { type: 'surfaceHeight' },
    { type: 'survivalFilter' },
  ]);
  return registry;
}
