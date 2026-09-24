/**
 * Raider combat behavior (288): makes 284 wave entities fight using existing
 * HostileTargetAI / MeleeCombat / ProjectileCore / BowAndArrow / MobHealthTracker
 * seams. No new AI framework. Witch uses a documented ranged-projectile
 * fallback (no throwable potion entity stepper exists).
 */
import type { ShapeWorld } from '../world/CollisionResolver';
import { CollisionResolver } from '../world/CollisionResolver';
import type { EntityRegistry } from '../data/EntityType';
import type { EntityManager } from './EntityManager';
import { GoalSelector } from './GoalSelector';
import { TargetAcquisitionGoal, ChaseGoal } from './HostileTargetAI';
import {
  InvulnerabilityTracker,
  resolveMeleeAttack,
} from './MeleeCombat';
import {
  stepProjectile,
  type ProjectileState,
} from './ProjectileCore';
import { computeFireVelocity, computeArrowDamage } from './BowAndArrow';
import { MobHealthTracker } from './MobDropLoot';
import { tickEntityPhysics, type EntityPhysicsBox } from './EntityPhysics';
import type { RaidState } from './RaidStateMachine';
import {
  HOSTILE_ATTACK_TICKS_SINCE_LAST,
  HOSTILE_ATTACKS_PER_SECOND,
  HOSTILE_KNOCKBACK_STRENGTH,
  PLAYER_SENTINEL_ID,
  type PlayerTarget,
} from './HostileMobBaseline';

/** Combat role for a raider type key. */
export type RaiderCombatRole = 'MELEE' | 'RANGED';

export const RAIDER_DETECTION_RADIUS = 24;
export const RAIDER_FORGET_RADIUS = 40;
export const RAIDER_MELEE_RANGE = 2;
export const RAIDER_RAVAGER_MELEE_RANGE = 2.5;
export const RAIDER_RANGED_MIN = 6;
export const RAIDER_RANGED_MAX = 14;
export const RAIDER_CHASE_SPEED = 2.8;
export const RAIDER_HOME_SPEED = 2.0;
export const RAIDER_HOME_STOP = 1.5;
export const RAIDER_MELEE_COOLDOWN_TICKS = 20;
export const PILLAGER_RANGED_COOLDOWN_TICKS = 40;
export const WITCH_RANGED_COOLDOWN_TICKS = 60;
/** Documented witch fallback: no potion-entity stepper in-tree. */
export const WITCH_RANGED_FALLBACK_DAMAGE = 5;
export const DEFAULT_RAIDER_MELEE_DAMAGE = 3;
export const RAIDER_PROJECTILE_CAP = 32;
export const PLAYER_RAID_MELEE_RANGE = 3.5;
export const PLAYER_RAID_MELEE_DAMAGE = 5;
export const PLAYER_RAID_MELEE_COOLDOWN_TICKS = 10;
export const RAIDER_BOUNDING_BOX: EntityPhysicsBox = { width: 0.6, height: 1.95, depth: 0.6 };
export const RAVAGER_BOUNDING_BOX: EntityPhysicsBox = { width: 1.2, height: 2.2, depth: 1.2 };

export interface RaiderCombatProfile {
  readonly role: RaiderCombatRole;
  readonly meleeRange: number;
  readonly rangedMin: number;
  readonly rangedMax: number;
  readonly chaseSpeed: number;
  readonly homeSpeed: number;
  readonly attackCooldownTicks: number;
  readonly baseDamage: number;
}

/** Map a roster typeKey to MELEE or RANGED. Unknown keys default to MELEE. */
export function raiderCombatRole(typeKey: string): RaiderCombatRole {
  if (typeKey === 'pillager' || typeKey === 'witch') return 'RANGED';
  return 'MELEE';
}

