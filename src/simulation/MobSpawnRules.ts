/**
 * Mob spawn-eligibility predicates (137): light/biome/block/distance/category
 * checks combining 016 `BiomeTypeDefinition`, 017 `EntityCategory`, and 134's
 * `canStandAt`. No spawn cycle/caps (138's scope), no mob instantiation, and
 * no `Game`/`World` wiring — see
 * `openspec/changes/137-mob-spawn-rules/design.md`.
 */
import type { EntityCategory } from '../data/EntityType';
import type { BiomeTypeDefinition } from '../data/Biome';
import { BlockId } from '../world/BlockRegistry';
import { canStandAt, type NavigationWorld } from './NavigationGridQuery';

/** The minimal world access this module needs. */
export interface SpawnWorld extends NavigationWorld {
  getSkyLight(x: number, y: number, z: number): number;
  getBlockLight(x: number, y: number, z: number): number;
}

/** Monster/ambient mobs require light at or below this value to spawn. */
export const MONSTER_MAX_LIGHT = 7;
/** Passive creatures require light at or above this value to spawn. */
export const CREATURE_MIN_LIGHT = 9;
/** Minimum distance (blocks) from the nearest player a mob may spawn. */
export const MIN_SPAWN_DISTANCE = 24;
/** Maximum distance (blocks) from the nearest player a mob may spawn. */
export const MAX_SPAWN_DISTANCE = 128;

function clampLight(v: number): number {
  return Math.max(0, Math.min(15, v));
}

/** Combined light level at a cell: `max(clamped skyLight, clamped blockLight)`, in `[0, 15]`. */
export function lightLevelAt(world: SpawnWorld, x: number, y: number, z: number): number {
  return Math.max(clampLight(world.getSkyLight(x, y, z)), clampLight(world.getBlockLight(x, y, z)));
}

function isWaterCategory(category: EntityCategory): boolean {
  return category === 'WATER_CREATURE' || category === 'WATER_AMBIENT';
}

function isLandCategory(category: EntityCategory): boolean {
  return category === 'MONSTER' || category === 'CREATURE' || category === 'AMBIENT';
}

/** Whether `distanceBlocks` (from the nearest player) falls within the allowed spawn range. */
export function isValidSpawnDistance(distanceBlocks: number): boolean {
  return distanceBlocks >= MIN_SPAWN_DISTANCE && distanceBlocks <= MAX_SPAWN_DISTANCE;
}

/**
 * Whether `biome` is valid for `category`: a water category requires an
 * `OCEAN`/`RIVER` biome, a land category requires any other biome, and any
 * other category is never valid.
 */
export function isValidSpawnBiome(category: EntityCategory, biome: BiomeTypeDefinition): boolean {
  const isWaterBiome = biome.category === 'OCEAN' || biome.category === 'RIVER';
  if (isWaterCategory(category)) return isWaterBiome;
  if (isLandCategory(category)) return !isWaterBiome;
  return false;
}

/**
 * Whether the light level at `(x, y, z)` is valid for `category`: water
 * categories are light-independent; `MONSTER`/`AMBIENT` require darkness
 * (`<= MONSTER_MAX_LIGHT`); `CREATURE` requires brightness
 * (`>= CREATURE_MIN_LIGHT`); any other category is never valid.
 */
export function isValidSpawnLight(
  category: EntityCategory,
  world: SpawnWorld,
  x: number,
  y: number,
  z: number,
): boolean {
  if (isWaterCategory(category)) return true;
  if (category === 'MONSTER' || category === 'AMBIENT') {
    return lightLevelAt(world, x, y, z) <= MONSTER_MAX_LIGHT;
  }
  if (category === 'CREATURE') {
    return lightLevelAt(world, x, y, z) >= CREATURE_MIN_LIGHT;
  }
  return false;
}

/**
 * Whether the block/clearance at `(x, y, z)` is valid for `category`: a water
 * category requires an actual water block; a land category requires
 * `canStandAt` (134); any other category is never valid.
 */
export function isValidSpawnBlock(
  category: EntityCategory,
  world: SpawnWorld,
  x: number,
  y: number,
  z: number,
  height = 2,
): boolean {
  if (isWaterCategory(category)) {
    return world.getBlockId(x, y, z) === BlockId.Water;
  }
  if (isLandCategory(category)) {
    return canStandAt(world, x, y, z, height);
  }
  return false;
}

/** The conjunction of distance, biome, light, and block/clearance eligibility. */
export function canSpawn(
  category: EntityCategory,
  world: SpawnWorld,
  biome: BiomeTypeDefinition,
  x: number,
  y: number,
  z: number,
  distanceBlocks: number,
  height = 2,
): boolean {
  return (
    isValidSpawnDistance(distanceBlocks) &&
    isValidSpawnBiome(category, biome) &&
    isValidSpawnLight(category, world, x, y, z) &&
    isValidSpawnBlock(category, world, x, y, z, height)
  );
}
