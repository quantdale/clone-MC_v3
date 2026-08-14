import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  FluidRegistry,
  createDefaultFluidRegistry,
  type FluidTypeDefinition,
} from '../../src/data/Fluid';

const rid = (key: string) => createResourceId('test', `fluid/${key}`);

function def(overrides: Partial<FluidTypeDefinition> & Pick<FluidTypeDefinition, 'category' | 'key'>): FluidTypeDefinition {
  return {
    id: rid(overrides.key),
    name: overrides.key,
    flags: [overrides.category],
    ...overrides,
  };
}

describe('fluid registry validation', () => {
  it('builds the default registry with four source/flowing variants and finalizes', () => {
    const reg = createDefaultFluidRegistry();
    expect(reg.size).toBe(4);
    expect(reg.finalized).toBe(true);
    const keys = reg.entries().map((d) => d.key).sort();
    expect(keys).toEqual(['lava', 'lava_source', 'water', 'water_source']);
  });

  it('rejects an out-of-range lightLevel', () => {
    expect(
      () => new FluidRegistry([def({ category: 'LAVA', key: 'x', flags: ['LAVA'], lightLevel: 20 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects a non-positive density', () => {
    expect(
      () => new FluidRegistry([def({ category: 'WATER', key: 'x', flags: ['WATER'], density: 0 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects an unknown flag', () => {
    expect(
      () => new FluidRegistry([def({ category: 'WATER', key: 'x', flags: ['WATER', 'NOPE' as never] })]),
    ).toThrow(/INVALID_FLAG/);
  });

  it('rejects a water category without the WATER flag', () => {
    expect(
      () => new FluidRegistry([def({ category: 'WATER', key: 'x', flags: ['SOURCE'] })]),
    ).toThrow(/INVALID_DEFINITION/);
  });

  it('rejects a duplicate id', () => {
    const d = def({ category: 'WATER', key: 'x', flags: ['WATER'] });
    expect(() => new FluidRegistry([d, d])).toThrow(/DUPLICATE_ID/);
  });
});

describe('default fluid data', () => {
  it('encodes water and lava source/flowing variants with correct flags', () => {
    const reg = createDefaultFluidRegistry();
    const water = reg.get(createResourceId('minecraft', 'fluid/water'));
    expect(water.category).toBe('WATER');
    expect(water.flags).toEqual(['WATER', 'FLOWING']);
    expect(water.isSource).toBe(false);

    const waterSource = reg.get(createResourceId('minecraft', 'fluid/water_source'));
    expect(waterSource.isSource).toBe(true);

    const lava = reg.get(createResourceId('minecraft', 'fluid/lava'));
    expect(lava.category).toBe('LAVA');
    expect(lava.flags).toContain('DENSER');
    expect(lava.lightLevel).toBe(0);

    const lavaSource = reg.get(createResourceId('minecraft', 'fluid/lava_source'));
    expect(lavaSource.flags).toContain('LIGHT_EMITTING');
    expect(lavaSource.lightLevel).toBe(15);
    expect(lavaSource.isSource).toBe(true);
  });
});
