import { describe, expect, it } from 'vitest';
import { createResourceId, resourceIdToString, type ResourceId } from '../../src/data/ResourceId';
import {
  PERIODIC_EFFECT_ORDER,
  POISON_INTERVAL_TICKS,
  REGENERATION_INTERVAL_TICKS,
  WITHER_INTERVAL_TICKS,
  periodicEffectTypeId,
  periodicIntervalTicks,
  remainingDurationTicks,
  resolvePeriodicEffect,
  shouldApplyPeriodicTick,
  tickPeriodicStatusEffects,
  type PeriodicDamageReason,
  type PeriodicEffectKind,
  type PeriodicEffectSource,
  type PeriodicEffectView,
} from '../../src/simulation/PeriodicStatusEffects';

/** Map-backed effect source with seconds-based durations (like StatusEffectManager). */
class Effects implements PeriodicEffectSource {
  readonly map = new Map<string, { duration: number; amplifier: number }>();
  set(kind: PeriodicEffectKind, seconds: number, amplifier = 0): void {
    this.map.set(resourceIdToString(periodicEffectTypeId(kind)), { duration: seconds, amplifier });
  }
  get(id: ResourceId): PeriodicEffectView | undefined {
    return this.map.get(resourceIdToString(id));
  }
  tick(dt: number): void {
    for (const [k, v] of this.map) {
      v.duration = Math.max(0, v.duration - dt);
      if (v.duration <= 0) this.map.delete(k);
    }
  }
}

class Target {
  log: string[] = [];
  constructor(public health: number, public readonly maxHealth = 20) {}
  damage(amount: number, reason: PeriodicDamageReason): void {
    this.log.push(`damage:${reason}`);
    this.health = Math.max(0, this.health - amount);
  }
  heal(amount: number): void {
    this.log.push('heal');
    this.health = Math.min(this.maxHealth, this.health + amount);
  }
}

