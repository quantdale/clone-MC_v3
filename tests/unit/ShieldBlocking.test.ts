import { describe, expect, it } from 'vitest';
import {
  SHIELD_BLOCK_ARC_DEGREES,
  SHIELD_DISABLE_TICKS,
  ShieldCooldownTracker,
  angleBetweenYawDegrees,
  bearingYawDegrees,
  computeShieldDurabilityDamage,
  isWithinBlockingArc,
  resolveShieldBlock,
} from '../../src/simulation/ShieldBlocking';

describe('bearingYawDegrees', () => {
  it('returns distinct, correctly signed bearings at the four cardinal directions', () => {
    const north = bearingYawDegrees(0, 0, 0, 1); // +Z
    const east = bearingYawDegrees(0, 0, 1, 0); // +X
    const south = bearingYawDegrees(0, 0, 0, -1); // -Z
    const west = bearingYawDegrees(0, 0, -1, 0); // -X

    expect(north).toBeCloseTo(0);
    expect(east).toBeCloseTo(90);
    expect(Math.abs(south)).toBeCloseTo(180);
    expect(west).toBeCloseTo(-90);

    const bearings = new Set([north, east, Math.abs(south), west]);
    expect(bearings.size).toBe(4);
  });

  it('stays within (-180, 180]', () => {
    const offsets: Array<[number, number]> = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    for (const [dx, dz] of offsets) {
      const bearing = bearingYawDegrees(0, 0, dx, dz);
      expect(bearing).toBeGreaterThan(-180);
      expect(bearing).toBeLessThanOrEqual(180);
    }
  });
});

describe('angleBetweenYawDegrees', () => {
  it('handles wraparound near +-180', () => {
    expect(angleBetweenYawDegrees(170, -170)).toBeCloseTo(20);
  });

  it('returns 0 for identical bearings', () => {
    expect(angleBetweenYawDegrees(45, 45)).toBe(0);
  });

  it('returns 180 for opposite bearings', () => {
    expect(angleBetweenYawDegrees(0, 180)).toBeCloseTo(180);
  });

  it('stays within [0, 180]', () => {
    expect(angleBetweenYawDegrees(-90, 170)).toBeLessThanOrEqual(180);
    expect(angleBetweenYawDegrees(-90, 170)).toBeGreaterThanOrEqual(0);
  });
});

describe('isWithinBlockingArc', () => {
  it('is true when the attacker is directly ahead', () => {
    // Defender at origin facing bearing 0 (+Z); attacker one block along +Z.
    expect(isWithinBlockingArc(0, 0, 1, 0, 0)).toBe(true);
  });

  it('is true exactly at the arc edge', () => {
    const arc = SHIELD_BLOCK_ARC_DEGREES;
    const edgeBearing = arc / 2;
    const rad = (edgeBearing * Math.PI) / 180;
    const attackerX = Math.sin(rad);
    const attackerZ = Math.cos(rad);
    expect(isWithinBlockingArc(0, attackerX, attackerZ, 0, 0, arc)).toBe(true);
  });

  it('is false just past the arc edge', () => {
    const arc = SHIELD_BLOCK_ARC_DEGREES;
    const pastEdgeBearing = arc / 2 + 1;
    const rad = (pastEdgeBearing * Math.PI) / 180;
    const attackerX = Math.sin(rad);
    const attackerZ = Math.cos(rad);
    expect(isWithinBlockingArc(0, attackerX, attackerZ, 0, 0, arc)).toBe(false);
  });

  it('is false when the attacker is directly behind', () => {
    expect(isWithinBlockingArc(0, 0, -1, 0, 0)).toBe(false);
  });
});

