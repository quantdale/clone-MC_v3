import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createResourceId } from '../../src/data/ResourceId';
import {
  DamageTypeRegistry,
  createDefaultDamageTypeRegistry,
  requireDamageType,
  type DamageTypeDefinition,
} from '../../src/data/DamageType';
import { Player } from '../../src/player/Player';
import { SurvivalSystem } from '../../src/player/SurvivalSystem';

const rid = (key: string) => createResourceId('test', `damage/${key}`);

function def(overrides: Partial<DamageTypeDefinition> & Pick<DamageTypeDefinition, 'kind' | 'key'>): DamageTypeDefinition {
  return {
    id: rid(overrides.key),
    name: overrides.key,
    flags: [],
    amount: 0,
    ...overrides,
  };
}

function player(): Player {
  return new Player({ position: new THREE.Vector3(0.5, 2, 0.5) });
}

describe('damage type registry validation', () => {
  it('builds the default registry with the four current types and finalizes', () => {
    const reg = createDefaultDamageTypeRegistry();
    expect(reg.size).toBe(4);
    expect(reg.finalized).toBe(true);
    expect(reg.has(createResourceId('minecraft', 'damage/fall'))).toBe(true);
    const keys = reg.entries().map((d) => d.key).sort();
    expect(keys).toEqual(['drowning', 'fall', 'lava', 'starvation']);
  });

  it('rejects a non-finite amount', () => {
    expect(
      () => new DamageTypeRegistry([def({ kind: 'periodic', key: 'x', amount: NaN, interval: 1 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects an unknown flag', () => {
    expect(
      () => new DamageTypeRegistry([def({ kind: 'starvation', key: 'x', flags: ['NOPE' as never] })]),
    ).toThrow(/INVALID_FLAG/);
  });

  it('rejects a fall type missing scaling', () => {
    expect(
      () => new DamageTypeRegistry([def({ kind: 'fall', key: 'x', fallThreshold: 3 })]),
    ).toThrow(/INVALID_DEFINITION/);
  });

  it('rejects a periodic type with non-positive interval', () => {
    expect(
      () => new DamageTypeRegistry([def({ kind: 'periodic', key: 'x', amount: 1, interval: 0 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects a duplicate id', () => {
    const d = def({ kind: 'starvation', key: 'x' });
    expect(() => new DamageTypeRegistry([d, d])).toThrow(/DUPLICATE_ID/);
  });
});

describe('default damage type data', () => {
  it('encodes current fall/drown/lava/starvation parameters and flags', () => {
    const reg = createDefaultDamageTypeRegistry();
    const fall = requireDamageType(reg, 'fall');
    expect(fall.kind).toBe('fall');
    expect(fall.flags).toEqual(['FALL', 'ENVIRONMENTAL']);
    expect(fall.fallThreshold).toBe(3);
    expect(fall.fallScaling).toBe(1.5);

    const drowning = requireDamageType(reg, 'drowning');
    expect(drowning.kind).toBe('periodic');
    expect(drowning.amount).toBe(2);
    expect(drowning.interval).toBe(1.5);
    expect(drowning.flags).toEqual(['DROWNING', 'ENVIRONMENTAL']);

    const lava = requireDamageType(reg, 'lava');
    expect(lava.amount).toBe(4);
    expect(lava.interval).toBe(0.7);
    expect(lava.flags).toContain('FIRE');

    const starvation = requireDamageType(reg, 'starvation');
    expect(starvation.amount).toBe(1);
    expect(starvation.flags).toContain('STARVATION');
  });

  it('fail-fast when a required default type is missing', () => {
    const partial = new DamageTypeRegistry([def({ kind: 'starvation', key: 'starvation' })]);
    expect(() => requireDamageType(partial, 'fall')).toThrow(/INVALID_DEFINITION/);
  });
});

describe('survival routing through the damage type registry', () => {
  it('reproduces the exact fall formula via the registry', () => {
    const survival = new SurvivalSystem();
    survival.update(0.016, player(), {
      sprinting: false,
      headSubmerged: false,
      inLava: false,
      landingDistance: 6,
    });
    // ceil((6 - 3) * 1.5) = ceil(4.5) = 5 -> 20 - 5 = 15
    expect(survival.health).toBe(15);
  });

  it('applies a custom fall scaling through an injected registry', () => {
    const reg = new DamageTypeRegistry([
      def({ kind: 'fall', key: 'fall', flags: ['FALL'], amount: 0, fallThreshold: 2, fallScaling: 2 }),
      def({ kind: 'periodic', key: 'drowning', flags: ['DROWNING'], amount: 2, interval: 1.5 }),
      def({ kind: 'periodic', key: 'lava', flags: ['FIRE'], amount: 4, interval: 0.7 }),
      def({ kind: 'starvation', key: 'starvation', flags: ['STARVATION'], amount: 1 }),
    ]);
    const survival = new SurvivalSystem(reg);
    survival.update(0.016, player(), {
      sprinting: false,
      headSubmerged: false,
      inLava: false,
      landingDistance: 6,
    });
    // ceil((6 - 2) * 2) = 8 -> 20 - 8 = 12
    expect(survival.health).toBe(12);
  });

  it('preserves drowning and lava amounts through the default registry', () => {
    const drown = new SurvivalSystem();
    for (let t = 0; t < 1.5; t += 0.1) {
      drown.update(0.1, player(), { sprinting: false, headSubmerged: true, inLava: false, landingDistance: 0 });
    }
    expect(drown.health).toBe(18);

    const lava = new SurvivalSystem();
    for (let t = 0; t < 0.7; t += 0.1) {
      lava.update(0.1, player(), { sprinting: false, headSubmerged: false, inLava: true, landingDistance: 0 });
    }
    expect(lava.health).toBe(16);
  });
});
