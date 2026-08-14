import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  BlockEntityRegistry,
  BlockEntityCompatibility,
  createDefaultBlockEntityRegistry,
  createDefaultBlockEntityCompatibility,
  type BlockEntityTypeDefinition,
} from '../../src/data/BlockEntityType';

const rid = (key: string) => createResourceId('test', `block_entity_type/${key}`);

function def(overrides: Partial<BlockEntityTypeDefinition> & Pick<BlockEntityTypeDefinition, 'key'>): BlockEntityTypeDefinition {
  return {
    id: rid(overrides.key),
    name: overrides.key,
    ...overrides,
  };
}

describe('block-entity registry validation', () => {
  it('builds the default registry with ten types and finalizes', () => {
    const reg = createDefaultBlockEntityRegistry();
    expect(reg.size).toBe(10);
    expect(reg.finalized).toBe(true);
    expect(reg.entries().map((d) => d.key).sort()).toEqual([
      'blast_furnace', 'chest', 'dispenser', 'dropper', 'furnace',
      'hopper', 'mob_spawner', 'sign', 'smoker', 'trapped_chest',
    ]);
  });

  it('rejects a non-positive inventorySize', () => {
    expect(
      () => new BlockEntityRegistry([def({ key: 'x', inventorySize: 0 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects a duplicate id', () => {
    const d = def({ key: 'x' });
    expect(() => new BlockEntityRegistry([d, d])).toThrow(/DUPLICATE_ID/);
  });
});

describe('block-entity compatibility', () => {
  it('rejects a mapping to an unknown type', () => {
    const reg = createDefaultBlockEntityRegistry();
    expect(
      () => new BlockEntityCompatibility(reg, { mappings: { chest: 'not_a_type' } }),
    ).toThrow(/INVALID_REFERENCE/);
  });

  it('resolves a declared block to its type', () => {
    const reg = createDefaultBlockEntityRegistry();
    const compat = createDefaultBlockEntityCompatibility(reg);
    const furnace = compat.getBlockEntityTypeForBlock('furnace');
    expect(furnace?.key).toBe('furnace');
    expect(furnace?.tickable).toBe(true);
    expect(compat.isCompatible('furnace', 'furnace')).toBe(true);
  });

  it('reports an undeclared block as having no block entity', () => {
    const reg = createDefaultBlockEntityRegistry();
    const compat = createDefaultBlockEntityCompatibility(reg);
    expect(compat.getBlockEntityTypeForBlock('stone')).toBeUndefined();
    expect(compat.isCompatible('stone', 'chest')).toBe(false);
  });

  it('maps multiple blocks to a shared type', () => {
    const reg = createDefaultBlockEntityRegistry();
    const compat = createDefaultBlockEntityCompatibility(reg);
    expect(compat.getBlockEntityTypeForBlock('oak_sign')?.key).toBe('sign');
    expect(compat.getBlockEntityTypeForBlock('hanging_sign')?.key).toBe('sign');
  });
});