/** Build a pinned combat profile for a type key + optional registry attackDamage. */
export function raiderCombatProfile(
  typeKey: string,
  registryDamage: number | undefined,
): RaiderCombatProfile {
  const role = raiderCombatRole(typeKey);
  if (role === 'RANGED') {
    const base =
      typeKey === 'witch'
        ? WITCH_RANGED_FALLBACK_DAMAGE
        : Math.max(0, registryDamage ?? DEFAULT_RAIDER_MELEE_DAMAGE);
    return {
      role,
      meleeRange: RAIDER_MELEE_RANGE,
      rangedMin: RAIDER_RANGED_MIN,
      rangedMax: RAIDER_RANGED_MAX,
      chaseSpeed: RAIDER_CHASE_SPEED,
      homeSpeed: RAIDER_HOME_SPEED,
      attackCooldownTicks:
        typeKey === 'witch' ? WITCH_RANGED_COOLDOWN_TICKS : PILLAGER_RANGED_COOLDOWN_TICKS,
      baseDamage: base,
    };
  }
  const meleeRange = typeKey === 'ravager' ? RAIDER_RAVAGER_MELEE_RANGE : RAIDER_MELEE_RANGE;
  return {
    role,
    meleeRange,
    rangedMin: RAIDER_RANGED_MIN,
    rangedMax: RAIDER_RANGED_MAX,
    chaseSpeed: typeKey === 'ravager' ? RAIDER_CHASE_SPEED * 0.9 : RAIDER_CHASE_SPEED,
    homeSpeed: RAIDER_HOME_SPEED,
    attackCooldownTicks: RAIDER_MELEE_COOLDOWN_TICKS,
    baseDamage: Math.max(0, registryDamage ?? DEFAULT_RAIDER_MELEE_DAMAGE),
  };
}

/**
 * Force an ACTIVE raid into DEFEAT without mutating counters beyond status.
 * Non-ACTIVE inputs are returned unchanged.
 */
export function forceRaidDefeat(state: RaidState): RaidState {
  if (state.status !== 'ACTIVE') return state;
  return { ...state, status: 'DEFEAT' };
}

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

interface RaiderBundle {
  selector: GoalSelector;
  targetGoal: TargetAcquisitionGoal;
  profile: RaiderCombatProfile;
  typeKey: string;
  lastAttackTick: number;
}

interface LiveProjectile {
  state: ProjectileState;
  typeKey: string;
  damage: number;
}

export interface RaiderCombatTickInput {
  readonly dt: number;
  readonly simTick: number;
  readonly paused: boolean;
  readonly center: { x: number; y: number; z: number };
  readonly trackedIds: readonly number[];
  readonly getPlayerTarget: () => PlayerTarget | null;
  readonly world: ShapeWorld;
  readonly resolver: CollisionResolver;
  readonly onPlayerDamaged: (
    amount: number,
    sourceX: number,
    sourceZ: number,
    reason: string,
  ) => void;
  readonly onRaiderDied: (entityId: number) => void;
  readonly playerMeleeRequested: boolean;
}

export interface RaiderCombatTickResult {
  readonly ticked: number;
  readonly playerHits: number;
  readonly raiderDeaths: number;
  readonly projectiles: number;
}

export interface RaiderDamageResult {
  readonly applied: boolean;
  readonly died: boolean;
  readonly health: number;
}

/**
 * Owns AI bundles, player invulnerability, raider health, and projectiles for
 * the raid entity manager. Game constructs one instance beside RaidWaveController.
 */
export class RaiderCombatSystem {
  private readonly manager: EntityManager;
  private readonly registry: EntityRegistry;
  private readonly bundles = new Map<number, RaiderBundle>();
  private readonly invulnerability = new InvulnerabilityTracker();
  private readonly health = new MobHealthTracker();
  private readonly projectiles: LiveProjectile[] = [];
  private playerMeleeCooldownUntil = 0;
  private readonly defaultResolver = new CollisionResolver();
  /** Updated every tick so goal closures never capture a stale input. */
  private playerTargetGetter: () => PlayerTarget | null = () => null;

  constructor(opts: { manager: EntityManager; registry: EntityRegistry }) {
    this.manager = opts.manager;
    this.registry = opts.registry;
  }

  /** Drop all ephemeral combat state (dispose / terminal / clear / reload). */
  clear(): void {
    this.bundles.clear();
    this.invulnerability.clear();
    this.health.clear();
    this.projectiles.length = 0;
    this.playerMeleeCooldownUntil = 0;
    this.playerTargetGetter = () => null;
  }

  /** Current live projectile count (diagnostics / tests). */
  getProjectileCount(): number {
    return this.projectiles.length;
  }

  /** Current tracked health for a raider, or undefined if never damaged. */
  getRaiderHealth(entityId: number): number | undefined {
    return this.health.getHealth(entityId);
  }