describe('PeriodicStatusEffects: interval math (296)', () => {
  it('uses the vanilla bases', () => {
    expect([POISON_INTERVAL_TICKS, REGENERATION_INTERVAL_TICKS, WITHER_INTERVAL_TICKS]).toEqual([25, 50, 40]);
  });

  it('shifts the base by the amplifier with a minimum of 1', () => {
    const table = (kind: PeriodicEffectKind) => [0, 1, 2, 3, 4, 5, 6].map((a) => periodicIntervalTicks(kind, a));
    expect(table('poison')).toEqual([25, 12, 6, 3, 1, 1, 1]);
    expect(table('regeneration')).toEqual([50, 25, 12, 6, 3, 1, 1]);
    expect(table('wither')).toEqual([40, 20, 10, 5, 2, 1, 1]);
  });

  it('clamps amplifiers defensively (no 32-bit shift wrap, floor, NaN → 0)', () => {
    expect(periodicIntervalTicks('poison', 32)).toBe(1);
    expect(periodicIntervalTicks('poison', 255)).toBe(1);
    expect(periodicIntervalTicks('poison', 1.9)).toBe(12);
    expect(periodicIntervalTicks('poison', -3)).toBe(25);
    expect(periodicIntervalTicks('poison', Number.NaN)).toBe(25);
    expect(periodicIntervalTicks('speed' as PeriodicEffectKind, 0)).toBe(0);
  });

  it('rounds remaining seconds to whole ticks', () => {
    expect(remainingDurationTicks(45)).toBe(900);
    expect(remainingDurationTicks(44.999999)).toBe(900);
    expect(remainingDurationTicks(0.05)).toBe(1);
    expect(remainingDurationTicks(0)).toBe(0);
    expect(remainingDurationTicks(-1)).toBe(0);
    expect(remainingDurationTicks(Number.NaN)).toBe(0);
    expect(remainingDurationTicks(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('applies iff remaining ticks are positive and divisible by the interval', () => {
    expect(shouldApplyPeriodicTick('poison', 900, 0)).toBe(true);
    expect(shouldApplyPeriodicTick('poison', 899, 0)).toBe(false);
    expect(shouldApplyPeriodicTick('poison', 875, 0)).toBe(true);
    expect(shouldApplyPeriodicTick('poison', 0, 0)).toBe(false);
    expect(shouldApplyPeriodicTick('poison', 12, 1)).toBe(true);
    expect(shouldApplyPeriodicTick('poison', 7, 4)).toBe(true); // interval 1: every tick
    expect(shouldApplyPeriodicTick('regeneration', 100, 0)).toBe(true);
    expect(shouldApplyPeriodicTick('regeneration', 75, 0)).toBe(false);
    expect(shouldApplyPeriodicTick('wither', 80, 0)).toBe(true);
    expect(shouldApplyPeriodicTick('wither', 2.5, 0)).toBe(false);
  });

  it('counts hits per effect duration at every amplifier', () => {
    const hits = (kind: PeriodicEffectKind, ticks: number, amp: number) => {
      let n = 0;
      for (let r = ticks; r > 0; r--) if (shouldApplyPeriodicTick(kind, r, amp)) n++;
      return n;
    };
    expect([0, 1, 2, 3, 4].map((a) => hits('poison', 900, a))).toEqual([36, 75, 150, 300, 900]);
    expect([0, 1, 2, 3, 4].map((a) => hits('regeneration', 900, a))).toEqual([18, 36, 75, 150, 300]);
    expect([0, 1, 2, 3, 4].map((a) => hits('wither', 200, a))).toEqual([5, 10, 20, 40, 100]);
  });
});

describe('PeriodicStatusEffects: decisions (296)', () => {
  it('poison deals magic damage only above 1 HP', () => {
    expect(resolvePeriodicEffect('poison', 20, 20)).toEqual({ type: 'damage', kind: 'poison', amount: 1, reason: 'magic' });
    expect(resolvePeriodicEffect('poison', 2, 20)?.type).toBe('damage');
    expect(resolvePeriodicEffect('poison', 1, 20)).toBeNull();
  });

  it('wither deals wither damage even at 1 HP (can kill)', () => {
    expect(resolvePeriodicEffect('wither', 1, 20)).toEqual({ type: 'damage', kind: 'wither', amount: 1, reason: 'wither' });
  });

  it('regeneration heals only below max health', () => {
    expect(resolvePeriodicEffect('regeneration', 19, 20)).toEqual({ type: 'heal', kind: 'regeneration', amount: 1 });
    expect(resolvePeriodicEffect('regeneration', 20, 20)).toBeNull();
    expect(resolvePeriodicEffect('regeneration', 5, 5)).toBeNull();
  });

  it('dead or malformed health does nothing', () => {
    for (const kind of PERIODIC_EFFECT_ORDER) {
      expect(resolvePeriodicEffect(kind, 0, 20)).toBeNull();
      expect(resolvePeriodicEffect(kind, Number.NaN, 20)).toBeNull();
      expect(resolvePeriodicEffect(kind, 10, Number.NaN)).toBeNull();
    }
  });

  it('type ids are the registry ids', () => {
    expect(resourceIdToString(periodicEffectTypeId('poison'))).toBe('minecraft:effect/poison');
    expect(resourceIdToString(periodicEffectTypeId('regeneration'))).toBe('minecraft:effect/regeneration');
    expect(resourceIdToString(periodicEffectTypeId('wither'))).toBe('minecraft:effect/wither');
  });
});

describe('PeriodicStatusEffects: fixed-tick pass (296)', () => {
  function run(effects: Effects, target: Target, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      tickPeriodicStatusEffects(effects, target);
      effects.tick(1 / 20);
    }
  }

  it('Poison I hits on its first tick then every 25 ticks (before the count-down)', () => {
    const effects = new Effects();
    effects.set('poison', 45, 0);
    const target = new Target(20);
    run(effects, target, 100);
    expect(target.health).toBe(16); // remaining 900, 875, 850, 825
  });

  it('a full 45 s poison stops at 1 HP (half a heart)', () => {
    const effects = new Effects();
    effects.set('poison', 45, 1);
    const target = new Target(20);
    run(effects, target, 905); // float count-down may leave a sub-tick remainder (0 ticks: no hit)
    expect(target.health).toBe(1);
    expect(target.log.every((l) => l === 'damage:magic')).toBe(true);
    expect(effects.map.size).toBe(0);
  });

  it('regeneration heals to max and never beyond', () => {
    const effects = new Effects();
    effects.set('regeneration', 10, 1);
    const target = new Target(18);
    run(effects, target, 200);
    expect(target.health).toBe(20);
    expect(target.log.filter((l) => l === 'heal')).toHaveLength(2);
  });

  it('wither can kill', () => {
    const effects = new Effects();
    effects.set('wither', 10, 0);
    const target = new Target(3);
    run(effects, target, 81);
    expect(target.health).toBe(0); // remaining 200, 160, 120
  });

  it('applies in poison → regeneration → wither order with live health', () => {
    const effects = new Effects();
    effects.set('poison', 5, 0); // 100 ticks: 100 % 25 = 0
    effects.set('regeneration', 5, 0); // 100 % 50 = 0
    effects.set('wither', 6, 0); // 120 % 40 = 0
    const target = new Target(2);
    const applied = tickPeriodicStatusEffects(effects, target);
    expect(applied.map((a) => a.kind)).toEqual(['poison', 'regeneration', 'wither']);
    expect(target.log).toEqual(['damage:magic', 'heal', 'damage:wither']);
    expect(target.health).toBe(1);
  });

  it('skips effects removed by an earlier action in the same pass (death clears effects)', () => {
    const effects = new Effects();
    effects.set('wither', 5, 0);
    effects.set('regeneration', 5, 0);
    const target = new Target(20);
    const dying = {
      get health() {
        return target.health;
      },
      maxHealth: 20,
      damage: () => undefined,
      heal: () => {
        // A respawn triggered here clears every effect before wither runs.
        effects.map.clear();
        target.log.push('heal');
      },
    };
    target.health = 19;
    const applied = tickPeriodicStatusEffects(effects, dying);
    expect(applied.map((a) => a.kind)).toEqual(['regeneration']);
  });

  it('is deterministic: identical inputs give identical action logs', () => {
    const make = () => {
      const e = new Effects();
      e.set('poison', 30, 2);
      e.set('regeneration', 30, 1);
      e.set('wither', 30, 0);
      const t = new Target(20);
      run(e, t, 600);
      return t.log.join(',');
    };
    expect(make()).toBe(make());
  });

  it('ignores non-periodic effects', () => {
    const effects = new Effects();
    effects.map.set(resourceIdToString(createResourceId('minecraft', 'effect/speed')), { duration: 45, amplifier: 0 });
    const target = new Target(10);
    expect(tickPeriodicStatusEffects(effects, target)).toEqual([]);
  });
});
