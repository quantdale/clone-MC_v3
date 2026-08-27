/**
 * Passive mob baseline (145): wires the standalone entity-simulation primitives (129-139) into one
 * real, live passive mob (pig). `PassiveMobWorldAdapter` bridges `World`/`TerrainGenerator`/
 * `BiomeRegistry` to the `ShapeWorld` (130)/`NavigationWorld` (134)/`SpawnWorld` (137) interfaces
 * those primitives require, since `World` itself exposes none of them. `PassiveMobSystem` owns the
 * `EntityManager`, runs `MobSpawnCycle`'s spawn cycle for pig only, and ticks each active pig's
 * `GoalSelector` (`PassiveWanderAI`'s wander/look goals) plus `EntityPhysics` every frame, restricted
 * to the caller-supplied ticking set (132).
 *
 * No combat/damage/health, no breeding, no despawning, no save/load persistence, no per-block-shape
 * collision fidelity, and no real light-engine integration — see
 * `openspec/changes/145-passive-mob-baseline/design.md`.
 */
import type { World } from '../world/World';
import type { TerrainGenerator } from '../world/TerrainGenerator';
import { VoxelShape } from '../world/VoxelShape';
import type { ShapeWorld } from '../world/CollisionResolver';
import { CollisionResolver } from '../world/CollisionResolver';
import type { NavigationWorld } from './NavigationGridQuery';
import type { SpawnWorld } from './MobSpawnRules';
import { runSpawnCycleForChunk, type SpawnCategoryConfig } from './MobSpawnCycle';
import type { BiomeRegistry, BiomeTypeDefinition } from '../data/Biome';
import type { EntityRegistry } from '../data/EntityType';
import type { ResourceId } from '../data/ResourceId';
import { EntityManager } from './EntityManager';
import type { EntityInstance } from '../world/Entity';
import { GoalSelector } from './GoalSelector';
import { WanderGoal, LookGoal } from './PassiveWanderAI';
import { createNamedRng } from './SeedRng';
import { tickEntityPhysics, type EntityPhysicsBox } from './EntityPhysics';
import { selectTickingEntities } from './EntityChunkTracking';

/**
 * The full world-access surface `PassiveMobSystem` needs: `ShapeWorld` (130) + `NavigationWorld`
 * (134) + `SpawnWorld` (137) plus the two biome/surface queries `PassiveMobWorldAdapter` adds.
 * `PassiveMobSystem` depends on this interface, not the concrete adapter, so tests can supply a
 * plain object literal instead of constructing a real `World`/`TerrainGenerator`.
 */
export interface PassiveMobWorld extends ShapeWorld, NavigationWorld, SpawnWorld {
  getBiomeDefinition(x: number, z: number): BiomeTypeDefinition;
  getSurfaceHeightAt(x: number, z: number): number;
}

/** Dependencies for {@link PassiveMobWorldAdapter}. */
export interface PassiveMobWorldDeps {
  world: World;
  generator: TerrainGenerator;
  biomeRegistry: BiomeRegistry;
}

/**
 * Bridges `World`/`TerrainGenerator`/`BiomeRegistry` to {@link PassiveMobWorld}. Every solid block
 * collides as a full cube (partial shapes not modeled); sky light is a simplified open-column scan
 * (15 if unobstructed up to the slab top, else 0) (legacy simplification — real sky light
 * uses dimension-aware `dimension.height` and section storage); block light is always 0
 * (no block-light sources modeled) — documented simplifications, see design.md.
 */
export class PassiveMobWorldAdapter implements PassiveMobWorld {
  private readonly world: World;
  private readonly generator: TerrainGenerator;
  private readonly biomeRegistry: BiomeRegistry;

  constructor(deps: PassiveMobWorldDeps) {
    this.world = deps.world;
    this.generator = deps.generator;
    this.biomeRegistry = deps.biomeRegistry;
  }

  getCollisionShape(x: number, y: number, z: number): VoxelShape {
    return this.world.isSolid(x, y, z) ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.world.getBlock(x, y, z);
  }

  getSkyLight(x: number, y: number, z: number): number {
    for (let yy = y; yy < 64; yy++) {
      if (this.world.isSolid(x, yy, z)) return 0;
    }
    return 15;
  }

  getBlockLight(_x: number, _y: number, _z: number): number {
    return 0;
  }

  /** The registered biome definition matching the legacy biome key at `(x, z)`. Throws if unknown. */
  getBiomeDefinition(x: number, z: number): BiomeTypeDefinition {
    const key = this.generator.getBiomeAt(x, z);
    const def = this.biomeRegistry.getByKey(key);
    if (!def) {
      throw new Error(`PassiveMobWorldAdapter: unknown biome key '${key}'`);
    }
    return def;
  }

  /** The world Y a ground-standing entity's feet should rest at for column `(x, z)`. */
  getSurfaceHeightAt(x: number, z: number): number {
    return Math.floor(this.generator.getHeightAt(x, z)) + 1;
  }
}

/** A pig's physics bounding box (vanilla-like ~0.9x0.9x0.9). */
export const PIG_BOUNDING_BOX: EntityPhysicsBox = { width: 0.9, height: 0.9, depth: 0.9 };