describe('computeShieldDurabilityDamage', () => {
  it('floors small hits to at least 1', () => {
    expect(computeShieldDurabilityDamage(0.1)).toBe(1);
  });

  it('is non-decreasing as damage increases', () => {
    const low = computeShieldDurabilityDamage(2);
    const high = computeShieldDurabilityDamage(8);
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it('ceils fractional damage above 1', () => {
    expect(computeShieldDurabilityDamage(3.2)).toBe(4);
  });
});

describe('resolveShieldBlock', () => {
  const attackerX = 0;
  const attackerZ = 1; // directly ahead of a defender facing bearing 0

  it('does not block when the shield is not raised', () => {
    const result = resolveShieldBlock(false, false, 0, 0, 0, attackerX, attackerZ, 6);
    expect(result.blocked).toBe(false);
    expect(result.damageAfterBlock).toBe(6);
    expect(result.durabilityDamage).toBe(0);
    expect(result.shouldDisable).toBe(false);
  });

  it('does not block when the shield is disabled', () => {
    const result = resolveShieldBlock(true, true, 0, 0, 0, attackerX, attackerZ, 6);
    expect(result.blocked).toBe(false);
    expect(result.damageAfterBlock).toBe(6);
    expect(result.durabilityDamage).toBe(0);
  });

  it('does not block when the attacker is outside the arc', () => {
    const result = resolveShieldBlock(true, false, 0, 0, 0, 0, -1, 6);
    expect(result.blocked).toBe(false);
    expect(result.damageAfterBlock).toBe(6);
    expect(result.durabilityDamage).toBe(0);
  });

  it('blocks when raised, not disabled, and within arc, echoing the axe-disable flag', () => {
    const result = resolveShieldBlock(true, false, 0, 0, 0, attackerX, attackerZ, 6, true);
    expect(result.blocked).toBe(true);
    expect(result.damageAfterBlock).toBe(0);
    expect(result.durabilityDamage).toBeGreaterThan(0);
    expect(result.shouldDisable).toBe(true);
  });

  it('echoes shouldDisable as false when isAxeAttack is not set', () => {
    const result = resolveShieldBlock(true, false, 0, 0, 0, attackerX, attackerZ, 6);
    expect(result.blocked).toBe(true);
    expect(result.shouldDisable).toBe(false);
  });
});

describe('ShieldCooldownTracker', () => {
  it('gates isDisabled within the disable window', () => {
    const tracker = new ShieldCooldownTracker();
    tracker.disable(1, 100, 100);
    expect(tracker.isDisabled(1, 100)).toBe(true);
    expect(tracker.isDisabled(1, 199)).toBe(true);
    expect(tracker.isDisabled(1, 200)).toBe(false);
  });

  it('defaults to SHIELD_DISABLE_TICKS when no duration is given', () => {
    const tracker = new ShieldCooldownTracker();
    tracker.disable(1, 0);
    expect(tracker.isDisabled(1, SHIELD_DISABLE_TICKS - 1)).toBe(true);
    expect(tracker.isDisabled(1, SHIELD_DISABLE_TICKS)).toBe(false);
  });

  it('returns false for an entity never disabled', () => {
    const tracker = new ShieldCooldownTracker();
    expect(tracker.isDisabled(42, 0)).toBe(false);
  });

  it('clear(id) restores isDisabled to false immediately', () => {
    const tracker = new ShieldCooldownTracker();
    tracker.disable(1, 100, 100);
    tracker.clear(1);
    expect(tracker.isDisabled(1, 150)).toBe(false);
  });

  it('clear() with no id clears all entries', () => {
    const tracker = new ShieldCooldownTracker();
    tracker.disable(1, 100, 100);
    tracker.disable(2, 100, 100);
    tracker.clear();
    expect(tracker.isDisabled(1, 150)).toBe(false);
    expect(tracker.isDisabled(2, 150)).toBe(false);
  });

  it('tracks multiple entities independently', () => {
    const tracker = new ShieldCooldownTracker();
    tracker.disable(1, 100, 50);
    expect(tracker.isDisabled(2, 100)).toBe(false);
    expect(tracker.isDisabled(1, 100)).toBe(true);
  });
});
