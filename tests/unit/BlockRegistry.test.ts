import { describe, it, expect } from 'vitest';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createResourceId } from '../../src/data/ResourceId';

describe('block registry', () => {
  const registry = createDefaultBlockRegistry();

  it('registers all blocks with their stable ids and keys', () => {
    const required: Array<[number, string]> = [
      [BlockId.Air, 'air'],
      [BlockId.Grass, 'grass'],
      [BlockId.Dirt, 'dirt'],
      [BlockId.Stone, 'stone'],
      [BlockId.Sand, 'sand'],
      [BlockId.Water, 'water'],
      [BlockId.Bedrock, 'bedrock'],
      [BlockId.Wood, 'wood'],
      [BlockId.Leaves, 'leaves'],
      [BlockId.Glass, 'glass'],
      [BlockId.Snow, 'snow'],
      [BlockId.Gravel, 'gravel'],
      [BlockId.Planks, 'planks'],
      [BlockId.CoalOre, 'coal_ore'],
      [BlockId.IronOre, 'iron_ore'],
      [BlockId.Cobblestone, 'cobblestone'],
      [BlockId.Bricks, 'bricks'],
      [BlockId.Lava, 'lava'],
      [BlockId.Chest, 'chest'],
      [BlockId.Furnace, 'furnace'],
      [BlockId.EnchantingTable, 'enchanting_table'],
      [BlockId.Bookshelf, 'bookshelf'],
      [BlockId.Wheat, 'wheat'],
      [BlockId.Farmland, 'farmland'],
      [BlockId.Fire, 'fire'],
    ];
    for (const [id, key] of required) {
      const def = registry.get(id);
      expect(def.id).toBe(id);
      expect(def.key).toBe(key);
      // id<->key lookups must agree.
      expect(registry.getByKey(def.key)?.id).toBe(id);
    }
    // The ids are unique and map back to the same definitions.
    expect(registry.all()).toHaveLength(48);
  });

  it('registers the enchanting-table and bookshelf blocks (120)', () => {
    const table = registry.get(BlockId.EnchantingTable);
    expect(table.key).toBe('enchanting_table');
    expect(table.solid).toBe(true);
    expect(table.opaque).toBe(true);
    expect(table.breakable).toBe(true);
    expect(table.dropItem !== undefined).toBe(true);

    const shelf = registry.get(BlockId.Bookshelf);
    expect(shelf.key).toBe('bookshelf');
    expect(shelf.solid).toBe(true);
    expect(shelf.opaque).toBe(true);
    expect(shelf.breakable).toBe(true);
    expect(shelf.dropItem !== undefined).toBe(true);
  });

  it('pins the full block-property contract per block', () => {
    const expectDef = (id: number, props: {
      solid: boolean;
      opaque: boolean;
      breakable: boolean;
      topTile: number;
      bottomTile: number;
      sideTile: number;
    }): void => {
      const def = registry.get(id);
      expect(def.solid).toBe(props.solid);
      expect(def.opaque).toBe(props.opaque);
      expect(def.breakable).toBe(props.breakable);
      expect(def.topTile).toBe(props.topTile);
      expect(def.bottomTile).toBe(props.bottomTile);
      expect(def.sideTile).toBe(props.sideTile);
    };

    expectDef(BlockId.Air, { solid: false, opaque: false, breakable: false, topTile: 0, bottomTile: 0, sideTile: 0 });
    expectDef(BlockId.Grass, { solid: true, opaque: true, breakable: true, topTile: 1, bottomTile: 2, sideTile: 3 });
    expectDef(BlockId.Dirt, { solid: true, opaque: true, breakable: true, topTile: 2, bottomTile: 2, sideTile: 2 });
    expectDef(BlockId.Stone, { solid: true, opaque: true, breakable: true, topTile: 4, bottomTile: 4, sideTile: 4 });
    expectDef(BlockId.Sand, { solid: true, opaque: true, breakable: true, topTile: 5, bottomTile: 5, sideTile: 5 });
    expectDef(BlockId.Water, { solid: false, opaque: false, breakable: false, topTile: 6, bottomTile: 6, sideTile: 6 });
    expectDef(BlockId.Bedrock, { solid: true, opaque: true, breakable: false, topTile: 7, bottomTile: 7, sideTile: 7 });
    expectDef(BlockId.Wood, { solid: true, opaque: true, breakable: true, topTile: 8, bottomTile: 8, sideTile: 9 });
    expectDef(BlockId.Leaves, { solid: true, opaque: false, breakable: true, topTile: 10, bottomTile: 10, sideTile: 10 });
    expectDef(BlockId.Glass, { solid: true, opaque: false, breakable: true, topTile: 11, bottomTile: 11, sideTile: 11 });
    expectDef(BlockId.Snow, { solid: true, opaque: true, breakable: true, topTile: 12, bottomTile: 12, sideTile: 12 });
    expectDef(BlockId.Gravel, { solid: true, opaque: true, breakable: true, topTile: 13, bottomTile: 13, sideTile: 13 });
    expectDef(BlockId.Planks, { solid: true, opaque: true, breakable: true, topTile: 14, bottomTile: 14, sideTile: 14 });
    expectDef(BlockId.CoalOre, { solid: true, opaque: true, breakable: true, topTile: 16, bottomTile: 16, sideTile: 16 });
    expectDef(BlockId.IronOre, { solid: true, opaque: true, breakable: true, topTile: 17, bottomTile: 17, sideTile: 17 });
    expectDef(BlockId.Cobblestone, { solid: true, opaque: true, breakable: true, topTile: 18, bottomTile: 18, sideTile: 18 });
    expectDef(BlockId.Bricks, { solid: true, opaque: true, breakable: true, topTile: 19, bottomTile: 19, sideTile: 19 });
    expectDef(BlockId.Lava, { solid: false, opaque: false, breakable: false, topTile: 20, bottomTile: 20, sideTile: 20 });
    expectDef(BlockId.Farmland, { solid: true, opaque: true, breakable: true, topTile: 2, bottomTile: 2, sideTile: 2 });
  });

  it('exposes solidity, opacity, breakability', () => {
    expect(registry.isSolid(BlockId.Grass)).toBe(true);
    expect(registry.isSolid(BlockId.Air)).toBe(false);
    expect(registry.isSolid(BlockId.Water)).toBe(false); // water is not solid
    expect(registry.isOpaque(BlockId.Stone)).toBe(true);
    expect(registry.isOpaque(BlockId.Leaves)).toBe(false); // leaves are not opaque
    // occludesFace mirrors opacity (used for face culling).
    expect(registry.occludesFace(BlockId.Stone)).toBe(true);
    expect(registry.occludesFace(BlockId.Leaves)).toBe(false);
    expect(registry.get(BlockId.Bedrock).breakable).toBe(false);
    expect(registry.get(BlockId.Grass).breakable).toBe(true);
    expect(registry.get(BlockId.CoalOre).hardness).toBeGreaterThan(registry.get(BlockId.Stone).hardness);
    expect(registry.get(BlockId.IronOre).hardness).toBeGreaterThan(registry.get(BlockId.CoalOre).hardness);
    // Drops reference item resource ids, never block ids.
    expect(registry.get(BlockId.CoalOre).dropItem).toEqual(createResourceId('minecraft', 'coal'));
    expect(registry.get(BlockId.IronOre).dropItem).toEqual(createResourceId('minecraft', 'raw_iron'));
  });

  it('throws for unknown ids', () => {
    expect(() => registry.get(999)).toThrow();
  });

  it('provides distinct face tiles for grass', () => {
    const grass = registry.get(BlockId.Grass);
    expect(grass.topTile).not.toBe(grass.sideTile);
    expect(grass.sideTile).not.toBe(grass.bottomTile);
  });

  it('looks up by key', () => {
    expect(registry.getByKey('stone')?.id).toBe(BlockId.Stone);
    expect(registry.getByKey('does-not-exist')).toBeUndefined();
  });
});