  /**
   * Apply damage to a tracked raider. On death: remove entity, clear tracking,
   * invoke `onDied`. Non-finite/non-positive amounts and missing entities are
   * no-ops.
   */
  damageRaider(
    entityId: number,
    amount: number,
    onDied: (entityId: number) => void,
  ): RaiderDamageResult {
    const entity = this.manager.get(entityId);
    if (!entity || entity.state !== 'ACTIVE') {
      return { applied: false, died: false, health: 0 };
    }
    if (!isFiniteNumber(amount) || amount <= 0) {
      return { applied: false, died: false, health: this.health.getHealth(entityId) ?? 0 };
    }
    const def = this.registry.getOptional(entity.typeId);
    const maxHealth = def?.health ?? 20;
    const { health, died } = this.health.damage(entityId, amount, maxHealth);
    if (!died) {
      return { applied: true, died: false, health };
    }
    this.health.remove(entityId);
    this.bundles.delete(entityId);
    this.manager.remove(entityId);
    onDied(entityId);
    return { applied: true, died: true, health: 0 };
  }

  tick(input: RaiderCombatTickInput): RaiderCombatTickResult {
    if (input.paused) {
      return { ticked: 0, playerHits: 0, raiderDeaths: 0, projectiles: this.projectiles.length };
    }

    const tracked = new Set(input.trackedIds);
    for (const id of [...this.bundles.keys()]) {
      if (!tracked.has(id)) this.bundles.delete(id);
    }

    let playerHits = 0;
    let raiderDeaths = 0;
    let ticked = 0;
    this.playerTargetGetter = input.getPlayerTarget;
    const player = this.playerTargetGetter();
    const resolver = input.resolver ?? this.defaultResolver;

    for (const entityId of input.trackedIds) {
      const entity = this.manager.get(entityId);
      if (!entity || entity.state !== 'ACTIVE') continue;
      const def = this.registry.getOptional(entity.typeId);
      const typeKey = def?.key ?? 'unknown';
      const profile = raiderCombatProfile(typeKey, def?.attackDamage);
      let bundle = this.bundles.get(entityId);
      if (!bundle || bundle.typeKey !== typeKey) {
        bundle = this.createBundle(entityId, typeKey, profile);
        this.bundles.set(entityId, bundle);
      }

      bundle.selector.tick();

      const box = typeKey === 'ravager' ? RAVAGER_BOUNDING_BOX : RAIDER_BOUNDING_BOX;
      // Home steering when no acquired target.
      const acquired = bundle.targetGoal.getTarget();
      if (!acquired) {
        this.steerHome(entityId, input.center, profile.homeSpeed);
      }

      tickEntityPhysics(this.manager, entityId, input.world, resolver, box, input.dt);
      ticked++;

      const current = this.manager.get(entityId);
      if (!current) continue;

      if (profile.role === 'MELEE' && player && acquired) {
        if (
          horizontalDistance(current.transform.x, current.transform.z, player.x, player.z) <=
          profile.meleeRange
        ) {
          if (input.simTick - bundle.lastAttackTick >= profile.attackCooldownTicks) {
            const result = resolveMeleeAttack(
              this.invulnerability,
              PLAYER_SENTINEL_ID,
              input.simTick,
              profile.baseDamage,
              HOSTILE_ATTACK_TICKS_SINCE_LAST,
              HOSTILE_ATTACKS_PER_SECOND,
              current.transform.x,
              current.transform.z,
              player.x,
              player.z,
              HOSTILE_KNOCKBACK_STRENGTH,
              { vx: player.vx ?? 0, vy: player.vy ?? 0, vz: player.vz ?? 0 },
            );
            if (result.applied && result.damage > 0) {
              input.onPlayerDamaged(result.damage, current.transform.x, current.transform.z, typeKey);
              playerHits++;
              bundle.lastAttackTick = input.simTick;
            }
          }
        }
      } else if (profile.role === 'RANGED' && player && acquired) {
        const dist = horizontalDistance(current.transform.x, current.transform.z, player.x, player.z);
        if (
          dist <= profile.rangedMax &&
          input.simTick - bundle.lastAttackTick >= profile.attackCooldownTicks &&
          this.projectiles.length < RAIDER_PROJECTILE_CAP
        ) {
          const dirX = player.x - current.transform.x;
          const dirY = player.y + 0.8 - (current.transform.y + 1.2);
          const dirZ = player.z - current.transform.z;
          // Partial pull keeps flight speed in a range ProjectileCore's point
          // sample can still intersect the player hit sphere at typical standoff.
          const vel = computeFireVelocity(dirX, dirY, dirZ, 0.55);
          const speed = Math.hypot(vel.vx, vel.vy, vel.vz);
          const damage =
            typeKey === 'witch'
              ? WITCH_RANGED_FALLBACK_DAMAGE
              : Math.max(profile.baseDamage, computeArrowDamage(speed));
          this.projectiles.push({
            state: {
              x: current.transform.x,
              y: current.transform.y + 1.2,
              z: current.transform.z,
              vx: vel.vx,
              vy: vel.vy,
              vz: vel.vz,
              ownerId: entityId,
              ageTicks: 0,
            },
            typeKey,
            damage,
          });
          bundle.lastAttackTick = input.simTick;
        }
      }
    }

    // Step projectiles toward the player hitbox.
    if (this.projectiles.length > 0) {
      const targets = player
        ? [
            {
              id: PLAYER_SENTINEL_ID,
              x: player.x,
              y: player.y + 0.8,
              z: player.z,
              // Generous vs point-sampled projectile steps (142 has no sweep vs entities).
              radius: 1.25,
            },
          ]
        : [];
      const surviving: LiveProjectile[] = [];
      for (const proj of this.projectiles) {
        const step = stepProjectile(input.world, resolver, proj.state, targets);
        if (step.expired || step.hitBlock) continue;
        if (step.hitEntityId === PLAYER_SENTINEL_ID && player) {
          if (proj.damage > 0) {
            input.onPlayerDamaged(proj.damage, step.state.x, step.state.z, proj.typeKey);
            playerHits++;
          }
          continue;
        }
        surviving.push({ ...proj, state: step.state });
      }
      this.projectiles.length = 0;
      this.projectiles.push(...surviving.slice(0, RAIDER_PROJECTILE_CAP));
    }

    // Player proximity melee against nearest raider.
    if (
      input.playerMeleeRequested &&
      player &&
      input.simTick >= this.playerMeleeCooldownUntil &&
      input.trackedIds.length > 0
    ) {
      let bestId: number | null = null;
      let bestDist = PLAYER_RAID_MELEE_RANGE;
      for (const id of input.trackedIds) {
        const e = this.manager.get(id);
        if (!e || e.state !== 'ACTIVE') continue;
        const d = Math.hypot(
          e.transform.x - player.x,
          e.transform.y - player.y,
          e.transform.z - player.z,
        );
        if (d < bestDist) {
          bestDist = d;
          bestId = id;
        }
      }
      if (bestId !== null) {
        const result = this.damageRaider(bestId, PLAYER_RAID_MELEE_DAMAGE, (id) => {
          input.onRaiderDied(id);
          raiderDeaths++;
        });
        if (result.applied) {
          this.playerMeleeCooldownUntil = input.simTick + PLAYER_RAID_MELEE_COOLDOWN_TICKS;
        }
      }
    }

    return {
      ticked,
      playerHits,
      raiderDeaths,
      projectiles: this.projectiles.length,
    };
  }

