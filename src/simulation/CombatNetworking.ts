/**
 * Pure headless combat networking framework (232).
 *
 * Server-authoritative validation of melee attack, projectile fire, and shield-block
 * requests; a server-owned projectile registry stepped each tick through 142's
 * `ProjectileCore.stepProjectile`; damage/knockback computed server-side through 141's
 * `MeleeCombat` math and 143's `BowAndArrow` formulas; shield blocking through 144's
 * `ShieldBlocking` math; health/armor damage routed through the host-supplied `CombatSinks`
 * seam; and a deterministic per-tick `CombatReplicationBatch` for observer broadcast.
 * Client-side prediction/rollback (`ClientCombatReconciler`) and a projectile mirror
 * (`ClientCombatStore`) complete the pattern. Zero DOM or transport dependencies; no
 * `src/player` imports (health routing is the documented seam).
 */

import { InvulnerabilityTracker, computeKnockback, resolveMeleeAttack } from './MeleeCombat';
import { bowPullProgress, canFireBow, computeArrowDamage, computeFireVelocity } from './BowAndArrow';
import { resolveShieldBlock, ShieldCooldownTracker } from './ShieldBlocking';
import { stepProjectile, type ProjectileOptions, type ProjectileState, type ProjectileTarget } from './ProjectileCore';
import type { CollisionResolver, ShapeWorld } from '../world/CollisionResolver';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export interface Position3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Direction3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Velocity3 {
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

export interface MeleeAttackRequest {
  readonly playerId: number;
  readonly requestId: number;
  readonly tick: number;
  readonly targetId: number;
}

export interface ProjectileFireRequest {
  readonly playerId: number;
  readonly requestId: number;
  readonly tick: number;
  readonly origin: Position3;
  readonly direction: Direction3;
  readonly chargeTicks: number;
}

export interface ShieldBlockRequest {
  readonly playerId: number;
  readonly requestId: number;
  readonly tick: number;
  readonly raised: boolean;
}

/** Host seam: the authoritative state of one attackable target. */
export interface CombatTarget {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly velocity: Velocity3;
  readonly alive: boolean;
  /** 144 bearing convention: 0 degrees = +Z, increasing toward +X. */
  readonly facingYawDegrees: number;
}

/** Host seam: the attacker's weapon/attack profile. */
export interface AttackStats {
  readonly baseDamage: number;
  readonly isAxeAttack: boolean;
}

/** What the damage sink reports back for one applied hit. */
export interface DamageApplication {
  readonly healthRemoved: number;
  readonly killed: boolean;
}

/** Host seams that route damage into the health/armor and shield-durability systems. */
export interface CombatSinks {
  /**
   * Apply `amount` damage to `targetId` (e.g. `SurvivalSystem.damage(amount, damageType)`,
   * which applies armor internally). `damageType` is `'player_attack'` for melee and
   * `'arrow'` for projectiles. `sourceId` is the attacker's player id (or -1 for an
   * ownerless projectile).
   */
  applyDamage(
    targetId: number,
    amount: number,
    damageType: string,
    sourceId: number,
    tick: number,
  ): DamageApplication;
  /** Route shield durability wear (e.g. `DurabilityRules` on the shield item). */
  applyShieldDurabilityDamage(targetId: number, amount: number, tick: number): void;
}

export interface MeleeHitEvent {
  readonly attackerId: number;
  readonly targetId: number;
  readonly tick: number;
  /** false = the target was inside its invulnerability window (no damage, no knockback). */
  readonly applied: boolean;
  /** Raw cooldown-scaled melee damage (141), pre-block and pre-armor. */
  readonly damage: number;
  /** Health actually removed (post-block, post-armor), as reported by the sink. */
  readonly healthRemoved: number;
  readonly knockback: Velocity3 | null;
  readonly blocked: boolean;
  readonly shieldDurabilityDamage: number;
  readonly killed: boolean;
}

export interface ProjectileSpawnDescriptor {
  readonly id: number;
  readonly ownerId: number | null;
  readonly origin: Position3;
  readonly velocity: Velocity3;
  readonly spawnTick: number;
}

export interface ProjectileStepUpdate {
  readonly id: number;
  readonly position: Position3;
  readonly velocity: Velocity3;
}

export interface ProjectileHitEvent {
  readonly id: number;
  readonly tick: number;
  /** Entity hit, or null for a block impact. */
  readonly targetId: number | null;
  /** Block-hit cell, or null for an entity impact. */
  readonly position: Position3 | null;
  readonly applied: boolean;
  /** Raw arrow damage from the pre-impact speed (143). */
  readonly damage: number;
  readonly healthRemoved: number;
  readonly knockback: Velocity3 | null;
  readonly blocked: boolean;
  readonly shieldDurabilityDamage: number;
  readonly killed: boolean;
}

export type CombatRejectionReason =
  | 'out_of_reach'
  | 'no_target'
  | 'target_dead'
  | 'stale_tick'
  | 'attack_cooldown'
  | 'no_ammo'
  | 'not_charged'
  | 'fire_too_fast'
  | 'origin_mismatch'
  | 'invalid_direction'
  | 'max_projectiles';

export type CombatResult =
  | {
      readonly accepted: true;
      readonly kind: 'melee_attack';
      readonly requestId: number;
      readonly tick: number;
      readonly targetId: number;
      readonly hit: MeleeHitEvent;
    }
  | {
      readonly accepted: false;
      readonly kind: 'melee_attack';
      readonly requestId: number;
      readonly tick: number;
      readonly targetId: number;
      readonly reason: CombatRejectionReason;
    }
  | {
      readonly accepted: true;
      readonly kind: 'projectile_fire';
      readonly requestId: number;
      readonly tick: number;
      readonly projectileId: number;
      readonly spawn: ProjectileSpawnDescriptor;
    }
  | {
      readonly accepted: false;
      readonly kind: 'projectile_fire';
      readonly requestId: number;
      readonly tick: number;
      readonly reason: CombatRejectionReason;
    }
  | {
      readonly accepted: true;
      readonly kind: 'shield_block';
      readonly requestId: number;
      readonly tick: number;
      readonly raised: boolean;
    }
  | {
      readonly accepted: false;
      readonly kind: 'shield_block';
      readonly requestId: number;
      readonly tick: number;
      readonly reason: CombatRejectionReason;
    };

export interface CombatReplicationBatch {
  readonly tick: number;
  readonly meleeHits: readonly MeleeHitEvent[];
  readonly projectileSpawns: readonly ProjectileSpawnDescriptor[];
  readonly projectileSteps: readonly ProjectileStepUpdate[];
  readonly projectileHits: readonly ProjectileHitEvent[];
  readonly projectileDespawns: readonly number[];
}

export interface CombatValidatorOptions {
  /** Max melee reach from attacker position to target center (default 3.0). */
  readonly maxAttackReach?: number;
  /** Server-enforced minimum ticks between one player's accepted attacks (default 10). */
  readonly minAttackIntervalTicks?: number;
  /** 141 cooldown-curve attacks-per-second (default 1.6). */
  readonly attacksPerSecond?: number;
  /** 141 knockback impulse strength (default 0.4). */
  readonly knockbackStrength?: number;
  /** 141 invulnerability window in ticks (default 10). */
  readonly invulnerabilityTicks?: number;
  /** Full bow draw in ticks (default 20). */
  readonly maxChargeTicks?: number;
  /** Minimum charge ticks for a shot to fire (default 1). */
  readonly minChargeTicks?: number;
  /** Max distance from the authoritative player position a fire origin may claim (default 2.0). */
  readonly maxFireOriginOffset?: number;
  /** 143 base arrow speed at full draw (default 3.0). */
  readonly baseArrowSpeed?: number;
  /** 143 base arrow damage multiplier on impact speed (default 2). */
  readonly baseArrowDamage?: number;
  /** Knockback impulse strength for projectile entity impacts (default 0.1). */
  readonly projectileKnockbackStrength?: number;
  /** Concurrent live-projectile cap (default 256). */
  readonly maxProjectiles?: number;
  /** Creative/testing infinite arrows (default false). */
  readonly infiniteAmmo?: boolean;
  /** 144 shield block arc in degrees (default 90). */
  readonly shieldBlockArcDegrees?: number;
  /** 142 projectile gravity (default 0.05). */
  readonly gravity?: number;
  /** 142 projectile drag (default 0.99). */
  readonly drag?: number;
  /** 142 projectile max age in ticks (default 1200). */
  readonly maxAgeTicks?: number;
  /** 142 owner-immunity window in ticks (default 5). */
  readonly ownerImmunityTicks?: number;
  /** 142 projectile collision box edge length (default 0.25). */
  readonly hitboxSize?: number;
}

const DEFAULT_MAX_ATTACK_REACH = 3.0;
const DEFAULT_MIN_ATTACK_INTERVAL_TICKS = 10;
const DEFAULT_ATTACKS_PER_SECOND = 1.6;
const DEFAULT_KNOCKBACK_STRENGTH = 0.4;
const DEFAULT_INVULNERABILITY_TICKS = 10;
const DEFAULT_MAX_CHARGE_TICKS = 20;
const DEFAULT_MIN_CHARGE_TICKS = 1;
const DEFAULT_MAX_FIRE_ORIGIN_OFFSET = 2.0;
const DEFAULT_BASE_ARROW_SPEED = 3.0;
const DEFAULT_BASE_ARROW_DAMAGE = 2;
const DEFAULT_PROJECTILE_KNOCKBACK_STRENGTH = 0.1;
const DEFAULT_MAX_PROJECTILES = 256;
const DEFAULT_SHIELD_BLOCK_ARC_DEGREES = 90;
const DEFAULT_GRAVITY = 0.05;
const DEFAULT_DRAG = 0.99;
const DEFAULT_MAX_AGE_TICKS = 1200;
const DEFAULT_OWNER_IMMUNITY_TICKS = 5;
const DEFAULT_HITBOX_SIZE = 0.25;

// ────────────────────────────────────────────────────────────────────────────
// Internal validation helpers
// ────────────────────────────────────────────────────────────────────────────

function requireSafeNonNegInt(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new Error(`Combat: ${label} must be a non-negative safe integer`);
  }
  return v;
}

function requireFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Combat: ${label} must be a finite number`);
  }
  return v;
}

function requirePositiveFinite(v: unknown, label: string): number {
  const n = requireFiniteNumber(v, label);
  if (n <= 0) {
    throw new Error(`Combat: ${label} must be a positive finite number`);
  }
  return n;
}

function requireNonNegFinite(v: unknown, label: string): number {
  const n = requireFiniteNumber(v, label);
  if (n < 0) {
    throw new Error(`Combat: ${label} must be a non-negative finite number`);
  }
  return n;
}

function requireBoolean(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') {
    throw new Error(`Combat: ${label} must be a boolean`);
  }
  return v;
}

function validatePosition(pos: unknown, label: string): Position3 {
  if (typeof pos !== 'object' || pos === null) {
    throw new Error(`Combat: ${label} must be an object`);
  }
  const p = pos as Record<string, unknown>;
  return {
    x: requireFiniteNumber(p.x, `${label}.x`),
    y: requireFiniteNumber(p.y, `${label}.y`),
    z: requireFiniteNumber(p.z, `${label}.z`),
  };
}

function validateVelocity(vel: unknown, label: string): Velocity3 {
  if (typeof vel !== 'object' || vel === null) {
    throw new Error(`Combat: ${label} must be an object`);
  }
  const v = vel as Record<string, unknown>;
  return {
    vx: requireFiniteNumber(v.vx, `${label}.vx`),
    vy: requireFiniteNumber(v.vy, `${label}.vy`),
    vz: requireFiniteNumber(v.vz, `${label}.vz`),
  };
}

function validateDirection(dir: unknown, label: string): Direction3 {
  if (typeof dir !== 'object' || dir === null) {
    throw new Error(`Combat: ${label} must be an object`);
  }
  const d = dir as Record<string, unknown>;
  return {
    x: requireFiniteNumber(d.x, `${label}.x`),
    y: requireFiniteNumber(d.y, `${label}.y`),
    z: requireFiniteNumber(d.z, `${label}.z`),
  };
}

function validateTarget(target: unknown): CombatTarget {
  if (typeof target !== 'object' || target === null) {
    throw new Error('Combat: target must be an object');
  }
  const t = target as Record<string, unknown>;
  const radius = requireFiniteNumber(t.radius, 'target.radius');
  if (radius <= 0) {
    throw new Error('Combat: target.radius must be a positive finite number');
  }
  return {
    id: requireSafeNonNegInt(t.id, 'target.id'),
    x: requireFiniteNumber(t.x, 'target.x'),
    y: requireFiniteNumber(t.y, 'target.y'),
    z: requireFiniteNumber(t.z, 'target.z'),
    radius,
    velocity: validateVelocity(t.velocity, 'target.velocity'),
    alive: requireBoolean(t.alive, 'target.alive'),
    facingYawDegrees: requireFiniteNumber(t.facingYawDegrees, 'target.facingYawDegrees'),
  };
}

function validateTargets(list: unknown): CombatTarget[] {
  if (!Array.isArray(list)) {
    throw new Error('Combat: targets must be an array');
  }
  return list.map((t) => validateTarget(t));
}

function validateAttackStats(stats: unknown): AttackStats {
  if (typeof stats !== 'object' || stats === null) {
    throw new Error('Combat: attack stats must be an object');
  }
  const s = stats as Record<string, unknown>;
  const baseDamage = requireNonNegFinite(s.baseDamage, 'baseDamage');
  return { baseDamage, isAxeAttack: requireBoolean(s.isAxeAttack, 'isAxeAttack') };
}

function validateDamageApplication(app: unknown, label: string): DamageApplication {
  if (typeof app !== 'object' || app === null) {
    throw new Error(`Combat: ${label} must return an object`);
  }
  const a = app as Record<string, unknown>;
  return {
    healthRemoved: requireNonNegFinite(a.healthRemoved, `${label}.healthRemoved`),
    killed: requireBoolean(a.killed, `${label}.killed`),
  };
}

function validateSpawnDescriptor(desc: unknown): ProjectileSpawnDescriptor {
  if (typeof desc !== 'object' || desc === null) {
    throw new Error('Combat: spawn descriptor must be an object');
  }
  const d = desc as Record<string, unknown>;
  const ownerId = d.ownerId === null || d.ownerId === undefined ? null : requireSafeNonNegInt(d.ownerId, 'spawn.ownerId');
  return {
    id: requireSafeNonNegInt(d.id, 'spawn.id'),
    ownerId,
    origin: validatePosition(d.origin, 'spawn.origin'),
    velocity: validateVelocity(d.velocity, 'spawn.velocity'),
    spawnTick: requireSafeNonNegInt(d.spawnTick, 'spawn.spawnTick'),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Server-side validator
// ────────────────────────────────────────────────────────────────────────────

/**
 * Server-authoritative combat validator: validates melee attack, projectile fire, and
 * shield-block requests, owns the live projectile registry, steps projectiles per tick,
 * computes damage/knockback through the 141/143 math, routes damage through the host
 * `CombatSinks`, and accumulates deterministic `CombatReplicationBatch` outputs.
 */
export class CombatValidator {
  private readonly maxAttackReach: number;
  private readonly minAttackIntervalTicks: number;
  private readonly attacksPerSecond: number;
  private readonly knockbackStrength: number;
  private readonly invulnerabilityTicks: number;
  private readonly maxChargeTicks: number;
  private readonly minChargeTicks: number;
  private readonly maxFireOriginOffset: number;
  private readonly baseArrowSpeed: number;
  private readonly baseArrowDamage: number;
  private readonly projectileKnockbackStrength: number;
  private readonly maxProjectiles: number;
  private readonly infiniteAmmo: boolean;
  private readonly shieldBlockArcDegrees: number;
  private readonly stepOptions: ProjectileOptions;

  private readonly lastAttackTick = new Map<number, number>();
  private readonly lastFireTick = new Map<number, number>();
  private readonly lastShieldTick = new Map<number, number>();
  private readonly shieldRaised = new Map<number, boolean>();
  private readonly invulnerability = new InvulnerabilityTracker();
  private readonly shieldCooldown = new ShieldCooldownTracker();

  private readonly projectiles = new Map<number, ProjectileState>();
  private nextProjectileId = 0;

  private readonly pendingMeleeHits: MeleeHitEvent[] = [];
  private readonly pendingSpawns: ProjectileSpawnDescriptor[] = [];
  private readonly pendingDespawns: number[] = [];

  constructor(options: CombatValidatorOptions = {}) {
    if (typeof options !== 'object' || options === null) {
      throw new Error('Combat: options must be an object');
    }
    this.maxAttackReach = requirePositiveFinite(options.maxAttackReach ?? DEFAULT_MAX_ATTACK_REACH, 'maxAttackReach');
    this.minAttackIntervalTicks = requireSafeNonNegInt(
      options.minAttackIntervalTicks ?? DEFAULT_MIN_ATTACK_INTERVAL_TICKS,
      'minAttackIntervalTicks',
    );
    this.attacksPerSecond = requirePositiveFinite(options.attacksPerSecond ?? DEFAULT_ATTACKS_PER_SECOND, 'attacksPerSecond');
    this.knockbackStrength = requireNonNegFinite(options.knockbackStrength ?? DEFAULT_KNOCKBACK_STRENGTH, 'knockbackStrength');
    this.invulnerabilityTicks = requireSafeNonNegInt(
      options.invulnerabilityTicks ?? DEFAULT_INVULNERABILITY_TICKS,
      'invulnerabilityTicks',
    );
    this.maxChargeTicks = requireSafeNonNegInt(options.maxChargeTicks ?? DEFAULT_MAX_CHARGE_TICKS, 'maxChargeTicks');
    this.minChargeTicks = requireSafeNonNegInt(options.minChargeTicks ?? DEFAULT_MIN_CHARGE_TICKS, 'minChargeTicks');
    if (this.minChargeTicks > this.maxChargeTicks) {
      throw new Error('Combat: minChargeTicks must not exceed maxChargeTicks');
    }
    this.maxFireOriginOffset = requirePositiveFinite(
      options.maxFireOriginOffset ?? DEFAULT_MAX_FIRE_ORIGIN_OFFSET,
      'maxFireOriginOffset',
    );
    this.baseArrowSpeed = requirePositiveFinite(options.baseArrowSpeed ?? DEFAULT_BASE_ARROW_SPEED, 'baseArrowSpeed');
    this.baseArrowDamage = requireNonNegFinite(options.baseArrowDamage ?? DEFAULT_BASE_ARROW_DAMAGE, 'baseArrowDamage');
    this.projectileKnockbackStrength = requireNonNegFinite(
      options.projectileKnockbackStrength ?? DEFAULT_PROJECTILE_KNOCKBACK_STRENGTH,
      'projectileKnockbackStrength',
    );
    this.maxProjectiles = requireSafeNonNegInt(options.maxProjectiles ?? DEFAULT_MAX_PROJECTILES, 'maxProjectiles');
    if (this.maxProjectiles <= 0) {
      throw new Error('Combat: maxProjectiles must be a positive integer');
    }
    this.infiniteAmmo = requireBoolean(options.infiniteAmmo ?? false, 'infiniteAmmo');
    const arc = requirePositiveFinite(options.shieldBlockArcDegrees ?? DEFAULT_SHIELD_BLOCK_ARC_DEGREES, 'shieldBlockArcDegrees');
    if (arc > 360) {
      throw new Error('Combat: shieldBlockArcDegrees must not exceed 360');
    }
    this.shieldBlockArcDegrees = arc;
    this.stepOptions = {
      gravity: requireNonNegFinite(options.gravity ?? DEFAULT_GRAVITY, 'gravity'),
      drag: requireNonNegFinite(options.drag ?? DEFAULT_DRAG, 'drag'),
      maxAgeTicks: requireSafeNonNegInt(options.maxAgeTicks ?? DEFAULT_MAX_AGE_TICKS, 'maxAgeTicks'),
      ownerImmunityTicks: requireSafeNonNegInt(options.ownerImmunityTicks ?? DEFAULT_OWNER_IMMUNITY_TICKS, 'ownerImmunityTicks'),
      hitboxSize: requirePositiveFinite(options.hitboxSize ?? DEFAULT_HITBOX_SIZE, 'hitboxSize'),
    };
  }

  /** Number of live (server-owned) projectiles. */
  get projectileCount(): number {
    return this.projectiles.size;
  }

  /** Snapshot of a live projectile's motion state, or null. */
  getProjectile(id: number): ProjectileState | null {
    const pid = requireSafeNonNegInt(id, 'id');
    const proj = this.projectiles.get(pid);
    return proj ? { ...proj } : null;
  }

  /** The currently recorded shield-raised state for `id`, or undefined if never set. */
  getShieldRaised(id: number): boolean | undefined {
    return this.shieldRaised.get(requireSafeNonNegInt(id, 'id'));
  }

  /**
   * Validate a melee attack request against the authoritative attacker position. On
   * acceptance, computes damage/knockback through 141 `resolveMeleeAttack` (server-measured
   * interval), evaluates 144 shield blocking, routes post-block damage through `sinks`, and
   * queues the hit event for the next replication batch.
   */
  submitMeleeAttack(
    attackerPos: Position3,
    request: MeleeAttackRequest,
    getTarget: (targetId: number) => CombatTarget | null,
    getAttackStats: (playerId: number) => AttackStats,
    sinks: CombatSinks,
  ): CombatResult {
    const pos = validatePosition(attackerPos, 'attackerPos');
    if (typeof request !== 'object' || request === null) {
      throw new Error('Combat: request must be an object');
    }
    const playerId = requireSafeNonNegInt(request.playerId, 'playerId');
    const requestId = requireSafeNonNegInt(request.requestId, 'requestId');
    const tick = requireSafeNonNegInt(request.tick, 'tick');
    const targetId = requireSafeNonNegInt(request.targetId, 'targetId');

    const target = getTarget(targetId);
    if (target === null || target === undefined) {
      return this.rejectMelee(requestId, tick, targetId, 'no_target');
    }
    const validatedTarget = validateTarget(target);

    if (!validatedTarget.alive) {
      return this.rejectMelee(requestId, tick, targetId, 'target_dead');
    }

    const dx = pos.x - validatedTarget.x;
    const dy = pos.y - validatedTarget.y;
    const dz = pos.z - validatedTarget.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > this.maxAttackReach + validatedTarget.radius) {
      return this.rejectMelee(requestId, tick, targetId, 'out_of_reach');
    }

    const last = this.lastAttackTick.get(playerId);
    if (last !== undefined && tick <= last) {
      return this.rejectMelee(requestId, tick, targetId, 'stale_tick');
    }
    if (last !== undefined && tick - last < this.minAttackIntervalTicks) {
      return this.rejectMelee(requestId, tick, targetId, 'attack_cooldown');
    }

    const stats = validateAttackStats(getAttackStats(playerId));
    const ticksSinceLastAttack = last === undefined ? tick : tick - last;
    const outcome = resolveMeleeAttack(
      this.invulnerability,
      targetId,
      tick,
      stats.baseDamage,
      ticksSinceLastAttack,
      this.attacksPerSecond,
      pos.x,
      pos.z,
      validatedTarget.x,
      validatedTarget.z,
      this.knockbackStrength,
      validatedTarget.velocity,
      this.invulnerabilityTicks,
    );
    this.lastAttackTick.set(playerId, tick);

    if (!outcome.applied) {
      const event: MeleeHitEvent = {
        attackerId: playerId,
        targetId,
        tick,
        applied: false,
        damage: 0,
        healthRemoved: 0,
        knockback: null,
        blocked: false,
        shieldDurabilityDamage: 0,
        killed: false,
      };
      this.pendingMeleeHits.push(event);
      return { accepted: true, kind: 'melee_attack', requestId, tick, targetId, hit: event };
    }

    const block = resolveShieldBlock(
      this.shieldRaised.get(targetId) ?? false,
      this.shieldCooldown.isDisabled(targetId, tick),
      validatedTarget.facingYawDegrees,
      validatedTarget.x,
      validatedTarget.z,
      pos.x,
      pos.z,
      outcome.damage,
      stats.isAxeAttack,
      this.shieldBlockArcDegrees,
    );
    if (block.shouldDisable) {
      this.shieldCooldown.disable(targetId, tick);
    }

    let healthRemoved = 0;
    let killed = false;
    if (block.damageAfterBlock > 0) {
      const app = validateDamageApplication(
        sinks.applyDamage(targetId, block.damageAfterBlock, 'player_attack', playerId, tick),
        'applyDamage',
      );
      healthRemoved = app.healthRemoved;
      killed = app.killed;
    }
    if (block.blocked) {
      sinks.applyShieldDurabilityDamage(targetId, block.durabilityDamage, tick);
    }

    const event: MeleeHitEvent = {
      attackerId: playerId,
      targetId,
      tick,
      applied: true,
      damage: outcome.damage,
      healthRemoved,
      knockback: block.blocked ? null : outcome.knockback,
      blocked: block.blocked,
      shieldDurabilityDamage: block.blocked ? block.durabilityDamage : 0,
      killed,
    };
    this.pendingMeleeHits.push(event);
    return { accepted: true, kind: 'melee_attack', requestId, tick, targetId, hit: event };
  }

  /**
   * Validate a shield-block request: records the defender's raised state (keyed by the id the
   * host exposes through `getTarget`) with stale-tick rejection.
   */
  submitShieldBlock(request: ShieldBlockRequest): CombatResult {
    if (typeof request !== 'object' || request === null) {
      throw new Error('Combat: request must be an object');
    }
    const playerId = requireSafeNonNegInt(request.playerId, 'playerId');
    const requestId = requireSafeNonNegInt(request.requestId, 'requestId');
    const tick = requireSafeNonNegInt(request.tick, 'tick');
    const raised = requireBoolean(request.raised, 'raised');

    const last = this.lastShieldTick.get(playerId);
    if (last !== undefined && tick <= last) {
      return { accepted: false, kind: 'shield_block', requestId, tick, reason: 'stale_tick' };
    }
    this.lastShieldTick.set(playerId, tick);
    this.shieldRaised.set(playerId, raised);
    return { accepted: true, kind: 'shield_block', requestId, tick, raised };
  }

  /**
   * Validate a projectile fire request against the authoritative attacker position: charge
   * clamp/bounds, stale-tick and charge-plausibility (cooldown) checks, ammo, origin
   * plausibility, direction validity, and the live-projectile cap. On acceptance, computes
   * the 143 fire velocity, mints and registers the projectile, consumes one arrow, and queues
   * the spawn event.
   */
  submitProjectileFire(
    request: ProjectileFireRequest,
    attackerPos: Position3,
    ammo: { getArrowCount: () => number; consumeArrow: () => void },
    spawnProjectile: (desc: ProjectileSpawnDescriptor) => void,
  ): CombatResult {
    if (typeof request !== 'object' || request === null) {
      throw new Error('Combat: request must be an object');
    }
    const playerId = requireSafeNonNegInt(request.playerId, 'playerId');
    const requestId = requireSafeNonNegInt(request.requestId, 'requestId');
    const tick = requireSafeNonNegInt(request.tick, 'tick');
    if (!Number.isSafeInteger(request.chargeTicks) || request.chargeTicks < 0) {
      throw new Error('Combat: chargeTicks must be a non-negative safe integer');
    }
    const pos = validatePosition(attackerPos, 'attackerPos');
    const origin = validatePosition(request.origin, 'origin');
    const direction = validateDirection(request.direction, 'direction');

    const charge = Math.min(request.chargeTicks, this.maxChargeTicks);
    if (charge < this.minChargeTicks) {
      return this.rejectFire(requestId, tick, 'not_charged');
    }

    const last = this.lastFireTick.get(playerId);
    if (last !== undefined && tick <= last) {
      return this.rejectFire(requestId, tick, 'stale_tick');
    }
    const elapsed = last === undefined ? tick : tick - last;
    if (charge > elapsed) {
      return this.rejectFire(requestId, tick, 'fire_too_fast');
    }

    const arrowCount = requireSafeNonNegInt(ammo.getArrowCount(), 'arrow count');
    if (!canFireBow(arrowCount, this.infiniteAmmo)) {
      return this.rejectFire(requestId, tick, 'no_ammo');
    }

    const dxo = origin.x - pos.x;
    const dyo = origin.y - pos.y;
    const dzo = origin.z - pos.z;
    if (Math.sqrt(dxo * dxo + dyo * dyo + dzo * dzo) > this.maxFireOriginOffset) {
      return this.rejectFire(requestId, tick, 'origin_mismatch');
    }

    const dlen = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (dlen < 1e-9) {
      return this.rejectFire(requestId, tick, 'invalid_direction');
    }

    if (this.projectiles.size >= this.maxProjectiles) {
      return this.rejectFire(requestId, tick, 'max_projectiles');
    }

    const pullProgress = bowPullProgress(charge);
    const velocity = computeFireVelocity(direction.x, direction.y, direction.z, pullProgress, this.baseArrowSpeed);
    const projectileId = this.nextProjectileId++;
    const spawn: ProjectileSpawnDescriptor = {
      id: projectileId,
      ownerId: playerId,
      origin,
      velocity,
      spawnTick: tick,
    };
    this.projectiles.set(projectileId, {
      x: origin.x,
      y: origin.y,
      z: origin.z,
      vx: velocity.vx,
      vy: velocity.vy,
      vz: velocity.vz,
      ownerId: playerId,
      ageTicks: 0,
    });
    this.lastFireTick.set(playerId, tick);
    ammo.consumeArrow();
    this.pendingSpawns.push(spawn);
    spawnProjectile(spawn);
    return { accepted: true, kind: 'projectile_fire', requestId, tick, projectileId, spawn };
  }

  /**
   * Step every live projectile through 142 `stepProjectile` in id-ascending order, resolve
   * entity impacts (i-frame gate, 143 arrow damage from the pre-impact speed, 144 shield
   * check, 141 knockback, damage sink), block impacts, and age expiry; then assemble and
   * drain the `CombatReplicationBatch` (queued melee hits and spawns included).
   */
  stepProjectiles(
    tick: number,
    world: ShapeWorld,
    resolver: CollisionResolver,
    getTargets: () => readonly CombatTarget[],
    sinks: CombatSinks,
  ): CombatReplicationBatch {
    const t = requireSafeNonNegInt(tick, 'tick');
    const targets = validateTargets(getTargets());
    const projectileTargets: ProjectileTarget[] = targets
      .filter((tg) => tg.alive)
      .map((tg) => ({ id: tg.id, x: tg.x, y: tg.y, z: tg.z, radius: tg.radius }));

    const steps: ProjectileStepUpdate[] = [];
    const hits: ProjectileHitEvent[] = [];
    const stepDespawns: number[] = [];

    for (const id of [...this.projectiles.keys()].sort((a, b) => a - b)) {
      const proj = this.projectiles.get(id);
      if (!proj) continue;

      const prevSpeed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy + proj.vz * proj.vz);
      const result = stepProjectile(world, resolver, proj, projectileTargets, this.stepOptions);

      if (result.expired) {
        this.projectiles.delete(id);
        stepDespawns.push(id);
        continue;
      }
      if (result.hitEntityId !== null) {
        const hitTarget = targets.find((tg) => tg.id === result.hitEntityId);
        if (hitTarget) {
          hits.push(this.resolveProjectileEntityHit(id, proj, result.hitEntityId, hitTarget, prevSpeed, t, sinks));
        }
        this.projectiles.delete(id);
        continue;
      }
      if (result.hitBlock !== null) {
        hits.push({
          id,
          tick: t,
          targetId: null,
          position: { ...result.hitBlock },
          applied: false,
          damage: 0,
          healthRemoved: 0,
          knockback: null,
          blocked: false,
          shieldDurabilityDamage: 0,
          killed: false,
        });
        this.projectiles.delete(id);
        continue;
      }
      this.projectiles.set(id, result.state);
      steps.push({
        id,
        position: { x: result.state.x, y: result.state.y, z: result.state.z },
        velocity: { vx: result.state.vx, vy: result.state.vy, vz: result.state.vz },
      });
    }

    const meleeHits = this.pendingMeleeHits.splice(0, this.pendingMeleeHits.length);
    const spawns = this.pendingSpawns.splice(0, this.pendingSpawns.length).sort((a, b) => a.id - b.id);
    const hostDespawns = this.pendingDespawns.splice(0, this.pendingDespawns.length);
    const despawns = [...new Set([...hostDespawns, ...stepDespawns])].sort((a, b) => a - b);

    return {
      tick: t,
      meleeHits,
      projectileSpawns: spawns,
      projectileSteps: steps,
      projectileHits: hits,
      projectileDespawns: despawns,
    };
  }

  /** Host-driven projectile removal (e.g. despawn); queues a despawn event for the next batch. */
  removeProjectile(id: number): boolean {
    const pid = requireSafeNonNegInt(id, 'id');
    if (!this.projectiles.has(pid)) return false;
    this.projectiles.delete(pid);
    this.pendingDespawns.push(pid);
    return true;
  }

  /** Restore the pristine empty state (trackers, projectiles, queues, id minting). */
  reset(): void {
    this.lastAttackTick.clear();
    this.lastFireTick.clear();
    this.lastShieldTick.clear();
    this.shieldRaised.clear();
    this.invulnerability.clear();
    this.shieldCooldown.clear();
    this.projectiles.clear();
    this.nextProjectileId = 0;
    this.pendingMeleeHits.length = 0;
    this.pendingSpawns.length = 0;
    this.pendingDespawns.length = 0;
  }

  private rejectMelee(requestId: number, tick: number, targetId: number, reason: CombatRejectionReason): CombatResult {
    return { accepted: false, kind: 'melee_attack', requestId, tick, targetId, reason };
  }

  private rejectFire(requestId: number, tick: number, reason: CombatRejectionReason): CombatResult {
    return { accepted: false, kind: 'projectile_fire', requestId, tick, reason };
  }

  private resolveProjectileEntityHit(
    id: number,
    proj: ProjectileState,
    targetId: number,
    target: CombatTarget,
    impactSpeed: number,
    tick: number,
    sinks: CombatSinks,
  ): ProjectileHitEvent {
    if (!this.invulnerability.canDamage(targetId, tick, this.invulnerabilityTicks)) {
      return {
        id,
        tick,
        targetId,
        position: null,
        applied: false,
        damage: 0,
        healthRemoved: 0,
        knockback: null,
        blocked: false,
        shieldDurabilityDamage: 0,
        killed: false,
      };
    }

    const damage = computeArrowDamage(impactSpeed, this.baseArrowDamage);
    const block = resolveShieldBlock(
      this.shieldRaised.get(targetId) ?? false,
      this.shieldCooldown.isDisabled(targetId, tick),
      target.facingYawDegrees,
      target.x,
      target.z,
      proj.x,
      proj.z,
      damage,
      false,
      this.shieldBlockArcDegrees,
    );
    if (block.shouldDisable) {
      this.shieldCooldown.disable(targetId, tick);
    }

    let healthRemoved = 0;
    let killed = false;
    if (block.damageAfterBlock > 0) {
      const app = validateDamageApplication(
        sinks.applyDamage(targetId, block.damageAfterBlock, 'arrow', proj.ownerId ?? -1, tick),
        'applyDamage',
      );
      healthRemoved = app.healthRemoved;
      killed = app.killed;
    }
    if (block.blocked) {
      sinks.applyShieldDurabilityDamage(targetId, block.durabilityDamage, tick);
    } else {
      this.invulnerability.registerHit(targetId, tick);
    }

    return {
      id,
      tick,
      targetId,
      position: null,
      applied: true,
      damage,
      healthRemoved,
      knockback: block.blocked ? null : computeKnockback(proj.x, proj.z, target.x, target.z, this.projectileKnockbackStrength, target.velocity),
      blocked: block.blocked,
      shieldDurabilityDamage: block.blocked ? block.durabilityDamage : 0,
      killed,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side reconciler
// ────────────────────────────────────────────────────────────────────────────

export type CombatRollbackDirective =
  | { readonly kind: 'attack'; readonly requestId: number; readonly targetId: number; readonly reason: string }
  | { readonly kind: 'fire'; readonly requestId: number; readonly reason: string }
  | { readonly kind: 'shield'; readonly requestId: number; readonly reason: string };

/**
 * Client-side combat prediction tracker and reconciliation resolver: records attack/fire
 * predictions by client `requestId` and resolves them against server `CombatResult`s,
 * returning a rollback directive when the server rejects, the target was invulnerable, or
 * the hit was shield-blocked.
 */
export class ClientCombatReconciler {
  private readonly predictions = new Map<number, { readonly kind: 'attack' | 'fire' }>();

  /** Number of pending unconfirmed predictions. */
  get pendingCount(): number {
    return this.predictions.size;
  }

  /** Whether a prediction for `requestId` is pending. */
  hasPending(requestId: number): boolean {
    return this.predictions.has(requireSafeNonNegInt(requestId, 'requestId'));
  }

  /** Record an optimistic melee attack prediction. */
  predictAttack(requestId: number, targetId: number): void {
    const rid = requireSafeNonNegInt(requestId, 'requestId');
    requireSafeNonNegInt(targetId, 'targetId');
    this.recordPrediction(rid, 'attack');
  }

  /** Record an optimistic projectile fire prediction. */
  predictFire(requestId: number, projectileId: number): void {
    const rid = requireSafeNonNegInt(requestId, 'requestId');
    requireSafeNonNegInt(projectileId, 'projectileId');
    this.recordPrediction(rid, 'fire');
  }

  /**
   * Resolve a server result against the matching prediction. Unknown request ids are a
   * lenient no-op returning null (mirrors 230). Returns a rollback directive for rejected
   * requests, invulnerable hits (`'invulnerable'`), and shield-blocked hits (`'blocked'`);
   * null confirms the prediction.
   */
  reconcile(result: CombatResult): CombatRollbackDirective | null {
    if (typeof result !== 'object' || result === null) {
      throw new Error('Combat: result must be an object');
    }
    const requestId = requireSafeNonNegInt(result.requestId, 'result.requestId');
    const prediction = this.predictions.get(requestId);
    if (!prediction) return null;
    this.predictions.delete(requestId);

    if (result.accepted) {
      if (result.kind === 'melee_attack') {
        if (!result.hit.applied) {
          return { kind: 'attack', requestId, targetId: result.targetId, reason: 'invulnerable' };
        }
        if (result.hit.blocked) {
          return { kind: 'attack', requestId, targetId: result.targetId, reason: 'blocked' };
        }
        return null;
      }
      return null; // projectile_fire and shield_block acceptance confirm
    }

    if (result.kind === 'melee_attack') {
      return { kind: 'attack', requestId, targetId: result.targetId, reason: result.reason };
    }
    if (result.kind === 'projectile_fire') {
      return { kind: 'fire', requestId, reason: result.reason };
    }
    return { kind: 'shield', requestId, reason: result.reason };
  }

  /** Clear all pending predictions. */
  reset(): void {
    this.predictions.clear();
  }

  private recordPrediction(requestId: number, kind: 'attack' | 'fire'): void {
    if (this.predictions.has(requestId)) {
      throw new Error(`Combat: duplicate prediction requestId ${requestId}`);
    }
    this.predictions.set(requestId, { kind });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side projectile store
// ────────────────────────────────────────────────────────────────────────────

export interface ClientProjectileState {
  readonly id: number;
  readonly ownerId: number | null;
  readonly position: Position3;
  readonly velocity: Velocity3;
}

/** Internal mutable projectile record (position/velocity updated by batch steps). */
interface MutableClientProjectile {
  id: number;
  ownerId: number | null;
  position: Position3;
  velocity: Velocity3;
}

/**
 * Client-side authoritative projectile mirror: applies `CombatReplicationBatch` entries
 * (spawns, steps, hits, despawns) deterministically and answers projectile queries.
 */
export class ClientCombatStore {
  private readonly projectiles = new Map<number, MutableClientProjectile>();

  /** Number of mirrored projectiles. */
  get size(): number {
    return this.projectiles.size;
  }

  /** Whether a projectile replica exists. */
  hasProjectile(id: number): boolean {
    return this.projectiles.has(requireSafeNonNegInt(id, 'id'));
  }

  /** Snapshot of a projectile replica, or null. */
  getProjectile(id: number): ClientProjectileState | null {
    const pid = requireSafeNonNegInt(id, 'id');
    const proj = this.projectiles.get(pid);
    if (!proj) return null;
    return { id: proj.id, ownerId: proj.ownerId, position: { ...proj.position }, velocity: { ...proj.velocity } };
  }

  /** All projectile replicas ordered by id ascending. */
  getAll(): readonly ClientProjectileState[] {
    const out: ClientProjectileState[] = [];
    for (const id of [...this.projectiles.keys()].sort((a, b) => a - b)) {
      const proj = this.projectiles.get(id);
      if (proj) {
        out.push({ id: proj.id, ownerId: proj.ownerId, position: { ...proj.position }, velocity: { ...proj.velocity } });
      }
    }
    return out;
  }

  /**
   * Apply a server replication batch: spawns insert/replace, steps update known projectiles
   * (unknown ids ignored), hits and despawns remove.
   */
  applyBatch(batch: CombatReplicationBatch): void {
    if (typeof batch !== 'object' || batch === null) {
      throw new Error('Combat: batch must be an object');
    }
    requireSafeNonNegInt(batch.tick, 'batch.tick');

    if (Array.isArray(batch.projectileSpawns)) {
      for (const spawn of batch.projectileSpawns) {
        const desc = validateSpawnDescriptor(spawn);
        this.projectiles.set(desc.id, {
          id: desc.id,
          ownerId: desc.ownerId,
          position: { ...desc.origin },
          velocity: { ...desc.velocity },
        });
      }
    }

    if (Array.isArray(batch.projectileSteps)) {
      for (const step of batch.projectileSteps) {
        if (typeof step !== 'object' || step === null) continue;
        const id = requireSafeNonNegInt(step.id, 'step.id');
        const existing = this.projectiles.get(id);
        if (!existing) continue;
        existing.position = { ...validatePosition(step.position, 'step.position') };
        existing.velocity = { ...validateVelocity(step.velocity, 'step.velocity') };
      }
    }

    if (Array.isArray(batch.projectileHits)) {
      for (const hit of batch.projectileHits) {
        if (typeof hit !== 'object' || hit === null) continue;
        this.projectiles.delete(requireSafeNonNegInt(hit.id, 'hit.id'));
      }
    }

    if (Array.isArray(batch.projectileDespawns)) {
      for (const id of batch.projectileDespawns) {
        this.projectiles.delete(requireSafeNonNegInt(id, 'projectileDespawns entry'));
      }
    }
  }

  /** Clear all projectile replicas. */
  reset(): void {
    this.projectiles.clear();
  }
}
