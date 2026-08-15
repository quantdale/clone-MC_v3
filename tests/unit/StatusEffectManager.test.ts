import { describe, expect, it } from 'vitest';
import { createResourceId, resourceIdToString } from '../../src/data/ResourceId';
import {
  StatusEffectTypeRegistry,
  createDefaultStatusEffectRegistry,
} from '../../src/data/StatusEffect';
import { createDefaultAttributeRegistry } from '../../src/data/AttributeRegistry';
import {
  StatusEffectManager,
  type EffectAttributeHook,
} from '../../src/data/StatusEffectManager';

const speedId = createResourceId('minecraft', 'effect/speed');
const strengthId = createResourceId('minecraft', 'effect/strength');
const healthBoostId = createResourceId('minecraft', 'effect/health_boost');
const fireResistanceId = createResourceId('minecraft', 'effect/fire_resistance');
const movementSpeedId = createResourceId('minecraft', 'generic/movement_speed');
const attackDamageId = createResourceId('minecraft', 'generic/attack_damage');
const maxHealthId = createResourceId('minecraft', 'generic/max_health');

function newManager(hooks?: Record<string, EffectAttributeHook>): StatusEffectManager {
  return new StatusEffectManager(createDefaultStatusEffectRegistry(), createDefaultAttributeRegistry(), hooks);
}

describe('status effect manager construction', () => {
  it('builds a per-entity attribute set from the attribute registry', () => {
    const mgr = newManager();
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.1);
    expect(mgr.getAttribute(attackDamageId)!.value).toBe(1);
    expect(mgr.getAttribute(maxHealthId)!.value).toBe(20);
    expect(mgr.attributes.length).toBe(6);
    expect(mgr.getAll().length).toBe(0);
  });
});

describe('add', () => {
  it('adds a new effect with the requested duration and amplifier', () => {
    const mgr = newManager();
    const inst = mgr.add(speedId, 100, 1);
    expect(inst.duration).toBe(100);
    expect(inst.amplifier).toBe(1);
    expect(mgr.get(speedId)).toBe(inst);
  });

  it('throws on an unregistered effect id', () => {
    const mgr = newManager();
    expect(() => mgr.add(createResourceId('minecraft', 'effect/nope'))).toThrow();
  });

  it('clamps the amplifier to the type maximum', () => {
    const mgr = newManager();
    const inst = mgr.add(speedId, 100, 9); // speed maxAmplifier is 2
    expect(inst.amplifier).toBe(2);
  });

  it('clamps the duration to the type maximum', () => {
    const mgr = newManager();
    const inst = mgr.add(speedId, 200000, 0); // speed maxDuration is 96000
    expect(inst.duration).toBe(96000);
  });

  it('holds at most one instance per effect type', () => {
    const mgr = newManager();
    mgr.add(speedId, 100, 1);
    mgr.add(speedId, 50, 0);
    expect(mgr.getAll().length).toBe(1);
  });
});

describe('stacking', () => {
  it('a stronger amplifier refreshes the duration', () => {
    const mgr = newManager();
    mgr.add(speedId, 100, 1);
    const inst = mgr.add(speedId, 30, 2);
    expect(inst.amplifier).toBe(2);
    expect(inst.duration).toBe(30);
  });

  it('an equal amplifier keeps the longer duration', () => {
    const mgr = newManager();
    mgr.add(speedId, 100, 2);
    const inst = mgr.add(speedId, 30, 2);
    expect(inst.amplifier).toBe(2);
    expect(inst.duration).toBe(100);
  });

  it('a weaker amplifier does not shorten the duration', () => {
    const mgr = newManager();
    mgr.add(speedId, 100, 2);
    const inst = mgr.add(speedId, 30, 1);
    expect(inst.amplifier).toBe(2);
    expect(inst.duration).toBe(100);
  });
});

