export const SHIELD_BLOCK_ARC_DEGREES = 90;
export const SHIELD_DISABLE_TICKS = 100; // 5s at 20 TPS
export const SHIELD_BLOCK_DAMAGE_REDUCTION = 1.0; // fraction of damage blocked (documented baseline)

/**
 * This module's own self-contained bearing convention: 0 degrees points along +Z,
 * increasing toward +X (atan2(dx, dz) in degrees). Independent of Player's radian,
 * -Z-forward convention or EntityTransform's degree convention — a caller converts
 * once at its own boundary before calling into this module.
 */
export function bearingYawDegrees(fromX: number, fromZ: number, toX: number, toZ: number): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}

export function angleBetweenYawDegrees(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function isWithinBlockingArc(
  defenderFacingYawDegrees: number,
  attackerX: number,
  attackerZ: number,
  defenderX: number,
  defenderZ: number,
  arcDegrees: number = SHIELD_BLOCK_ARC_DEGREES,
): boolean {
  const bearing = bearingYawDegrees(defenderX, defenderZ, attackerX, attackerZ);
  return angleBetweenYawDegrees(defenderFacingYawDegrees, bearing) <= arcDegrees / 2;
}

export function computeShieldDurabilityDamage(incomingDamage: number): number {
  return Math.max(1, Math.ceil(incomingDamage));
}

export interface ShieldBlockResult {
  blocked: boolean;
  damageAfterBlock: number;
  durabilityDamage: number;
  shouldDisable: boolean;
}

export function resolveShieldBlock(
  isRaised: boolean,
  isDisabled: boolean,
  defenderFacingYawDegrees: number,
  defenderX: number,
  defenderZ: number,
  attackerX: number,
  attackerZ: number,
  incomingDamage: number,
  isAxeAttack = false,
  arcDegrees: number = SHIELD_BLOCK_ARC_DEGREES,
): ShieldBlockResult {
  if (
    !isRaised ||
    isDisabled ||
    !isWithinBlockingArc(defenderFacingYawDegrees, attackerX, attackerZ, defenderX, defenderZ, arcDegrees)
  ) {
    return {
      blocked: false,
      damageAfterBlock: incomingDamage,
      durabilityDamage: 0,
      shouldDisable: false,
    };
  }

  return {
    blocked: true,
    damageAfterBlock: incomingDamage * (1 - SHIELD_BLOCK_DAMAGE_REDUCTION),
    durabilityDamage: computeShieldDurabilityDamage(incomingDamage),
    shouldDisable: isAxeAttack,
  };
}

export class ShieldCooldownTracker {
  private readonly disabledUntilTick = new Map<number, number>();

  disable(entityId: number, currentTick: number, durationTicks: number = SHIELD_DISABLE_TICKS): void {
    this.disabledUntilTick.set(entityId, currentTick + durationTicks);
  }

  isDisabled(entityId: number, currentTick: number): boolean {
    const untilTick = this.disabledUntilTick.get(entityId);
    return untilTick !== undefined && currentTick < untilTick;
  }

  clear(entityId?: number): void {
    if (entityId === undefined) {
      this.disabledUntilTick.clear();
    } else {
      this.disabledUntilTick.delete(entityId);
    }
  }
}
