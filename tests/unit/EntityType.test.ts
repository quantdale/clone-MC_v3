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
  it('builds the default registry with eighteen entities and finalizes', () => {
    const reg = createDefaultEntityRegistry();
    expect(reg.size).toBe(18);
    expect(reg.finalized).toBe(true);
    expect(reg.entries().map((d) => d.key).sort()).toEqual([
      'bat', 'chicken', 'cow', 'creeper', 'item', 'pig',
      'pillager', 'ravager', 'sheep', 'skeleton', 'spider', 'squid',
      'villager', 'vindicator', 'witch', 'wither', 'wither_skull', 'zombie',
    ]);
  });

  it('appends raiders without reordering prior keys or dense runtime ids', () => {
    const reg = createDefaultEntityRegistry();
    const order = reg.entries().map((d) => d.key);
    const prior = ['zombie', 'skeleton', 'creeper', 'spider', 'wither', 'wither_skull',
      'pig', 'cow', 'chicken', 'sheep', 'squid', 'bat', 'villager', 'item'];
    expect(order.slice(0, prior.length)).toEqual(prior);
    expect(order.slice(prior.length)).toEqual(['pillager', 'vindicator', 'ravager', 'witch']);
    expect(reg.getByRuntimeId(0).key).toBe('zombie');
    expect(reg.getRuntimeId(reg.getByKey('item')!.id)).toBe(13);
    expect(reg.getRuntimeId(reg.getByKey('pillager')!.id)).toBe(14);
    expect(reg.getRuntimeId(reg.getByKey('witch')!.id)).toBe(17);
  });

  it('registers every wave roster key as a non-persistent MONSTER', () => {
    const reg = createDefaultEntityRegistry();
    for (const key of ['pillager', 'vindicator', 'ravager', 'witch']) {
      const def = reg.getByKey(key)!;
      expect(def).toBeDefined();
      expect(def.category).toBe('MONSTER');
      expect(def.isPersistent).toBe(false);
      expect(def.isSummonable).toBe(true);
      expect(Number.isFinite(def.health!)).toBe(true);
      expect(def.health!).toBeGreaterThan(0);
      expect(Number.isFinite(def.attackDamage!)).toBe(true);
      expect(def.attackDamage!).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps zombie fields stable after raider append', () => {
    const reg = createDefaultEntityRegistry();
    const zombie = reg.getByKey('zombie')!;
    expect(zombie.category).toBe('MONSTER');
    expect(zombie.health).toBe(20);
    expect(zombie.attackDamage).toBe(3);
    expect(zombie.isSummonable).toBe(true);
    expect(zombie.isPersistent).toBe(true);
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
