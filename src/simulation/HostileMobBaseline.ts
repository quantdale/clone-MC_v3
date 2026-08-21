/**
 * Hostile mob baseline (146): wires 140's `HostileTargetAI` (target-acquire/chase) and 141's
 * `MeleeCombat` (attack resolution/invulnerability) together with the reused entity-simulation
 * primitives (129-139) into one real, live hostile mob (zombie). `HostileMobSystem` owns its own
 * `EntityManager`, runs `MobSpawnCycle`'s spawn cycle for zombie only, and ticks each active
 * zombie's goal bundle (target-acquire → chase-or-wander, plus look) composed with
 * `EntityPhysics`, resolving a melee attack against the player when in range.
 *
 * No player-initiated attack on a mob, no zombie health/death, no knockback applied to the player,
 * no line-of-sight pathing, no breeding/loot/despawn/persistence — see
 * `openspec/changes/146-hostile-mob-baseline/design.md`.
 */
import type { ShapeWorld } from '../world/CollisionResolver';
import { CollisionResolver } from '../world/CollisionResolver';
import type { NavigationWorld } from './NavigationGridQuery';
import type { SpawnWorld } from './MobSpawnRules';
import { runSpawnCycleForChunk, type SpawnCategoryConfig } from './MobSpawnCycle';
import type { BiomeTypeDefinition } from '../data/Biome';
import type { EntityRegistry } from '../data/EntityType';
import type { ResourceId } from '../data/ResourceId';
import { EntityManager } from './EntityManager';
import type { EntityInstance } from '../world/Entity';
import { GoalSelector } from './GoalSelector';
import { WanderGoal, LookGoal } from './PassiveWanderAI';
import { TargetAcquisitionGoal, ChaseGoal } from './HostileTargetAI';
import { createNamedRng } from './SeedRng';
import { tickEntityPhysics, type EntityPhysicsBox } from './EntityPhysics';
import { selectTickingEntities } from './EntityChunkTracking';
import { InvulnerabilityTracker, resolveMeleeAttack } from './MeleeCombat';

/**
 * The world-access surface `HostileMobSystem` needs. Structurally identical to 145's
 * `PassiveMobWorld`, but declared independently so this module has no import-time dependency on
 * `PassiveMobBaseline.ts` — the same stateless adapter instance satisfies both at the `Game` call
 * site via TypeScript's structural typing.
 */
export interface HostileMobWorld extends ShapeWorld, NavigationWorld, SpawnWorld {
  getBiomeDefinition(x: number, z: number): BiomeTypeDefinition;
  getSurfaceHeightAt(x: number, z: number): number;
}

/** One chunk coordinate pair. */
export interface ChunkCoord {
  readonly cx: number;
  readonly cz: number;
}

/**
 * The player's current world-facing position, plus optional velocity (used only for the
 * knockback-vector math `resolveMeleeAttack` computes; the result is intentionally not applied to
 * the player — see the proposal's Non-goals).
 */
