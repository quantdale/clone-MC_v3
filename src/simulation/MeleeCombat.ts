/**
 * Java 1.9+-style melee combat math (141): attack-cooldown damage scaling,
 * knockback, and per-target invulnerability-frame tracking, composed by
 * `resolveMeleeAttack`. No critical hits, no `SurvivalSystem`/`EntityManager`
 * application, no attribute-registry lookups, and no `Game`/mob-AI wiring —
 * see `openspec/changes/141-melee-combat-cooldown/design.md`.
 */

/** Default invulnerability window in ticks (0.5s at 20 TPS). */
export const DEFAULT_INVULNERABILITY_TICKS = 10;

/**
 * Attack-cooldown charge in `[0, 1]`: `0` immediately after an attack, rising
 * to `1` once `ticksSinceLastAttack` reaches the full cooldown duration
 * (`20 / attacksPerSecond` ticks). Matches the vanilla `(t + 0.5) / duration`
 * formula.
 */
export function attackCooldownProgress(ticksSinceLastAttack: number, attacksPerSecond: number): number {
  const ticksPerAttack = 20 / attacksPerSecond;
  const progress = (ticksSinceLastAttack + 0.5) / ticksPerAttack;
  return Math.max(0, Math.min(1, progress));
}

/** Vanilla's damage multiplier for a given cooldown charge: `0.2` at `0`, `1.0` at `1`. */
export function cooldownDamageMultiplier(progress: number): number {
  return 0.2 + progress * progress * 0.8;
}

/** `baseDamage` scaled by the attacker's current attack-cooldown charge. */
export function computeAttackDamage(
  baseDamage: number,
  ticksSinceLastAttack: number,
  attacksPerSecond: number,
): number {
  return baseDamage * cooldownDamageMultiplier(attackCooldownProgress(ticksSinceLastAttack, attacksPerSecond));
}

/** A velocity impulse. */
export interface Velocity3 {
  vx: number;
  vy: number;
  vz: number;
}

/** A knockback velocity impulse. */
export type KnockbackVector = Velocity3;

/** Fixed vertical knockback pop, matching vanilla's base upward component. */
const KNOCKBACK_VERTICAL_POP = 0.4;

/**
 * Knockback impulse: the target's existing velocity halved, plus (when the
 * horizontal attacker→target distance is non-negligible) a unit-direction
 * horizontal push scaled by `strength`, plus a fixed vertical pop (always
 * added, even in the degenerate same-position case).
 */
export function computeKnockback(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  strength: number,
  existingVelocity: Velocity3,
): KnockbackVector {
  const halved: Velocity3 = {
    vx: existingVelocity.vx / 2,
    vy: existingVelocity.vy / 2,
    vz: existingVelocity.vz / 2,
  };
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 1e-6) {
    return { vx: halved.vx, vy: halved.vy + KNOCKBACK_VERTICAL_POP, vz: halved.vz };
  }
  return {
    vx: halved.vx + (dx / dist) * strength,
    vy: halved.vy + KNOCKBACK_VERTICAL_POP,
    vz: halved.vz + (dz / dist) * strength,
  };
}

/** Tracks the last-hit tick per target id to gate damage during invulnerability frames. */
export class InvulnerabilityTracker {
  private readonly lastHitTick = new Map<number, number>();

  /** Whether `entityId` may currently be damaged again. */
  canDamage(
    entityId: number,
    currentTick: number,
    invulnerabilityTicks: number = DEFAULT_INVULNERABILITY_TICKS,
  ): boolean {
    const last = this.lastHitTick.get(entityId);
    if (last === undefined) return true;
    return currentTick - last >= invulnerabilityTicks;
  }

  /** Record that `entityId` was hit at `currentTick`. */
  registerHit(entityId: number, currentTick: number): void {
    this.lastHitTick.set(entityId, currentTick);
  }

  /** Clear one tracked id, or every id when called with no argument. */
  clear(entityId?: number): void {
    if (entityId === undefined) {
      this.lastHitTick.clear();
    } else {
      this.lastHitTick.delete(entityId);
    }
  }
}

/** Outcome of one `resolveMeleeAttack` attempt. */
export interface MeleeAttackResult {
  applied: boolean;
  damage: number;
  knockback: KnockbackVector | null;
}

/**
 * Resolve one melee attack attempt against `targetId`: blocked (no damage, no
 * knockback, no hit registered) while the target is invulnerable; otherwise
 * computes cooldown-scaled damage and knockback, registers the hit, and
 * returns both.
 */
export function resolveMeleeAttack(
  tracker: InvulnerabilityTracker,
  targetId: number,
  currentTick: number,
  baseDamage: number,
  ticksSinceLastAttack: number,
  attacksPerSecond: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  knockbackStrength: number,
  targetVelocity: Velocity3,
  invulnerabilityTicks: number = DEFAULT_INVULNERABILITY_TICKS,
): MeleeAttackResult {
  if (!tracker.canDamage(targetId, currentTick, invulnerabilityTicks)) {
    return { applied: false, damage: 0, knockback: null };
  }
  const damage = computeAttackDamage(baseDamage, ticksSinceLastAttack, attacksPerSecond);
  const knockback = computeKnockback(fromX, fromZ, toX, toZ, knockbackStrength, targetVelocity);
  tracker.registerHit(targetId, currentTick);
  return { applied: true, damage, knockback };
}
