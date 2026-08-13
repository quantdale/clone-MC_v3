import { describe, it, expect } from 'vitest';
import { BlockId, createDefaultRegistry } from '../../src/world/BlockRegistry';

describe('block registry', () => {
  const registry = createDefaultRegistry();

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
      [BlockId.Apple, 'apple'],
      [BlockId.CoalOre, 'coal_ore'],
      [BlockId.IronOre, 'iron_ore'],
      [BlockId.Cobblestone, 'cobblestone'],
      [BlockId.Bricks, 'bricks'],
      [BlockId.Lava, 'lava'],
      [BlockId.Stick, 'stick'],
      [BlockId.WoodenPickaxe, 'wooden_pickaxe'],
      [BlockId.StonePickaxe, 'stone_pickaxe'],
      [BlockId.WoodenAxe, 'wooden_axe'],
      [BlockId.Coal, 'coal'],
      [BlockId.RawIron, 'raw_iron'],
    ];
    for (const [id, key] of required) {
      const def = registry.get(id);
      expect(def.id).toBe(id);
      expect(def.key).toBe(key);
      // id<->key lookups must agree.
      expect(registry.getByKey(def.key)?.id).toBe(id);
    }
    // The ids are unique and map back to the same definitions.
    expect(registry.all()).toHaveLength(25);
  });

  it('pins the full block-property contract per block', () => {
    const expectDef = (id: number, props: {
      solid: boolean;
      opaque: boolean;
      breakable: boolean;
      placeable: boolean;
      topTile: number;
      bottomTile: number;
      sideTile: number;
    }): void => {
      const def = registry.get(id);
      expect(def.solid).toBe(props.solid);
      expect(def.opaque).toBe(props.opaque);
      expect(def.breakable).toBe(props.breakable);
      expect(def.placeable).toBe(props.placeable);
      expect(def.topTile).toBe(props.topTile);
      expect(def.bottomTile).toBe(props.bottomTile);
      expect(def.sideTile).toBe(props.sideTile);
    };

    expectDef(BlockId.Air, { solid: false, opaque: false, breakable: false, placeable: false, topTile: 0, bottomTile: 0, sideTile: 0 });
    expectDef(BlockId.Grass, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 1, bottomTile: 2, sideTile: 3 });
    expectDef(BlockId.Dirt, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 2, bottomTile: 2, sideTile: 2 });
    expectDef(BlockId.Stone, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 4, bottomTile: 4, sideTile: 4 });
    expectDef(BlockId.Sand, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 5, bottomTile: 5, sideTile: 5 });
    expectDef(BlockId.Water, { solid: false, opaque: false, breakable: false, placeable: true, topTile: 6, bottomTile: 6, sideTile: 6 });
    expectDef(BlockId.Bedrock, { solid: true, opaque: true, breakable: false, placeable: false, topTile: 7, bottomTile: 7, sideTile: 7 });
    expectDef(BlockId.Wood, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 8, bottomTile: 8, sideTile: 9 });
    expectDef(BlockId.Leaves, { solid: true, opaque: false, breakable: true, placeable: true, topTile: 10, bottomTile: 10, sideTile: 10 });
    expectDef(BlockId.Glass, { solid: true, opaque: false, breakable: true, placeable: true, topTile: 11, bottomTile: 11, sideTile: 11 });
    expectDef(BlockId.Snow, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 12, bottomTile: 12, sideTile: 12 });
    expectDef(BlockId.Gravel, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 13, bottomTile: 13, sideTile: 13 });
    expectDef(BlockId.Planks, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 14, bottomTile: 14, sideTile: 14 });
    expectDef(BlockId.Apple, { solid: false, opaque: false, breakable: false, placeable: false, topTile: 15, bottomTile: 15, sideTile: 15 });
    expectDef(BlockId.CoalOre, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 16, bottomTile: 16, sideTile: 16 });
    expectDef(BlockId.IronOre, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 17, bottomTile: 17, sideTile: 17 });
    expectDef(BlockId.Cobblestone, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 18, bottomTile: 18, sideTile: 18 });
    expectDef(BlockId.Bricks, { solid: true, opaque: true, breakable: true, placeable: true, topTile: 19, bottomTile: 19, sideTile: 19 });
    expectDef(BlockId.Lava, { solid: false, opaque: false, breakable: false, placeable: true, topTile: 20, bottomTile: 20, sideTile: 20 });
    expectDef(BlockId.Stick, { solid: false, opaque: false, breakable: false, placeable: false, topTile: 21, bottomTile: 21, sideTile: 21 });
    expectDef(BlockId.WoodenPickaxe, { solid: false, opaque: false, breakable: false, placeable: false, topTile: 22, bottomTile: 22, sideTile: 22 });
    expectDef(BlockId.StonePickaxe, { solid: false, opaque: false, breakable: false, placeable: false, topTile: 23, bottomTile: 23, sideTile: 23 });
    expectDef(BlockId.WoodenAxe, { solid: false, opaque: false, breakable: false, placeable: false, topTile: 24, bottomTile: 24, sideTile: 24 });
    expectDef(BlockId.Coal, { solid: false, opaque: false, breakable: false, placeable: false, topTile: 25, bottomTile: 25, sideTile: 25 });
    expectDef(BlockId.RawIron, { solid: false, opaque: false, breakable: false, placeable: false, topTile: 26, bottomTile: 26, sideTile: 26 });
  });

  it('exposes solidity, opacity, breakability, placeability', () => {
    expect(registry.isSolid(BlockId.Grass)).toBe(true);
    expect(registry.isSolid(BlockId.Air)).toBe(false);
    expect(registry.isSolid(BlockId.Water)).toBe(false); // water is not solid
    expect(registry.isOpaque(BlockId.Stone)).toBe(true);
    expect(registry.isOpaque(BlockId.Leaves)).toBe(false); // leaves are not opaque
    // occludesFace mirrors opacity (used for face culling).
    expect(registry.occludesFace(BlockId.Stone)).toBe(true);
    expect(registry.occludesFace(BlockId.Leaves)).toBe(false);
    expect(registry.get(BlockId.Bedrock).breakable).toBe(false);
    expect(registry.get(BlockId.Bedrock).placeable).toBe(false);
    expect(registry.get(BlockId.Grass).breakable).toBe(true);
    expect(registry.get(BlockId.Grass).placeable).toBe(true);
    expect(registry.get(BlockId.CoalOre).hardness).toBeGreaterThan(registry.get(BlockId.Stone).hardness);
    expect(registry.get(BlockId.IronOre).hardness).toBeGreaterThan(registry.get(BlockId.CoalOre).hardness);
    expect(registry.get(BlockId.WoodenPickaxe).maxDurability).toBe(59);
    expect(registry.get(BlockId.StonePickaxe).toolPower).toBeGreaterThan(registry.get(BlockId.WoodenPickaxe).toolPower!);
    expect(registry.get(BlockId.CoalOre).dropId).toBe(BlockId.Coal);
    expect(registry.get(BlockId.IronOre).dropId).toBe(BlockId.RawIron);
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