export interface PlayerTarget {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

/** A zombie's physics bounding box (vanilla-like ~0.6 wide/deep, ~1.95 tall). */
export const ZOMBIE_BOUNDING_BOX: EntityPhysicsBox = { width: 0.6, height: 1.95, depth: 0.6 };

/** Maximum live zombie count a spawn cycle will maintain. */
export const HOSTILE_SPAWN_CAP = 8;
/** Deterministic spawn-candidate attempts made per chunk per sweep. */
export const HOSTILE_SPAWN_ATTEMPTS_PER_CHUNK = 2;
/** Frames between spawn-cycle sweeps (throttle). */
export const HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS = 100;
/** Max distance to newly acquire the player as a target. */
export const HOSTILE_DETECTION_RADIUS = 16;
/** Max distance to retain an already-acquired player target (hysteresis). */
export const HOSTILE_FORGET_RADIUS = 32;
/** Horizontal distance within which a chase stops and a melee attack is attempted. */
export const HOSTILE_ATTACK_RANGE = 2;
/** Chase horizontal steering speed in blocks/second. */
export const HOSTILE_CHASE_SPEED = 2.6;
/** Knockback strength passed to `resolveMeleeAttack` (computed, not applied — see Non-goals). */export const HOSTILE_KNOCKBACK_STRENGTH = 0.4;
/** Fallback melee damage when the registered zombie definition has no `attackDamage`. */
export const DEFAULT_HOSTILE_ATTACK_DAMAGE = 3;
/** Attacks-per-second input to `resolveMeleeAttack`'s cooldown-scaling math. */
export const HOSTILE_ATTACKS_PER_SECOND = 1;
/**
 * `ticksSinceLastAttack` always supplied to `resolveMeleeAttack`, chosen so
 * `attackCooldownProgress` saturates to `1.0` (full, unscaled damage) regardless of how often a
 * mob actually swings — the target's own invulnerability window is what paces repeat hits, not an
 * attacker-side cooldown (see design.md).
 */
export const HOSTILE_ATTACK_TICKS_SINCE_LAST = 20;
/**
 * Sentinel `InvulnerabilityTracker` key representing the player. The player has no
 * `EntityManager` record; `EntityManager` only mints non-negative ids, so this negative sentinel
 * can never collide with a real entity id.
 */
export const PLAYER_SENTINEL_ID = -1;
/** Simulation-distance cap (blocks) forwarded to each spawn cycle. */
export const HOSTILE_SIMULATION_DISTANCE_BLOCKS = 128;
/** Max total spawns one hostile spawn-cycle sweep may produce. */
export const HOSTILE_MAX_SPAWNS_PER_CYCLE = 8;

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

interface ZombieAIBundle {
  selector: GoalSelector;
  targetGoal: TargetAcquisitionGoal;
}

/**
 * Owns one world's live zombie population: the `EntityManager`, the per-entity goal bundles, the
 * shared player-facing `InvulnerabilityTracker`, the spawn cycle, and the per-frame tick composing
 * goal AI with `EntityPhysics` and melee-attack resolution.
 */
export class HostileMobSystem {
  private readonly manager: EntityManager;
  private readonly registry: EntityRegistry;
  private readonly resolver = new CollisionResolver();
  private readonly bundles = new Map<number, ZombieAIBundle>();
  private readonly invulnerability = new InvulnerabilityTracker();
  private readonly zombieTypeId: ResourceId;
  private readonly attackDamage: number;
  private readonly seed: number;
  private frameCounter = 0;
  /** Monotonic fallback simulation-tick counter used when no tick index is supplied. */
  private simTickCounter = 0;

  constructor(registry: EntityRegistry, seed: number) {
    const zombie = registry.getByKey('zombie');
    if (!zombie) {
      throw new Error('HostileMobSystem: entity registry has no "zombie" definition');
    }
    this.registry = registry;
    this.manager = new EntityManager(registry);
    this.zombieTypeId = zombie.id;
    this.attackDamage = zombie.attackDamage ?? DEFAULT_HOSTILE_ATTACK_DAMAGE;
    this.seed = seed;
  }

  /** The underlying entity manager (read access for callers that need raw entity lookups). */
  getManager(): EntityManager {
    return this.manager;
  }

  /**
   * Run one spawn-cycle sweep for zombie only, over `chunks`. Delegates entirely to 138's
   * `runSpawnCycleForChunk`, so the live zombie count never exceeds `HOSTILE_SPAWN_CAP`. Returns
   * the total number of zombies spawned this sweep.
   */
  spawnCycle(
    world: HostileMobWorld,
    dimension: ResourceId,
    chunks: readonly ChunkCoord[],
    nearestPlayerDistance: (x: number, y: number, z: number) => number,
  ): number {
    const configs: readonly SpawnCategoryConfig[] = [
      {
        category: 'MONSTER',
        typeId: this.zombieTypeId,
        cap: HOSTILE_SPAWN_CAP,
        attemptsPerChunk: HOSTILE_SPAWN_ATTEMPTS_PER_CHUNK,
      },
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
        { simulationDistanceBlocks: HOSTILE_SIMULATION_DISTANCE_BLOCKS, maxSpawnsPerCycle: HOSTILE_MAX_SPAWNS_PER_CYCLE },
      );
    }
    return total;
  }

