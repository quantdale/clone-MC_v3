import { describe, it, expect } from 'vitest';
import {
  attackCooldownProgress,
  cooldownDamageMultiplier,
  computeAttackDamage,
  computeKnockback,
  InvulnerabilityTracker,
  resolveMeleeAttack,
  DEFAULT_INVULNERABILITY_TICKS,
} from '../../src/simulation/MeleeCombat';

describe('attackCooldownProgress', () => {
  it('is non-decreasing and reaches exactly 1 at the full cooldown duration', () => {
    const attacksPerSecond = 4; // cooldown duration = 20/4 = 5 ticks
    const p0 = attackCooldownProgress(0, attacksPerSecond);
    const p2 = attackCooldownProgress(2, attacksPerSecond);
    const p10 = attackCooldownProgress(10, attacksPerSecond);

    expect(p0).toBeGreaterThanOrEqual(0);
    expect(p2).toBeGreaterThanOrEqual(p0);
    expect(p10).toBe(1);
  });

  it('never leaves [0, 1] even for negative ticks', () => {
    expect(attackCooldownProgress(-100, 4)).toBe(0);
  });
});

describe('cooldownDamageMultiplier', () => {
  it('matches the vanilla formula at 0, 0.5, and 1', () => {
    expect(cooldownDamageMultiplier(0)).toBeCloseTo(0.2);
    expect(cooldownDamageMultiplier(0.5)).toBeCloseTo(0.4);
    expect(cooldownDamageMultiplier(1)).toBeCloseTo(1.0);
  });
});

describe('computeAttackDamage', () => {
  it('scales base damage by the cooldown multiplier', () => {
    const damage = computeAttackDamage(10, 100, 4); // fully charged
    expect(damage).toBeCloseTo(10);
  });
});

describe('computeKnockback', () => {
  it('halves existing velocity and adds a full-strength horizontal impulse plus vertical pop', () => {
    const result = computeKnockback(0, 0, 1, 0, 2, { vx: 2, vy: 0, vz: 0 });
    expect(result).toEqual({ vx: 1 + 2, vy: 0.4, vz: 0 });
  });

  it('falls back to halved velocity plus vertical pop with no horizontal impulse at the same position', () => {
    const result = computeKnockback(5, 5, 5, 5, 3, { vx: 4, vy: -2, vz: 6 });
    expect(result).toEqual({ vx: 2, vy: -1 + 0.4, vz: 3 });
  });
});

describe('InvulnerabilityTracker', () => {
  it('gates damage within the invulnerability window and reopens after it elapses', () => {
    const tracker = new InvulnerabilityTracker();
    tracker.registerHit(1, 100);

    expect(tracker.canDamage(1, 105, 10)).toBe(false);
    expect(tracker.canDamage(1, 109, 10)).toBe(false);
    expect(tracker.canDamage(1, 110, 10)).toBe(true);
  });

  it('treats a never-hit id as damageable', () => {
    const tracker = new InvulnerabilityTracker();
    expect(tracker.canDamage(42, 0)).toBe(true);
  });

  it('clear(id) restores canDamage for that id', () => {
    const tracker = new InvulnerabilityTracker();
    tracker.registerHit(1, 100);
    tracker.clear(1);
    expect(tracker.canDamage(1, 101, 10)).toBe(true);
  });

  it('clear() with no argument resets every tracked id', () => {
    const tracker = new InvulnerabilityTracker();
    tracker.registerHit(1, 100);
    tracker.registerHit(2, 100);
    tracker.clear();
    expect(tracker.canDamage(1, 101, 10)).toBe(true);
    expect(tracker.canDamage(2, 101, 10)).toBe(true);
  });

  it('uses DEFAULT_INVULNERABILITY_TICKS when no window is supplied', () => {
    const tracker = new InvulnerabilityTracker();
    tracker.registerHit(1, 0);
    expect(tracker.canDamage(1, DEFAULT_INVULNERABILITY_TICKS - 1)).toBe(false);
    expect(tracker.canDamage(1, DEFAULT_INVULNERABILITY_TICKS)).toBe(true);
  });
});

describe('resolveMeleeAttack', () => {
  it('blocks an attack during the invulnerability window and registers no hit', () => {
    const tracker = new InvulnerabilityTracker();
    tracker.registerHit(1, 100);

    const result = resolveMeleeAttack(
      tracker, 1, 105, 10, 100, 4, 0, 0, 1, 0, 2, { vx: 0, vy: 0, vz: 0 }, 10,
    );

    expect(result).toEqual({ applied: false, damage: 0, knockback: null });
    // No new hit registered: the original hit's window still governs.
    expect(tracker.canDamage(1, 110, 10)).toBe(true);
  });

  it('applies a successful attack matching the underlying formulas and registers exactly one hit', () => {
    const tracker = new InvulnerabilityTracker();

    const result = resolveMeleeAttack(
      tracker, 1, 200, 10, 100, 4, 0, 0, 1, 0, 2, { vx: 2, vy: 0, vz: 0 }, 10,
    );

    expect(result.applied).toBe(true);
    expect(result.damage).toBeCloseTo(computeAttackDamage(10, 100, 4));
    expect(result.knockback).toEqual(computeKnockback(0, 0, 1, 0, 2, { vx: 2, vy: 0, vz: 0 }));

    // Exactly one hit registered: immediately re-attacking is blocked.
    expect(tracker.canDamage(1, 201, 10)).toBe(false);
    expect(tracker.canDamage(1, 210, 10)).toBe(true);
  });
});
