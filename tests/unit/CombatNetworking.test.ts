import { describe, expect, it, vi } from 'vitest';
import {
  ClientCombatReconciler,
  ClientCombatStore,
  CombatValidator,
  type AttackStats,
  type CombatResult,
  type CombatSinks,
  type CombatTarget,
  type MeleeAttackRequest,
  type ProjectileFireRequest,
  type ShieldBlockRequest,
} from '../../src/simulation/CombatNetworking';
import { computeAttackDamage, computeKnockback } from '../../src/simulation/MeleeCombat';
import { computeArrowDamage } from '../../src/simulation/BowAndArrow';
import { stepProjectile } from '../../src/simulation/ProjectileCore';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';
import { SurvivalSystem } from '../../src/player/SurvivalSystem';
import type { ArmorProtection } from '../../src/player/ArmorProtection';

const resolver = new CollisionResolver();

class EmptyWorld implements ShapeWorld {
  getCollisionShape(): VoxelShape {
    return VoxelShape.EMPTY;
  }
}

/** A world with a full-cube floor at world-y in [floorCy, floorCy+1), empty elsewhere. */
class FloorWorld implements ShapeWorld {
  constructor(private readonly floorCy: number) {}
  getCollisionShape(_x: number, y: number, _z: number): VoxelShape {
    return Math.floor(y) === this.floorCy ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
  }
}

const emptyWorld = new EmptyWorld();
const TARGET: CombatTarget = {
  id: 7,
  x: 2,
  y: 0,
  z: 0,
  radius: 0.6,
  velocity: { vx: 0, vy: 0, vz: 0 },
  alive: true,
  facingYawDegrees: 0,
};

const DEFAULT_STATS: AttackStats = { baseDamage: 7, isAxeAttack: false };

function makeTarget(overrides: Partial<CombatTarget> = {}): CombatTarget {
  return { ...TARGET, ...overrides };
}

function makeSinks(): CombatSinks & { applyDamage: ReturnType<typeof vi.fn>; applyShieldDurabilityDamage: ReturnType<typeof vi.fn> } {
  const applyDamage = vi.fn((_targetId: number, amount: number, _type: string, _source: number, _tick: number) => ({
    healthRemoved: amount,
    killed: false,
  }));
  const applyShieldDurabilityDamage = vi.fn();
  return { applyDamage, applyShieldDurabilityDamage };
}

function attack(
  validator: CombatValidator,
  overrides: Partial<MeleeAttackRequest> = {},
  opts: {
    pos?: { x: number; y: number; z: number };
    getTarget?: (id: number) => CombatTarget | null;
    getAttackStats?: (id: number) => AttackStats;
    sinks?: CombatSinks;
  } = {},
): Extract<CombatResult, { kind: 'melee_attack' }> {
  return validator.submitMeleeAttack(
    opts.pos ?? { x: 0, y: 0, z: 0 },
    {
      playerId: 1,
      requestId: 1,
      tick: 100,
      targetId: 7,
      ...overrides,
    },
    opts.getTarget ?? (() => makeTarget()),
    opts.getAttackStats ?? (() => DEFAULT_STATS),
    opts.sinks ?? makeSinks(),
  ) as Extract<CombatResult, { kind: 'melee_attack' }>;
}

