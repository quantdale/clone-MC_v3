import { describe, it, expect } from 'vitest';
import { BlockId, createDefaultRegistry } from '../../src/world/BlockRegistry';

describe('block registry', () => {
  const registry = createDefaultRegistry();

  it('registers all nine required blocks with their stable ids and keys', () => {
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
    ];
    for (const [id, key] of required) {
      const def = registry.get(id);
      expect(def.id).toBe(id);
      expect(def.key).toBe(key);
      // id<->key lookups must agree.
      expect(registry.getByKey(def.key)?.id).toBe(id);
    }
    // The nine ids are unique and map back to the same nine definitions.
    expect(registry.all()).toHaveLength(9);
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