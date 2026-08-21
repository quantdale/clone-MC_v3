/**
 * Bounded, deterministic per-chunk mob spawn cycle (138): per-category live
 * counting, deterministic in-chunk candidate selection (048's `hash32`), and
 * a capped attempt loop composing 137's `canSpawn` with 129's
 * `EntityManager.spawn`. No per-biome spawn tables, no `Game`/tick-loop
 * wiring, and no despawning — see
 * `openspec/changes/138-mob-spawn-cycle/design.md`.
 */
import type { ResourceId } from '../data/ResourceId';
import type { EntityCategory, EntityRegistry } from '../data/EntityType';
import type { BiomeTypeDefinition } from '../data/Biome';
import type { EntityManager } from './EntityManager';
import { canSpawn, isWithinSimulationDistance, type SpawnWorld } from './MobSpawnRules';
import { hash32 } from './RandomTickSelector';

/** Default cap on total entities one {@link runSpawnCycleForChunk} call may spawn. */
export const DEFAULT_MAX_SPAWNS_PER_CYCLE = 8;

/** Optional Phase 8 limits for {@link runSpawnCycleForChunk}. */
export interface SpawnCycleLimits {
  /**
   * Candidates farther than this (blocks, from the nearest player) are
   * skipped even if otherwise eligible. Default: no extra cap beyond
   * `MobSpawnRules`' own `MAX_SPAWN_DISTANCE`.
   */
  readonly simulationDistanceBlocks?: number;
  /** Max entities this cycle may spawn in total across all configs. */
  readonly maxSpawnsPerCycle?: number;
}

/** One entity type and attempt budget for a given 017 category. */
export interface SpawnCategoryConfig {
  readonly category: EntityCategory;
  readonly typeId: ResourceId;
  readonly cap: number;
  readonly attemptsPerChunk: number;
  /** Body height forwarded to `canSpawn`. Default 2. */
  readonly height?: number;
}

/** Number of `ACTIVE` entities whose registered type's category matches. */
export function countLiveByCategory(
  manager: EntityManager,
  registry: EntityRegistry,
  category: EntityCategory,
): number {
  let count = 0;
  for (const e of manager.getAll()) {
    if (registry.get(e.typeId).category === category) count++;
  }
  return count;
}

/**
 * Deterministic in-chunk `(x, z)` candidate for chunk `(cx, cz)`, distinct
 * per `categoryIndex`/`attempt`. Always falls within that chunk's 16-wide
 * footprint.
 */
export function selectSpawnCandidate(
  seed: number,
  cx: number,
  cz: number,
  categoryIndex: number,
  attempt: number,
): { x: number; z: number } {
  const localX = hash32(seed, cx, cz, categoryIndex, attempt, 0) % 16;
  const localZ = hash32(seed, cx, cz, categoryIndex, attempt, 1) % 16;
  return { x: cx * 16 + localX, z: cz * 16 + localZ };
}

/**
 * Run one spawn cycle for chunk `(cx, cz)` against every `configs` entry: a
 * category already at its `cap` makes zero attempts; otherwise up to
 * `attemptsPerChunk` deterministic candidates are tried, each validated via
 * `canSpawn` before spawning through `manager.spawn`, stopping early once the
 * cap is reached. `limits` (Phase 8) may additionally cap the cycle's total
 * spawns and skip candidates beyond a simulation distance. Returns the total
 * number of entities spawned.
 */
export function runSpawnCycleForChunk(
  manager: EntityManager,
  registry: EntityRegistry,
  world: SpawnWorld,
  biome: BiomeTypeDefinition,
  cx: number,
  cz: number,
  surfaceHeightAt: (x: number, z: number) => number,
  nearestPlayerDistance: (x: number, y: number, z: number) => number,
  dimension: ResourceId,
  seed: number,
  configs: readonly SpawnCategoryConfig[],
  limits: SpawnCycleLimits = {},
): number {
  const maxSpawns = limits.maxSpawnsPerCycle ?? DEFAULT_MAX_SPAWNS_PER_CYCLE;
  let totalSpawned = 0;

  configs.forEach((config, categoryIndex) => {
    if (totalSpawned >= maxSpawns) return;
    let live = countLiveByCategory(manager, registry, config.category);
    if (live >= config.cap) return;

    const height = config.height ?? 2;
    for (let attempt = 0; attempt < config.attemptsPerChunk; attempt++) {
      const { x, z } = selectSpawnCandidate(seed, cx, cz, categoryIndex, attempt);
      const y = surfaceHeightAt(x, z);
      const distance = nearestPlayerDistance(x + 0.5, y, z + 0.5);

      // Phase 8: respect the caller's simulation distance on top of the
      // base spawn-range rule; candidate selection stays deterministic
      // (hash32-seeded), so skipping is order-independent.
      if (!isWithinSimulationDistance(distance, limits.simulationDistanceBlocks ?? Infinity)) continue;
      if (!canSpawn(config.category, world, biome, x, y, z, distance, height)) continue;

      manager.spawn(config.typeId, dimension, { x: x + 0.5, y, z: z + 0.5, yaw: 0, pitch: 0 });
      live++;
      totalSpawned++;

      if (live >= config.cap || totalSpawned >= maxSpawns) break;
    }
  });

  return totalSpawned;
}
