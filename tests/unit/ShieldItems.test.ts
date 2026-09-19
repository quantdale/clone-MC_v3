import { describe, expect, it } from 'vitest';
import { ItemId, createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';

describe('shield catalog (279)', () => {
  it('registers the stable durable, non-placeable, non-food shield definition', () => {
    const registry = createDefaultItemRegistry();
    const byId = registry.getByLegacyId(ItemId.Shield);
    const byKey = registry.getByKey('shield');
    expect(byId).toBe(byKey);
    expect(byId).toMatchObject({
      id: 71,
      key: 'shield',
      name: 'Shield',
      stackSize: 1,
      maxDurability: 336,
      iconTile: 73,
    });
    expect(byId?.resourceId).toEqual({ namespace: 'minecraft', path: 'shield' });
    expect(byId?.placeBlock).toBeUndefined();
    expect(byId?.isFood).not.toBe(true);
  });
});