  /**
   * Tick every zombie in the ticking set: assign a goal bundle on first tick after spawn (a
   * deterministic target-acquire/chase/wander/look set seeded from `(seed, entityId)`), run its
   * goal selector, one `EntityPhysics` step, then resolve a melee attack against `getPlayerTarget`'s
   * position when the zombie's acquired target is within `HOSTILE_ATTACK_RANGE`. Entities outside
   * the ticking set are untouched.
   */
  tick(
    dt: number,
    world: HostileMobWorld,
    isChunkTicking: (cx: number, cz: number) => boolean,
    getPlayerTarget: () => PlayerTarget | null,
    onPlayerDamaged: (amount: number) => void,
    simTickIndex?: number,
  ): void {
    this.frameCounter++;
    const simTick = simTickIndex ?? this.simTickCounter++;
    const ticking = selectTickingEntities(this.manager, isChunkTicking);
    for (const entity of ticking) {
      if (entity.typeId !== this.zombieTypeId) continue;
      // Activation gate (fail-open): inactive entities skip goal AI but keep
      // the cheap physics step so they still settle under gravity/ground snap.
      if (!this.manager.isActivationActive(entity.id)) {
        tickEntityPhysics(this.manager, entity.id, world, this.resolver, ZOMBIE_BOUNDING_BOX, dt);
        continue;
      }

      let bundle = this.bundles.get(entity.id);
      if (!bundle) {
        const rng = createNamedRng(this.seed, `hostile-mob-ai-${entity.id}`);
        const targetGoal = new TargetAcquisitionGoal({
          manager: this.manager,
          entityId: entity.id,
          findNearestTarget: () => getPlayerTarget(),
          detectionRadius: HOSTILE_DETECTION_RADIUS,
          forgetRadius: HOSTILE_FORGET_RADIUS,
        });
        const chaseGoal = new ChaseGoal({
          manager: this.manager,
          entityId: entity.id,
          targetSource: targetGoal,
          speed: HOSTILE_CHASE_SPEED,
          attackRange: HOSTILE_ATTACK_RANGE,
        });
        const wanderGoal = new WanderGoal({
          manager: this.manager,
          entityId: entity.id,
          world,
          rng: rng.fork('wander'),
        });
        const lookGoal = new LookGoal({ manager: this.manager, entityId: entity.id, rng: rng.fork('look') });

        const selector = new GoalSelector();
        selector.addGoal(0, targetGoal);
        selector.addGoal(1, chaseGoal);
        selector.addGoal(2, wanderGoal);
        selector.addGoal(3, lookGoal);

        bundle = { selector, targetGoal };
        this.bundles.set(entity.id, bundle);
      }

      bundle.selector.tickClocked(simTick, entity.id);
      tickEntityPhysics(this.manager, entity.id, world, this.resolver, ZOMBIE_BOUNDING_BOX, dt);

      const target = bundle.targetGoal.getTarget();
      if (!target) continue;
      const current = this.manager.get(entity.id);
      if (!current) continue;
      if (horizontalDistance(current.transform.x, current.transform.z, target.x, target.z) > HOSTILE_ATTACK_RANGE) {
        continue;
      }

      // `findNearestTarget` above always returns exactly `getPlayerTarget()`'s result (or null), so
      // the live `target` object here is in fact a `PlayerTarget` — TargetAcquisitionGoal's own
      // `TargetPosition` type just doesn't declare the optional velocity fields.
      const playerTarget = target as PlayerTarget;
      const result = resolveMeleeAttack(
        this.invulnerability,
        PLAYER_SENTINEL_ID,
        this.frameCounter,
        this.attackDamage,
        HOSTILE_ATTACK_TICKS_SINCE_LAST,
        HOSTILE_ATTACKS_PER_SECOND,
        current.transform.x,
        current.transform.z,
        target.x,
        target.z,
        HOSTILE_KNOCKBACK_STRENGTH,
        { vx: playerTarget.vx ?? 0, vy: playerTarget.vy ?? 0, vz: playerTarget.vz ?? 0 },
      );
      if (result.applied) {
        onPlayerDamaged(result.damage);
      }
    }
  }

  /** Every live zombie entity, in spawn order. */
  getActiveZombies(): readonly EntityInstance[] {
    return this.manager.getAll().filter((e) => e.typeId === this.zombieTypeId);
  }
}