  private createBundle(
    entityId: number,
    typeKey: string,
    profile: RaiderCombatProfile,
  ): RaiderBundle {
    const targetGoal = new TargetAcquisitionGoal({
      manager: this.manager,
      entityId,
      findNearestTarget: () => this.playerTargetGetter(),
      detectionRadius: RAIDER_DETECTION_RADIUS,
      forgetRadius: RAIDER_FORGET_RADIUS,
    });
    const attackRange = profile.role === 'RANGED' ? profile.rangedMin : profile.meleeRange;
    const chaseGoal = new ChaseGoal({
      manager: this.manager,
      entityId,
      targetSource: targetGoal,
      speed: profile.chaseSpeed,
      attackRange,
    });
    const selector = new GoalSelector();
    selector.addGoal(0, targetGoal);
    selector.addGoal(1, chaseGoal);
    return {
      selector,
      targetGoal,
      profile,
      typeKey,
      lastAttackTick: Number.NEGATIVE_INFINITY,
    };
  }

  private steerHome(
    entityId: number,
    center: { x: number; y: number; z: number },
    speed: number,
  ): void {
    const entity = this.manager.get(entityId);
    if (!entity) return;
    const dx = center.x - entity.transform.x;
    const dz = center.z - entity.transform.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= RAIDER_HOME_STOP) {
      this.manager.setVelocity(entityId, { vx: 0, vy: entity.velocity.vy, vz: 0 });
      return;
    }
    this.manager.setVelocity(entityId, {
      vx: (dx / dist) * speed,
      vy: entity.velocity.vy,
      vz: (dz / dist) * speed,
    });
  }
}