function fire(
  validator: CombatValidator,
  overrides: Partial<ProjectileFireRequest> = {},
  opts: {
    pos?: { x: number; y: number; z: number };
    arrows?: number;
    infiniteAmmo?: boolean;
  } = {},
): { result: Extract<CombatResult, { kind: 'projectile_fire' }>; arrowsLeft: number; spawned: unknown[] } {
  const arrows = { count: opts.arrows ?? 3 };
  const spawned: unknown[] = [];
  const result = validator.submitProjectileFire(
    {
      playerId: 1,
      requestId: 1,
      tick: 400,
      origin: { x: 0, y: 1.6, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
      chargeTicks: 20,
      ...overrides,
    },
    opts.pos ?? { x: 0, y: 0, z: 0 },
    {
      getArrowCount: () => arrows.count,
      consumeArrow: () => {
        // Host seam: never consume below zero (infinite ammo keeps the count unchanged).
        if (arrows.count > 0) arrows.count--;
      },
    },
    (desc) => spawned.push(desc),
  ) as Extract<CombatResult, { kind: 'projectile_fire' }>;
  return { result, arrowsLeft: arrows.count, spawned };
}

describe('CombatNetworking', () => {
  describe('REQ-1 Melee Attack Request Validation', () => {
    it('accepts an in-reach attack against a valid target with applied: true', () => {
      const validator = new CombatValidator();
      const result = attack(validator);
      expect(result).toMatchObject({ accepted: true, kind: 'melee_attack', targetId: 7 });
      if (result.accepted) {
        expect(result.hit.applied).toBe(true);
      }
    });

    it('accepts an attack at the exact reach boundary (inclusive)', () => {
      const validator = new CombatValidator({ maxAttackReach: 3.0 });
      const result = attack(validator, {}, { pos: { x: 0, y: 0, z: 0 }, getTarget: () => makeTarget({ x: 3.6, y: 0, z: 0 }) });
      expect(result.accepted).toBe(true);
    });

    it('rejects an attack beyond reach with out_of_reach', () => {
      const validator = new CombatValidator();
      const result = attack(validator, {}, { pos: { x: 0, y: 0, z: 0 }, getTarget: () => makeTarget({ x: 10, y: 0, z: 10 }) });
      expect(result).toEqual({
        accepted: false,
        kind: 'melee_attack',
        requestId: 1,
        tick: 100,
        targetId: 7,
        reason: 'out_of_reach',
      });
    });

    it('rejects an attack on an unknown target with no_target', () => {
      const validator = new CombatValidator();
      const result = attack(validator, {}, { getTarget: () => null });
      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.reason).toBe('no_target');
      }
    });

    it('rejects an attack on a dead target with target_dead', () => {
      const validator = new CombatValidator();
      const result = attack(validator, {}, { getTarget: () => makeTarget({ alive: false }) });
      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.reason).toBe('target_dead');
      }
    });

    it('rejects replayed or stale ticks with stale_tick', () => {
      const validator = new CombatValidator();
      expect(attack(validator).accepted).toBe(true);
      const sameTick = attack(validator, { tick: 100 });
      expect(sameTick).toMatchObject({ accepted: false, reason: 'stale_tick' });
      const lowerTick = attack(validator, { tick: 99 });
      expect(lowerTick).toMatchObject({ accepted: false, reason: 'stale_tick' });
    });

    it('rejects an attack inside the server interval with attack_cooldown', () => {
      const validator = new CombatValidator({ minAttackIntervalTicks: 10 });
      expect(attack(validator, { tick: 100 }).accepted).toBe(true);
      const fast = attack(validator, { tick: 105 });
      expect(fast).toMatchObject({ accepted: false, reason: 'attack_cooldown' });
    });

    it('leaves tracker state untouched when a request is rejected', () => {
      const validator = new CombatValidator({ minAttackIntervalTicks: 10 });
      expect(attack(validator, { tick: 100 }).accepted).toBe(true);
      expect(attack(validator, { tick: 105 }).accepted).toBe(false);
      // The rejection must not advance the attacker's tick: 110 is still exactly 10 after 100.
      expect(attack(validator, { tick: 110 }).accepted).toBe(true);
    });
  });

  describe('REQ-2 Authoritative Melee Damage and Knockback', () => {
    it('deals cooldown-scaled damage computed by the 141 math for a full-interval attack', () => {
      const validator = new CombatValidator({ attacksPerSecond: 1.6 });
      attack(validator, { tick: 100 });
      const result = attack(validator, { tick: 113 });
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.applied).toBe(true);
        expect(result.hit.damage).toBe(computeAttackDamage(7, 13, 1.6));
        expect(result.hit.healthRemoved).toBe(computeAttackDamage(7, 13, 1.6));
      }
    });

    it('scales damage down for a partial-cooldown interval', () => {
      const validator = new CombatValidator({ attacksPerSecond: 1.6, minAttackIntervalTicks: 10 });
      attack(validator, { tick: 100 });
      const result = attack(validator, { tick: 111 });
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.damage).toBe(computeAttackDamage(7, 11, 1.6));
        expect(result.hit.damage).toBeLessThan(7);
      }
    });

    it('measures the interval server-side for the first attack', () => {
      const validator = new CombatValidator({ attacksPerSecond: 1.6 });
      const result = attack(validator, { tick: 100 });
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.damage).toBe(computeAttackDamage(7, 100, 1.6));
      }
    });

    it('computes the knockback vector with the 141 math, pushing away from the attacker', () => {
      const validator = new CombatValidator({ knockbackStrength: 0.4 });
      const result = attack(validator, {}, { pos: { x: 0, y: 0, z: 0 }, getTarget: () => makeTarget({ x: 3, y: 0, z: 0 }) });
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.knockback).toEqual(computeKnockback(0, 0, 3, 0, 0.4, { vx: 0, vy: 0, vz: 0 }));
        expect(result.hit.knockback).not.toBeNull();
      }
    });

    it('registers a non-applied hit for an invulnerable target with no damage or knockback', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      // Attacker A registers an i-frame at tick 100.
      attack(validator, { playerId: 1, tick: 100 }, { sinks });
      // Attacker B hits the same target 5 ticks later (inside the 10-tick window).
      const result = attack(validator, { playerId: 2, tick: 105 }, { sinks });
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.applied).toBe(false);
        expect(result.hit.damage).toBe(0);
        expect(result.hit.healthRemoved).toBe(0);
        expect(result.hit.knockback).toBeNull();
      }
      // Only the first (vulnerable) hit reaches the sink; the invulnerable swing adds nothing.
      expect(sinks.applyDamage).toHaveBeenCalledTimes(1);
      expect(sinks.applyDamage).toHaveBeenCalledWith(7, 7, 'player_attack', 1, 100);
    });

    it('consumes the attacker cooldown on a non-applied swing', () => {
      const validator = new CombatValidator({ minAttackIntervalTicks: 10 });
      // A hits at 190 (i-frames until 200).
      attack(validator, { playerId: 1, tick: 190 });
      // B's swing at 195 is inside A's i-frame window -> applied: false but consumes B's cooldown.
      const swing = attack(validator, { playerId: 2, tick: 195 });
      expect(swing.accepted).toBe(true);
      if (swing.accepted) {
        expect(swing.hit.applied).toBe(false);
      }
      const followUp = attack(validator, { playerId: 2, tick: 200 });
      expect(followUp).toMatchObject({ accepted: false, reason: 'attack_cooldown' });
    });
  });

  describe('REQ-3 Shield Blocking', () => {
    function shieldRequest(overrides: Partial<ShieldBlockRequest> = {}): ShieldBlockRequest {
      return { playerId: 5, requestId: 1, tick: 300, raised: true, ...overrides };
    }

    it('records a shield raise request', () => {
      const validator = new CombatValidator();
      const result = validator.submitShieldBlock(shieldRequest());
      expect(result).toEqual({ accepted: true, kind: 'shield_block', requestId: 1, tick: 300, raised: true });
      expect(validator.getShieldRaised(5)).toBe(true);
    });

    it('records a shield lower request', () => {
      const validator = new CombatValidator();
      validator.submitShieldBlock(shieldRequest({ tick: 300, raised: true }));
      validator.submitShieldBlock(shieldRequest({ tick: 301, raised: false }));
      expect(validator.getShieldRaised(5)).toBe(false);
    });

    it('rejects a replayed shield request with stale_tick', () => {
      const validator = new CombatValidator();
      validator.submitShieldBlock(shieldRequest());
      const replay = validator.submitShieldBlock(shieldRequest({ tick: 300 }));
      const older = validator.submitShieldBlock(shieldRequest({ tick: 299 }));
      expect(replay).toMatchObject({ accepted: false, reason: 'stale_tick' });
      expect(older).toMatchObject({ accepted: false, reason: 'stale_tick' });
    });

    it('blocks a melee hit for a raised shield within the arc', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      // Defender at (4,0,0) facing the attacker at (0,0,0): bearing -90, facing -90.
      const target = makeTarget({ x: 4, y: 0, z: 0, facingYawDegrees: -90 });
      validator.submitShieldBlock({ playerId: 7, requestId: 1, tick: 100, raised: true });
      const result = attack(
        validator,
        { playerId: 1, tick: 200, targetId: 7 },
        { pos: { x: 1, y: 0, z: 0 }, getTarget: () => target, getAttackStats: () => ({ baseDamage: 6, isAxeAttack: false }), sinks },
      );
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.blocked).toBe(true);
        expect(result.hit.healthRemoved).toBe(0);
        expect(result.hit.damage).toBe(6);
        expect(result.hit.shieldDurabilityDamage).toBe(6);
        expect(result.hit.knockback).toBeNull();
        expect(result.hit.killed).toBe(false);
      }
      expect(sinks.applyDamage).not.toHaveBeenCalled();
      expect(sinks.applyShieldDurabilityDamage).toHaveBeenCalledWith(7, 6, 200);
    });

    it('does not block when the attacker is outside the shield arc', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      // Defender at (4,0,0) facing +90: bearing -90 differs by 180 -> outside arc.
      const target = makeTarget({ x: 4, y: 0, z: 0, facingYawDegrees: 90 });
      validator.submitShieldBlock({ playerId: 7, requestId: 1, tick: 100, raised: true });
      const result = attack(
        validator,
        { playerId: 1, tick: 200, targetId: 7 },
        { pos: { x: 1, y: 0, z: 0 }, getTarget: () => target, getAttackStats: () => ({ baseDamage: 6, isAxeAttack: false }), sinks },
      );
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.blocked).toBe(false);
        expect(result.hit.healthRemoved).toBe(6);
        expect(result.hit.knockback).not.toBeNull();
      }
      expect(sinks.applyDamage).toHaveBeenCalledWith(7, 6, 'player_attack', 1, 200);
    });

    it('disables the shield on an axe hit for the 144 cooldown duration', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      const target = makeTarget({ x: 4, y: 0, z: 0, facingYawDegrees: -90 });
      validator.submitShieldBlock({ playerId: 7, requestId: 1, tick: 100, raised: true });
      const axeHit = attack(
        validator,
        { playerId: 1, tick: 200, targetId: 7 },
        {
          pos: { x: 1, y: 0, z: 0 },
          getTarget: () => target,
          getAttackStats: () => ({ baseDamage: 6, isAxeAttack: true }),
          sinks,
        },
      );
      expect(axeHit.accepted).toBe(true);
      if (axeHit.accepted) {
        expect(axeHit.hit.blocked).toBe(true);
      }
      // Same attacker 10 ticks later: shield still raised but now disabled -> unblocked.
      const followUp = attack(
        validator,
        { playerId: 1, tick: 210, targetId: 7 },
        {
          pos: { x: 1, y: 0, z: 0 },
          getTarget: () => target,
          getAttackStats: () => ({ baseDamage: 6, isAxeAttack: false }),
          sinks,
        },
      );
      expect(followUp.accepted).toBe(true);
      if (followUp.accepted) {
        expect(followUp.hit.blocked).toBe(false);
        expect(followUp.hit.healthRemoved).toBe(computeAttackDamage(6, 10, 1.6));
      }
    });

    it('blocks a projectile impact for a raised shield facing the arrow', () => {
      const validator = new CombatValidator({ baseArrowSpeed: 0.5, baseArrowDamage: 12 });
      const sinks = makeSinks();
      // Defender at (4,0,0) facing -90 (bearing to the projectile at (3.5,0,0) is -90).
      const target = makeTarget({ id: 7, x: 4, y: 0, z: 0, radius: 0.6, facingYawDegrees: -90 });
      validator.submitShieldBlock({ playerId: 7, requestId: 1, tick: 100, raised: true });
      const f = fire(validator, { origin: { x: 3.5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, { pos: { x: 3.5, y: 0, z: 0 } });
      expect(f.result.accepted).toBe(true);
      const batch = validator.stepProjectiles(1, emptyWorld, resolver, () => [target], sinks);
      expect(batch.projectileHits).toHaveLength(1);
      const hit = batch.projectileHits[0];
      if (hit) {
        expect(hit.targetId).toBe(7);
        expect(hit.applied).toBe(true);
        expect(hit.damage).toBe(computeArrowDamage(0.5, 12));
        expect(hit.blocked).toBe(true);
        expect(hit.healthRemoved).toBe(0);
        expect(hit.knockback).toBeNull();
        expect(hit.shieldDurabilityDamage).toBeGreaterThanOrEqual(1);
      }
      expect(sinks.applyDamage).not.toHaveBeenCalled();
      expect(sinks.applyShieldDurabilityDamage).toHaveBeenCalledWith(7, 6, 1);
    });
  });

  describe('REQ-4 Projectile Fire Request Validation', () => {
    it('accepts a valid full-charge fire, consumes one arrow, and spawns with the 143 velocity', () => {
      const validator = new CombatValidator();
      const f = fire(validator);
      expect(f.result).toMatchObject({ accepted: true, kind: 'projectile_fire', projectileId: 0 });
      expect(f.arrowsLeft).toBe(2);
      expect(f.spawned).toHaveLength(1);
      const spawn = f.spawned[0] as { ownerId: number; velocity: { vx: number; vy: number; vz: number } };
      expect(spawn.ownerId).toBe(1);
      expect(spawn.velocity).toEqual({ vx: 0, vy: 0, vz: 3 });
      expect(validator.projectileCount).toBe(1);
      if (f.result.accepted) {
        expect(f.result.spawn.origin).toEqual({ x: 0, y: 1.6, z: 0 });
        expect(f.result.spawn.spawnTick).toBe(400);
      }
    });

    it('rejects fire without ammo and consumes nothing', () => {
      const validator = new CombatValidator();
      const f = fire(validator, {}, { arrows: 0 });
      expect(f.result).toMatchObject({ accepted: false, kind: 'projectile_fire', reason: 'no_ammo' });
      expect(f.arrowsLeft).toBe(0);
      expect(f.spawned).toHaveLength(0);
      expect(validator.projectileCount).toBe(0);
    });

    it('allows fire without ammo under infiniteAmmo', () => {
      const validator = new CombatValidator({ infiniteAmmo: true });
      const f = fire(validator, {}, { arrows: 0 });
      expect(f.result.accepted).toBe(true);
      expect(f.arrowsLeft).toBe(0);
    });

    it('rejects a zero-charge release with not_charged', () => {
      const validator = new CombatValidator();
      const f = fire(validator, { chargeTicks: 0 });
      expect(f.result).toMatchObject({ accepted: false, kind: 'projectile_fire', reason: 'not_charged' });
      expect(f.arrowsLeft).toBe(3);
    });

    it('rejects an impossible charge claim with fire_too_fast', () => {
      const validator = new CombatValidator();
      expect(fire(validator, { tick: 400 }).result.accepted).toBe(true);
      const fast = fire(validator, { tick: 410, requestId: 2 });
      expect(fast.result).toMatchObject({ accepted: false, kind: 'projectile_fire', reason: 'fire_too_fast' });
    });

    it('rejects a fire origin far from the authoritative position with origin_mismatch', () => {
      const validator = new CombatValidator();
      const f = fire(validator, { origin: { x: 10, y: 10, z: 10 } });
      expect(f.result).toMatchObject({ accepted: false, kind: 'projectile_fire', reason: 'origin_mismatch' });
    });

    it('rejects a degenerate direction with invalid_direction', () => {
      const validator = new CombatValidator();
      const f = fire(validator, { direction: { x: 0, y: 0, z: 0 } });
      expect(f.result).toMatchObject({ accepted: false, kind: 'projectile_fire', reason: 'invalid_direction' });
    });

    it('rejects fire beyond the projectile cap with max_projectiles', () => {
      const validator = new CombatValidator({ maxProjectiles: 1 });
      expect(fire(validator, { tick: 400 }).result.accepted).toBe(true);
      const capped = fire(validator, { tick: 500, requestId: 2 });
      expect(capped.result).toMatchObject({ accepted: false, kind: 'projectile_fire', reason: 'max_projectiles' });
    });

    it('clamps an over-long charge to full draw instead of rejecting', () => {
      const validator = new CombatValidator();
      const f = fire(validator, { chargeTicks: 500, tick: 500 });
      expect(f.result.accepted).toBe(true);
      if (f.result.accepted) {
        expect(f.result.spawn.velocity).toEqual({ vx: 0, vy: 0, vz: 3 });
      }
    });

    it('rejects a stale fire tick with stale_tick', () => {
      const validator = new CombatValidator();
      expect(fire(validator, { tick: 400 }).result.accepted).toBe(true);
      const replay = fire(validator, { tick: 400, requestId: 2 });
      expect(replay.result).toMatchObject({ accepted: false, kind: 'projectile_fire', reason: 'stale_tick' });
    });
  });

  describe('REQ-5 Authoritative Projectile Stepping and Impact', () => {
    it('produces a step update identical to the 142 core for clear flight', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      fire(validator, { origin: { x: 0, y: 1, z: 0 } });
      const batch = validator.stepProjectiles(1, emptyWorld, resolver, () => [makeTarget({ x: 50, y: 0, z: 50 })], sinks);
      expect(batch.projectileSteps).toHaveLength(1);
      const expected = stepProjectile(emptyWorld, resolver, { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 3, ownerId: 1, ageTicks: 0 }, []);
      expect(batch.projectileSteps[0]).toEqual({
        id: 0,
        position: { x: expected.state.x, y: expected.state.y, z: expected.state.z },
        velocity: { vx: expected.state.vx, vy: expected.state.vy, vz: expected.state.vz },
      });
    });

    it('damages an impacted entity with arrow damage from the impact speed and knockback', () => {
      const validator = new CombatValidator({ baseArrowSpeed: 0.5 });
      const sinks = makeSinks();
      const target = makeTarget({ id: 7, x: 4, y: 0, z: 0 });
      const f = fire(validator, { origin: { x: 3.5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, { pos: { x: 3.5, y: 0, z: 0 } });
      expect(f.result.accepted).toBe(true);
      const batch = validator.stepProjectiles(1, emptyWorld, resolver, () => [target], sinks);
      expect(batch.projectileSteps).toHaveLength(0);
      expect(batch.projectileHits).toHaveLength(1);
      const hit = batch.projectileHits[0];
      if (hit) {
        expect(hit.targetId).toBe(7);
        expect(hit.applied).toBe(true);
        expect(hit.damage).toBe(computeArrowDamage(0.5, 2));
        expect(hit.healthRemoved).toBe(computeArrowDamage(0.5, 2));
        expect(hit.knockback).toEqual(computeKnockback(3.5, 0, 4, 0, 0.1, { vx: 0, vy: 0, vz: 0 }));
        expect(hit.knockback).not.toBeNull();
      }
      expect(sinks.applyDamage).toHaveBeenCalledWith(7, computeArrowDamage(0.5, 2), 'arrow', 1, 1);
      expect(validator.projectileCount).toBe(0);
    });

    it('absorbs an arrow without damage when the target is invulnerable', () => {
      const validator = new CombatValidator({ baseArrowSpeed: 0.5 });
      const sinks = makeSinks();
      const target = makeTarget({ id: 7, x: 4, y: 0, z: 0 });
      // Melee i-frame registered at tick 100.
      attack(validator, { playerId: 1, tick: 100 }, { pos: { x: 1, y: 0, z: 0 }, getTarget: () => target, sinks });
      fire(validator, { tick: 105, origin: { x: 3.5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, { pos: { x: 3.5, y: 0, z: 0 } });
      const batch = validator.stepProjectiles(105, emptyWorld, resolver, () => [target], sinks);
      expect(batch.projectileHits).toHaveLength(1);
      const hit = batch.projectileHits[0];
      if (hit) {
        expect(hit.targetId).toBe(7);
        expect(hit.applied).toBe(false);
        expect(hit.damage).toBe(0);
        expect(hit.healthRemoved).toBe(0);
        expect(hit.knockback).toBeNull();
      }
      // Only the melee hit at tick 100 reached the sink; the i-frame-absorbed arrow adds nothing.
      expect(sinks.applyDamage).toHaveBeenCalledTimes(1);
      expect(sinks.applyDamage).toHaveBeenCalledWith(7, 7, 'player_attack', 1, 100);
      expect(validator.projectileCount).toBe(0);
    });

    it('despawns a projectile on block impact with a zero-damage hit event', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      fire(validator, { origin: { x: 0.5, y: 1, z: 0 }, direction: { x: 0, y: -1, z: 0 } }, { pos: { x: 0.5, y: 1, z: 0 } });
      const batch = validator.stepProjectiles(1, new FloorWorld(0), resolver, () => [], sinks);
      expect(batch.projectileSteps).toHaveLength(0);
      expect(batch.projectileHits).toHaveLength(1);
      const hit = batch.projectileHits[0];
      if (hit) {
        expect(hit.targetId).toBeNull();
        expect(hit.damage).toBe(0);
        expect(hit.healthRemoved).toBe(0);
        expect(hit.position).toEqual({ x: 0, y: 1, z: 0 });
      }
      expect(sinks.applyDamage).not.toHaveBeenCalled();
      expect(validator.projectileCount).toBe(0);
    });

    it('despawns a projectile on age expiry', () => {
      const validator = new CombatValidator({ maxAgeTicks: 3 });
      const sinks = makeSinks();
      fire(validator, { origin: { x: 0, y: 1, z: 0 } });
      for (let tick = 1; tick <= 3; tick++) {
        const batch = validator.stepProjectiles(tick, emptyWorld, resolver, () => [], sinks);
        expect(batch.projectileDespawns).toHaveLength(0);
      }
      const expired = validator.stepProjectiles(4, emptyWorld, resolver, () => [], sinks);
      expect(expired.projectileDespawns).toEqual([0]);
      expect(expired.projectileSteps).toHaveLength(0);
      expect(validator.projectileCount).toBe(0);
    });

    it('does not hit the owner during the owner-immunity window', () => {
      const validator = new CombatValidator({ baseArrowSpeed: 0.5 });
      const sinks = makeSinks();
      const owner = makeTarget({ id: 1, x: 4, y: 0, z: 0 });
      fire(validator, { origin: { x: 3.5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, { pos: { x: 3.5, y: 0, z: 0 } });
      const batch = validator.stepProjectiles(1, emptyWorld, resolver, () => [owner], sinks);
      expect(batch.projectileHits).toHaveLength(0);
      expect(batch.projectileSteps).toHaveLength(1);
    });
  });

  describe('REQ-6 Combat Replication Batch', () => {
    it('contains queued melee hits, spawns, and steps in one batch', () => {
      const validator = new CombatValidator({ baseArrowSpeed: 0.5 });
      const sinks = makeSinks();
      const target = makeTarget({ id: 7 });
      const melee = attack(validator, { playerId: 1, tick: 100, targetId: 7 }, { pos: { x: 0, y: 0, z: 0 }, getTarget: () => target, sinks });
      expect(melee.accepted).toBe(true);
      fire(validator, { tick: 100, origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: 1 } });
      const batch = validator.stepProjectiles(100, emptyWorld, resolver, () => [target], sinks);
      expect(batch.tick).toBe(100);
      expect(batch.meleeHits).toHaveLength(1);
      expect(batch.projectileSpawns).toHaveLength(1);
      expect(batch.projectileSteps).toHaveLength(1);
      expect(batch.meleeHits[0]?.targetId).toBe(7);
      expect(batch.projectileSpawns[0]?.id).toBe(0);
    });

    it('consumes queued events exactly once', () => {
      const validator = new CombatValidator({ baseArrowSpeed: 0.5 });
      const sinks = makeSinks();
      const target = makeTarget({ id: 7 });
      attack(validator, { playerId: 1, tick: 100, targetId: 7 }, { getTarget: () => target, sinks });
      fire(validator, { tick: 100, origin: { x: 0, y: 1, z: 0 } });
      const batch1 = validator.stepProjectiles(100, emptyWorld, resolver, () => [target], sinks);
      expect(batch1.meleeHits).toHaveLength(1);
      expect(batch1.projectileSpawns).toHaveLength(1);
      // No new requests: the next batch must not repeat melee hits or spawns.
      const batch2 = validator.stepProjectiles(101, emptyWorld, resolver, () => [target], sinks);
      expect(batch2.meleeHits).toHaveLength(0);
      expect(batch2.projectileSpawns).toHaveLength(0);
      // Host-driven despawn is reflected once.
      expect(validator.removeProjectile(0)).toBe(true);
      const batch3 = validator.stepProjectiles(102, emptyWorld, resolver, () => [target], sinks);
      expect(batch3.projectileDespawns).toEqual([0]);
      const batch4 = validator.stepProjectiles(103, emptyWorld, resolver, () => [target], sinks);
      expect(batch4.meleeHits).toHaveLength(0);
      expect(batch4.projectileSpawns).toHaveLength(0);
      expect(batch4.projectileSteps).toHaveLength(0);
      expect(batch4.projectileHits).toHaveLength(0);
      expect(batch4.projectileDespawns).toHaveLength(0);
    });

    it('orders projectile entries by id ascending', () => {
      const validator = new CombatValidator({ baseArrowSpeed: 0.5 });
      const sinks = makeSinks();
      fire(validator, { tick: 100, requestId: 1, origin: { x: 0, y: 1, z: 0 } });
      fire(validator, { tick: 120, requestId: 2, origin: { x: 1, y: 1, z: 0 } });
      fire(validator, { tick: 140, requestId: 3, origin: { x: 1.5, y: 1, z: 0 } });
      const batch = validator.stepProjectiles(140, emptyWorld, resolver, () => [], sinks);
      expect(batch.projectileSpawns.map((s) => s.id)).toEqual([0, 1, 2]);
      expect(batch.projectileSteps.map((s) => s.id)).toEqual([0, 1, 2]);
    });

    it('reports host-driven despawns in the batch', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      fire(validator, { tick: 400 });
      expect(validator.removeProjectile(0)).toBe(true);
      expect(validator.removeProjectile(0)).toBe(false);
      expect(validator.removeProjectile(99)).toBe(false);
      const batch = validator.stepProjectiles(401, emptyWorld, resolver, () => [], sinks);
      expect(batch.projectileDespawns).toEqual([0]);
    });
  });

  describe('REQ-7 Client Combat Reconciler Prediction and Rollback', () => {
    it('confirms a predicted attack on an applied acceptance', () => {
      const reconciler = new ClientCombatReconciler();
      reconciler.predictAttack(11, 7);
      expect(reconciler.pendingCount).toBe(1);
      expect(reconciler.hasPending(11)).toBe(true);
      const directive = reconciler.reconcile({
        accepted: true,
        kind: 'melee_attack',
        requestId: 11,
        tick: 100,
        targetId: 7,
        hit: {
          attackerId: 1,
          targetId: 7,
          tick: 100,
          applied: true,
          damage: 6,
          healthRemoved: 6,
          knockback: { vx: 0.4, vy: 0.4, vz: 0 },
          blocked: false,
          shieldDurabilityDamage: 0,
          killed: false,
        },
      });
      expect(directive).toBeNull();
      expect(reconciler.pendingCount).toBe(0);
    });

    it('returns a rollback directive for a rejected attack', () => {
      const reconciler = new ClientCombatReconciler();
      reconciler.predictAttack(12, 7);
      const directive = reconciler.reconcile({
        accepted: false,
        kind: 'melee_attack',
        requestId: 12,
        tick: 100,
        targetId: 7,
        reason: 'out_of_reach',
      });
      expect(directive).toEqual({ kind: 'attack', requestId: 12, targetId: 7, reason: 'out_of_reach' });
    });

    it('returns an invulnerable directive for a non-applied hit', () => {
      const reconciler = new ClientCombatReconciler();
      reconciler.predictAttack(13, 7);
      const directive = reconciler.reconcile({
        accepted: true,
        kind: 'melee_attack',
        requestId: 13,
        tick: 100,
        targetId: 7,
        hit: {
          attackerId: 1,
          targetId: 7,
          tick: 100,
          applied: false,
          damage: 0,
          healthRemoved: 0,
          knockback: null,
          blocked: false,
          shieldDurabilityDamage: 0,
          killed: false,
        },
      });
      expect(directive).toEqual({ kind: 'attack', requestId: 13, targetId: 7, reason: 'invulnerable' });
    });

    it('returns a blocked directive for a shield-blocked hit', () => {
      const reconciler = new ClientCombatReconciler();
      reconciler.predictAttack(14, 7);
      const directive = reconciler.reconcile({
        accepted: true,
        kind: 'melee_attack',
        requestId: 14,
        tick: 100,
        targetId: 7,
        hit: {
          attackerId: 1,
          targetId: 7,
          tick: 100,
          applied: true,
          damage: 6,
          healthRemoved: 0,
          knockback: null,
          blocked: true,
          shieldDurabilityDamage: 6,
          killed: false,
        },
      });
      expect(directive).toEqual({ kind: 'attack', requestId: 14, targetId: 7, reason: 'blocked' });
    });

    it('confirms or rolls back fire predictions', () => {
      const reconciler = new ClientCombatReconciler();
      reconciler.predictFire(21, 3);
      const confirmed = reconciler.reconcile({
        accepted: true,
        kind: 'projectile_fire',
        requestId: 21,
        tick: 100,
        projectileId: 3,
        spawn: { id: 3, ownerId: 1, origin: { x: 0, y: 1, z: 0 }, velocity: { vx: 0, vy: 0, vz: 3 }, spawnTick: 100 },
      });
      expect(confirmed).toBeNull();

      reconciler.predictFire(22, 4);
      const rolledBack = reconciler.reconcile({
        accepted: false,
        kind: 'projectile_fire',
        requestId: 22,
        tick: 100,
        reason: 'no_ammo',
      });
      expect(rolledBack).toEqual({ kind: 'fire', requestId: 22, reason: 'no_ammo' });
      expect(reconciler.pendingCount).toBe(0);
    });

    it('treats an unknown request id as a lenient no-op', () => {
      const reconciler = new ClientCombatReconciler();
      const directive = reconciler.reconcile({
        accepted: false,
        kind: 'melee_attack',
        requestId: 99,
        tick: 100,
        targetId: 7,
        reason: 'no_target',
      });
      expect(directive).toBeNull();
    });

    it('rejects duplicate predictions and resets cleanly', () => {
      const reconciler = new ClientCombatReconciler();
      reconciler.predictAttack(1, 7);
      expect(() => reconciler.predictAttack(1, 7)).toThrow('Combat: duplicate prediction requestId 1');
      reconciler.reset();
      expect(reconciler.pendingCount).toBe(0);
    });
  });

  describe('REQ-8 Client Combat Store Batch Application', () => {
    it('applies spawns and steps', () => {
      const store = new ClientCombatStore();
      store.applyBatch({
        tick: 1,
        meleeHits: [],
        projectileSpawns: [{ id: 3, ownerId: 1, origin: { x: 0, y: 1, z: 0 }, velocity: { vx: 0, vy: 0, vz: 3 }, spawnTick: 1 }],
        projectileSteps: [],
        projectileHits: [],
        projectileDespawns: [],
      });
      expect(store.hasProjectile(3)).toBe(true);
      expect(store.getProjectile(3)?.position).toEqual({ x: 0, y: 1, z: 0 });
      store.applyBatch({
        tick: 2,
        meleeHits: [],
        projectileSpawns: [],
        projectileSteps: [{ id: 3, position: { x: 0, y: 0.95, z: 3 }, velocity: { vx: 0, vy: -0.0495, vz: 2.97 } }],
        projectileHits: [],
        projectileDespawns: [],
      });
      expect(store.getProjectile(3)).toEqual({
        id: 3,
        ownerId: 1,
        position: { x: 0, y: 0.95, z: 3 },
        velocity: { vx: 0, vy: -0.0495, vz: 2.97 },
      });
    });

    it('removes projectiles on hits and despawns', () => {
      const store = new ClientCombatStore();
      store.applyBatch({
        tick: 1,
        meleeHits: [],
        projectileSpawns: [
          { id: 3, ownerId: 1, origin: { x: 0, y: 1, z: 0 }, velocity: { vx: 0, vy: 0, vz: 3 }, spawnTick: 1 },
          { id: 4, ownerId: 1, origin: { x: 0, y: 1, z: 0 }, velocity: { vx: 0, vy: 0, vz: 3 }, spawnTick: 1 },
        ],
        projectileSteps: [],
        projectileHits: [],
        projectileDespawns: [],
      });
      store.applyBatch({
        tick: 2,
        meleeHits: [],
        projectileSpawns: [],
        projectileSteps: [],
        projectileHits: [
          { id: 3, tick: 2, targetId: 7, position: null, applied: true, damage: 6, healthRemoved: 6, knockback: null, blocked: false, shieldDurabilityDamage: 0, killed: false },
        ],
        projectileDespawns: [4],
      });
      expect(store.hasProjectile(3)).toBe(false);
      expect(store.hasProjectile(4)).toBe(false);
      expect(store.size).toBe(0);
    });

    it('ignores steps for unknown projectiles without throwing', () => {
      const store = new ClientCombatStore();
      store.applyBatch({
        tick: 1,
        meleeHits: [],
        projectileSpawns: [],
        projectileSteps: [{ id: 99, position: { x: 1, y: 2, z: 3 }, velocity: { vx: 0, vy: 0, vz: 0 } }],
        projectileHits: [],
        projectileDespawns: [],
      });
      expect(store.size).toBe(0);
    });

    it('orders getAll by id ascending and resets', () => {
      const store = new ClientCombatStore();
      store.applyBatch({
        tick: 1,
        meleeHits: [],
        projectileSpawns: [
          { id: 9, ownerId: 1, origin: { x: 0, y: 1, z: 0 }, velocity: { vx: 0, vy: 0, vz: 3 }, spawnTick: 1 },
          { id: 2, ownerId: 1, origin: { x: 0, y: 1, z: 0 }, velocity: { vx: 0, vy: 0, vz: 3 }, spawnTick: 1 },
        ],
        projectileSteps: [],
        projectileHits: [],
        projectileDespawns: [],
      });
      expect(store.getAll().map((p) => p.id)).toEqual([2, 9]);
      store.reset();
      expect(store.size).toBe(0);
    });
  });

  describe('REQ-9 Damage Routing through Health and Armor Systems', () => {
    it('routes melee damage through a real SurvivalSystem with armor reduction', () => {
      const system = new SurvivalSystem();
      const applyWear = vi.fn();
      system.armor = {
        reduce: () => ({ reduced: 3, absorbed: 3 }),
        applyWear: (absorbed: number) => applyWear(absorbed),
      } as unknown as ArmorProtection;

      const validator = new CombatValidator();
      const sinks: CombatSinks = {
        applyDamage: (_targetId: number, amount: number, reason: string) => {
          const before = system.health;
          system.damage(amount, reason);
          return { healthRemoved: before - system.health, killed: system.health <= 0 };
        },
        applyShieldDurabilityDamage: () => {},
      };
      const result = attack(
        validator,
        { playerId: 1, tick: 100, targetId: 7 },
        { pos: { x: 0, y: 0, z: 0 }, getTarget: () => makeTarget(), getAttackStats: () => ({ baseDamage: 6, isAxeAttack: false }), sinks },
      );
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.damage).toBe(6);
        expect(result.hit.healthRemoved).toBe(3);
        expect(result.hit.killed).toBe(false);
      }
      expect(applyWear).toHaveBeenCalledWith(3);
      expect(system.health).toBe(17);
    });

    it('reports the kill when the sink reports a lethal hit', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      // The host sink reports the target at 2 health: 5 incoming removes only 2 and kills.
      sinks.applyDamage.mockImplementation(() => ({ healthRemoved: 2, killed: true }));
      const result = attack(
        validator,
        { playerId: 1, tick: 100, targetId: 7 },
        { pos: { x: 0, y: 0, z: 0 }, getTarget: () => makeTarget(), getAttackStats: () => ({ baseDamage: 6, isAxeAttack: false }), sinks },
      );
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.hit.damage).toBe(6);
        expect(result.hit.healthRemoved).toBe(2);
        expect(result.hit.killed).toBe(true);
      }
    });

    it('never calls the damage sink for invulnerable or fully blocked hits', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      const blockedTarget = makeTarget({ x: 4, y: 0, z: 0, facingYawDegrees: -90 });
      validator.submitShieldBlock({ playerId: 7, requestId: 1, tick: 100, raised: true });
      // Blocked hit at tick 200.
      attack(
        validator,
        { playerId: 1, tick: 200, targetId: 7 },
        { pos: { x: 1, y: 0, z: 0 }, getTarget: () => blockedTarget, getAttackStats: () => ({ baseDamage: 6, isAxeAttack: false }), sinks },
      );
      // Invulnerable hit at tick 205 by another attacker.
      attack(
        validator,
        { playerId: 2, tick: 205, targetId: 7 },
        { pos: { x: 1, y: 0, z: 0 }, getTarget: () => blockedTarget, sinks },
      );
      expect(sinks.applyDamage).not.toHaveBeenCalled();
      expect(sinks.applyShieldDurabilityDamage).toHaveBeenCalledTimes(1);
    });
  });

  describe('REQ-10 Input Validation and Error Handling', () => {
    it('throws Combat: errors for malformed request fields without mutating state', () => {
      const validator = new CombatValidator();
      const sinks = makeSinks();
      expect(() => attack(validator, { targetId: -1 }, { sinks })).toThrow('Combat: targetId must be a non-negative safe integer');
      expect(() => attack(validator, { tick: -5 }, { sinks })).toThrow('Combat: tick must be a non-negative safe integer');
      expect(() =>
        fire(validator, { origin: { x: Number.NaN, y: 0, z: 0 } }),
      ).toThrow('Combat: origin.x must be a finite number');
      expect(() => fire(validator, { chargeTicks: 1.5 })).toThrow('Combat: chargeTicks must be a non-negative safe integer');
      expect(() =>
        validator.submitShieldBlock({ playerId: 5, requestId: 1, tick: 1, raised: 'yes' as unknown as boolean }),
      ).toThrow('Combat: raised must be a boolean');
      // Nothing was recorded or consumed by the failing calls.
      expect(validator.projectileCount).toBe(0);
      expect(attack(validator, { tick: 50 }).accepted).toBe(true);
    });

    it('throws Combat: errors for invalid constructor options', () => {
      expect(() => new CombatValidator({ maxAttackReach: 0 })).toThrow('Combat: maxAttackReach must be a positive finite number');
      expect(() => new CombatValidator({ minAttackIntervalTicks: -1 })).toThrow(
        'Combat: minAttackIntervalTicks must be a non-negative safe integer',
      );
      expect(() => new CombatValidator({ maxProjectiles: 0 })).toThrow('Combat: maxProjectiles must be a positive integer');
      expect(() => new CombatValidator({ infiniteAmmo: 'yes' as unknown as boolean })).toThrow(
        'Combat: infiniteAmmo must be a boolean',
      );
      expect(() => new CombatValidator({ minChargeTicks: 10, maxChargeTicks: 5 })).toThrow(
        'Combat: minChargeTicks must not exceed maxChargeTicks',
      );
      expect(() => new CombatValidator({ shieldBlockArcDegrees: 720 })).toThrow(
        'Combat: shieldBlockArcDegrees must not exceed 360',
      );
    });

    it('throws Combat: errors for malformed seam outputs', () => {
      const validator = new CombatValidator();
      expect(() =>
        attack(validator, {}, { getTarget: () => makeTarget({ x: Number.NaN }) }),
      ).toThrow('Combat: target.x must be a finite number');
      expect(() => attack(validator, {}, { getTarget: () => makeTarget({ radius: -1 }) })).toThrow(
        'Combat: target.radius must be a positive finite number',
      );
      expect(() =>
        attack(validator, {}, { getAttackStats: () => ({ baseDamage: Number.NaN, isAxeAttack: false }) }),
      ).toThrow('Combat: baseDamage must be a finite number');
      const badSink = makeSinks();
      badSink.applyDamage.mockImplementation(() => ({ healthRemoved: -2, killed: false }));
      expect(() => attack(validator, { tick: 100 }, { sinks: badSink })).toThrow(
        'Combat: applyDamage.healthRemoved must be a non-negative finite number',
      );
      const stepSinks = makeSinks();
      expect(() => validator.stepProjectiles(1, emptyWorld, resolver, () => ({} as CombatTarget[]), stepSinks)).toThrow(
        'Combat: targets must be an array',
      );
    });
  });

  describe('REQ-11 Determinism', () => {
    it('produces identical results and batches for identical schedules', () => {
      const run = () => {
        const validator = new CombatValidator({ baseArrowSpeed: 0.5, minAttackIntervalTicks: 10 });
        const sinks = makeSinks();
        const target = makeTarget({ id: 7 });
        const melee = attack(validator, { playerId: 1, tick: 100, targetId: 7 }, { getTarget: () => target, sinks });
        const fireResult = fire(validator, { tick: 100, origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: 1 } });
        const batch1 = validator.stepProjectiles(100, emptyWorld, resolver, () => [target], sinks);
        const batch2 = validator.stepProjectiles(101, emptyWorld, resolver, () => [target], sinks);
        return { melee, fireResult, batch1, batch2 };
      };
      expect(run()).toEqual(run());
    });
  });
});