describe('attribute hooks', () => {
  it('speed multiplies movement speed', () => {
    const mgr = newManager();
    mgr.add(speedId, 180, 1);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.1 * 1.2);
  });

  it('strength adds attack damage', () => {
    const mgr = newManager();
    mgr.add(strengthId, 180, 1);
    expect(mgr.getAttribute(attackDamageId)!.value).toBe(4);
  });

  it('health_boost adds max health', () => {
    const mgr = newManager();
    mgr.add(healthBoostId, 180, 1);
    expect(mgr.getAttribute(maxHealthId)!.value).toBe(24);
  });

  it('removing the effect restores the base value', () => {
    const mgr = newManager();
    mgr.add(speedId, 180, 1);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.12);
    expect(mgr.remove(speedId)).toBe(true);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.1);
    expect(mgr.get(speedId)).toBeUndefined();
  });

  it('re-applying with a higher amplifier updates the hook value', () => {
    const mgr = newManager();
    mgr.add(speedId, 180, 1);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.12);
    mgr.add(speedId, 180, 2);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.14);
  });

  it('an effect without a hook row leaves attributes unchanged', () => {
    const mgr = newManager();
    mgr.add(fireResistanceId, 100, 0);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.1);
    expect(mgr.getAttribute(attackDamageId)!.value).toBe(1);
  });
});

describe('ticking', () => {
  it('expires a duration-based effect, unhooks it, and returns it', () => {
    const mgr = newManager();
    mgr.add(speedId, 1, 1);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.12);
    const expired = mgr.tick(1.0);
    expect(expired.length).toBe(1);
    expect(expired[0]!.type.id).toEqual(speedId);
    expect(mgr.get(speedId)).toBeUndefined();
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.1);
  });

  it('ignores non-finite and negative dt', () => {
    const mgr = newManager();
    mgr.add(speedId, 10, 1);
    mgr.tick(NaN);
    expect(mgr.get(speedId)!.duration).toBe(10);
    mgr.tick(-1);
    expect(mgr.get(speedId)!.duration).toBe(10);
  });
});

describe('instant effects', () => {
  it('expires on the first tick and removes its hook', () => {
    const instantId = createResourceId('minecraft', 'effect/instant_x');
    const instantReg = new StatusEffectTypeRegistry([
      { id: instantId, key: 'instant_x', name: 'Instant X', category: 'NEUTRAL', flags: ['INSTANT'] },
    ]);
    const mgr = new StatusEffectManager(instantReg, createDefaultAttributeRegistry(), {
      [resourceIdToString(instantId)]: { attribute: movementSpeedId, operation: 'ADD_VALUE', amount: () => 5 },
    });
    mgr.add(instantId);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(5.1);
    const expired = mgr.tick(0.1);
    expect(expired.length).toBe(1);
    expect(expired[0]!.type.id).toEqual(instantId);
    expect(mgr.get(instantId)).toBeUndefined();
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.1);
  });
});

describe('serialization', () => {
  it('round-trips the active set and re-applies hooks', () => {
    const mgr = newManager();
    mgr.add(speedId, 120, 1);
    mgr.add(strengthId, 90, 2);
    expect(mgr.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.12);
    expect(mgr.getAttribute(attackDamageId)!.value).toBe(7);

    const data = mgr.serialize();
    const restored = newManager();
    restored.deserialize(data);

    expect(restored.getAll().length).toBe(2);
    expect(restored.getAttribute(movementSpeedId)!.value).toBeCloseTo(0.12);
    expect(restored.getAttribute(attackDamageId)!.value).toBe(7);
    expect(restored.get(speedId)!.duration).toBe(120);
    expect(restored.get(strengthId)!.amplifier).toBe(2);
  });

  it('deserialize fails atomically on an unregistered type and keeps prior state', () => {
    const mgr = newManager();
    mgr.add(speedId, 100, 1);
    expect(() =>
      mgr.deserialize([{ typeId: 'minecraft:effect/missing', duration: 1, amplifier: 0 }]),
    ).toThrow();
    expect(mgr.getAll().length).toBe(1);
    expect(mgr.get(speedId)!.duration).toBe(100);
  });
});

describe('regression: registries unchanged', () => {
  it('still exposes the 012/014 default registries', () => {
    expect(createDefaultStatusEffectRegistry().size).toBeGreaterThan(20);
    expect(createDefaultAttributeRegistry().size).toBe(6);
  });
});