/** Maximum live pig count a spawn cycle will maintain. */
export const SPAWN_CAP = 12;
/** Deterministic spawn-candidate attempts made per chunk per sweep. */
export const SPAWN_ATTEMPTS_PER_CHUNK = 2;
/** Frames between spawn-cycle sweeps (throttle). */
export const SPAWN_CYCLE_INTERVAL_TICKS = 100;
/** Simulation-distance cap (blocks) forwarded to each spawn cycle. */
export const SIMULATION_DISTANCE_BLOCKS = 128;
/** Max total spawns one passive spawn-cycle sweep may produce. */
export const MAX_SPAWNS_PER_CYCLE = 8;

/** One chunk coordinate pair. */
export interface ChunkCoord {
  readonly cx: number;
  readonly cz: number;
}

/**
 * Owns one world's live pig population: the `EntityManager`, the per-entity `GoalSelector`s, the
 * spawn cycle, and the per-frame tick composing goal AI with `EntityPhysics`.
 */
export class PassiveMobSystem {
  private readonly manager: EntityManager;
  private readonly registry: EntityRegistry;
  private readonly resolver = new CollisionResolver();
  private readonly goalSelectors = new Map<number, GoalSelector>();
  private readonly pigTypeId: ResourceId;
  private readonly seed: number;
  /** Monotonic fallback simulation-tick counter used when no tick index is supplied. */
  private simTickCounter = 0;

  constructor(registry: EntityRegistry, seed: number) {
    const pig = registry.getByKey('pig');
    if (!pig) {
      throw new Error('PassiveMobSystem: entity registry has no "pig" definition');
    }
    this.registry = registry;
    this.manager = new EntityManager(registry);
    this.pigTypeId = pig.id;
    this.seed = seed;
  }

  /** The underlying entity manager (read access for callers that need raw entity lookups). */
  getManager(): EntityManager {
    return this.manager;
  }

  /**
   * Run one spawn-cycle sweep for pig only, over `chunks`. Delegates entirely to 138's
   * `runSpawnCycleForChunk`, so the live pig count never exceeds `SPAWN_CAP`. Returns the total
   * number of pigs spawned this sweep.
   */
  spawnCycle(
    world: PassiveMobWorld,
    dimension: ResourceId,
    chunks: readonly ChunkCoord[],
    nearestPlayerDistance: (x: number, y: number, z: number) => number,
  ): number {
    const configs: readonly SpawnCategoryConfig[] = [
      { category: 'CREATURE', typeId: this.pigTypeId, cap: SPAWN_CAP, attemptsPerChunk: SPAWN_ATTEMPTS_PER_CHUNK },
    ];

    let total = 0;
    for (const { cx, cz } of chunks) {
      const biome = world.getBiomeDefinition(cx * 16 + 8, cz * 16 + 8);
      total += runSpawnCycleForChunk(
        this.manager,
        this.registry,
        world,
        biome,
        cx,
        cz,
        (x, z) => world.getSurfaceHeightAt(x, z),
        nearestPlayerDistance,
        dimension,
        this.seed,
        configs,
        { simulationDistanceBlocks: SIMULATION_DISTANCE_BLOCKS, maxSpawnsPerCycle: MAX_SPAWNS_PER_CYCLE },
      );
    }
    return total;
  }

  /**
   * Tick every entity in the ticking set: assign a `GoalSelector` on first tick after spawn (a
   * deterministic `WanderGoal`+`LookGoal` pair seeded from `(seed, entityId)`), then run its goal
   * selector and one `EntityPhysics` step. Entities outside the ticking set are untouched.
   */
  tick(dt: number, world: PassiveMobWorld, isChunkTicking: (cx: number, cz: number) => boolean, simTickIndex?: number): void {
    const simTick = simTickIndex ?? this.simTickCounter++;
    const ticking = selectTickingEntities(this.manager, isChunkTicking);
    for (const entity of ticking) {
      if (entity.typeId !== this.pigTypeId) continue;
      // Activation gate (fail-open): inactive entities skip goal AI but keep
      // the cheap physics step so they still settle under gravity/ground snap.
      if (!this.manager.isActivationActive(entity.id)) {
        tickEntityPhysics(this.manager, entity.id, world, this.resolver, PIG_BOUNDING_BOX, dt);
        continue;
      }

      let selector = this.goalSelectors.get(entity.id);
      if (!selector) {
        selector = new GoalSelector();
        const rng = createNamedRng(this.seed, `passive-mob-ai-${entity.id}`);
        selector.addGoal(0, new LookGoal({ manager: this.manager, entityId: entity.id, rng: rng.fork('look') }));
        selector.addGoal(
          1,
          new WanderGoal({ manager: this.manager, entityId: entity.id, world, rng: rng.fork('wander') }),
        );
        this.goalSelectors.set(entity.id, selector);
      }

      selector.tickClocked(simTick, entity.id);
      tickEntityPhysics(this.manager, entity.id, world, this.resolver, PIG_BOUNDING_BOX, dt);
    }
  }

  /** Every live pig entity, in spawn order. */
  getActivePigs(): readonly EntityInstance[] {
    return this.manager.getAll().filter((e) => e.typeId === this.pigTypeId);
  }
}
