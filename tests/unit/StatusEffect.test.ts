import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  StatusEffectInstance,
  StatusEffectTypeRegistry,
  createDefaultStatusEffectRegistry,
  type StatusEffectTypeDefinition,
} from '../../src/data/StatusEffect';

const rid = (key: string) => createResourceId('test', `effect/${key}`);

function def(overrides: Partial<StatusEffectTypeDefinition> & Pick<StatusEffectTypeDefinition, 'key'>): StatusEffectTypeDefinition {
  return {
    id: rid(overrides.key),
    name: overrides.key,
    category: 'NEUTRAL',
    flags: [],
    ...overrides,
  };
}

describe('status effect registry validation', () => {
  it('builds the default registry with many types and finalizes', () => {
    const reg = createDefaultStatusEffectRegistry();
    expect(reg.size).toBeGreaterThan(20);
    expect(reg.finalized).toBe(true);
    expect(reg.has(createResourceId('minecraft', 'effect/speed'))).toBe(true);
  });

  it('rejects a non-finite maxDuration', () => {
    expect(
      () => new StatusEffectTypeRegistry([def({ key: 'x', maxDuration: NaN })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects an unknown flag', () => {
    expect(
      () => new StatusEffectTypeRegistry([def({ key: 'x', flags: ['NOPE' as never] })]),
    ).toThrow(/INVALID_FLAG/);
  });

  it('rejects an INSTANT type with a defaultDuration', () => {
    expect(
      () => new StatusEffectTypeRegistry([def({ key: 'x', flags: ['INSTANT'], defaultDuration: 10 })]),
    ).toThrow(/INVALID_DEFINITION/);
  });

  it('rejects a DURATION_BASED type without a defaultDuration', () => {
    expect(
      () => new StatusEffectTypeRegistry([def({ key: 'x', flags: ['DURATION_BASED'] })]),
    ).toThrow(/INVALID_DEFINITION/);
  });

  it('rejects a duplicate id', () => {
    const d = def({ key: 'x', flags: ['INSTANT'] });
    expect(() => new StatusEffectTypeRegistry([d, d])).toThrow(/DUPLICATE_ID/);
  });
});

describe('status effect instance', () => {
  const reg = createDefaultStatusEffectRegistry();
  const speed = reg.get(createResourceId('minecraft', 'effect/speed')); // DURATION_BASED, default 180, maxAmp 2

  it('defaults duration from the type', () => {
    const inst = new StatusEffectInstance(speed);
    expect(inst.duration).toBe(180);
    expect(inst.amplifier).toBe(0);
  });

  it('clamps the amplifier to the type maximum', () => {
    const inst = new StatusEffectInstance(speed, 180, 5);
    expect(inst.amplifier).toBe(2);
  });

  it('ticks deterministically to expiry', () => {
    const inst = new StatusEffectInstance(speed, 1.0);
    inst.tick(0.6);
    expect(inst.duration).toBeCloseTo(0.4);
    expect(inst.expired).toBe(false);
    inst.tick(0.6);
    expect(inst.duration).toBe(0);
    expect(inst.expired).toBe(true);
  });

  it('rejects a non-finite duration on construction', () => {
    expect(() => new StatusEffectInstance(speed, NaN)).toThrow(/INVALID_VALUE/);
  });

  it('serializes and deserializes round-trip', () => {
    const inst = new StatusEffectInstance(speed, 120, 1);
    const data = inst.serialize();
    const restored = StatusEffectInstance.deserialize(data, reg);
    expect(restored.type.id).toEqual(inst.type.id);
    expect(restored.duration).toBe(120);
    expect(restored.amplifier).toBe(1);
  });

  it('rejects an unregistered type id on deserialize', () => {
    expect(() =>
      StatusEffectInstance.deserialize({ typeId: 'test/effect/missing', duration: 1, amplifier: 0 }, reg),
    ).toThrow(/INVALID_REFERENCE/);
  });

  it('rejects malformed serialization data', () => {
    expect(() =>
      StatusEffectInstance.deserialize({ typeId: 'minecraft:effect/speed', duration: 'x' as never, amplifier: 0 }, reg),
    ).toThrow(/INVALID_REFERENCE/);
  });
});
