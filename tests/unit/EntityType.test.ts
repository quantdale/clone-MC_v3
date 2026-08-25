import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  EntityRegistry,
  createDefaultEntityRegistry,
  type EntityTypeDefinition,
} from '../../src/data/EntityType';

const rid = (key: string) => createResourceId('test', `entity_type/${key}`);

function def(overrides: Partial<EntityTypeDefinition> & Pick<EntityTypeDefinition, 'category' | 'key'>): EntityTypeDefinition {
  return {
    id: rid(overrides.key),
    name: overrides.key,
    ...overrides,
  };
}

describe('entity registry validation', () => {
  it('builds the default registry with twelve entities and finalizes', () => {
    const reg = createDefaultEntityRegistry();
    expect(reg.size).toBe(14);
    expect(reg.finalized).toBe(true);
    expect(reg.entries().map((d) => d.key).sort()).toEqual([
      'bat', 'chicken', 'cow', 'creeper', 'item', 'pig',
      'sheep', 'skeleton', 'spider', 'squid', 'villager', 'wither', 'wither_skull', 'zombie',
    ]);
  });

  it('rejects a non-positive health', () => {
    expect(
      () => new EntityRegistry([def({ category: 'MONSTER', key: 'x', health: 0 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects a negative attackDamage', () => {
    expect(
      () => new EntityRegistry([def({ category: 'MONSTER', key: 'x', attackDamage: -1 })]),
    ).toThrow(/INVALID_VALUE/);
  });

  it('rejects an unknown category', () => {
    expect(
      () => new EntityRegistry([def({ category: 'NOPE' as never, key: 'x' })]),
    ).toThrow(/INVALID_FLAG/);
  });

  it('rejects a duplicate id', () => {
    const d = def({ category: 'MONSTER', key: 'x' });
    expect(() => new EntityRegistry([d, d])).toThrow(/DUPLICATE_ID/);
  });
});

describe('default entity data', () => {
  it('encodes zombie as a monster with expected stats', () => {
    const reg = createDefaultEntityRegistry();
    const zombie = reg.getByKey('zombie')!;
    expect(zombie.category).toBe('MONSTER');
    expect(zombie.health).toBe(20);
    expect(zombie.attackDamage).toBe(3);
    expect(zombie.isSummonable).toBe(true);
    expect(zombie.isPersistent).toBe(true);
  });

  it('assigns runtime ids by registration order', () => {
    const reg = createDefaultEntityRegistry();
    expect(reg.getByRuntimeId(0).key).toBe('zombie');
    expect(reg.getRuntimeId(reg.getByKey('item')!.id)).toBe(13);
  });
});
