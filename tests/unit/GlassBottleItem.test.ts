import { describe, it, expect } from 'vitest';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';
import { TILE_INDEX } from '../../src/rendering/TextureAtlas';
import { createDefaultRecipeRegistry } from '../../src/inventory/RecipeRegistry';
import { resolveWitchDrops } from '../../src/simulation/GunpowderMobDrops';

/**
 * Glass bottle item (298): registry definition, isolated icon tile, no
 * crafting recipe (the container-ui golden experiment showed the crafting
 * summary line and every row would shift, not solely a new row), and raid
 * witches now drop real glass bottles from the vanilla table.
 */

const registry = createDefaultItemRegistry();

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

describe('glass bottle item (298)', () => {
  it('is registered as a plain stackable non-placeable item', () => {
    const def = registry.getByKey('glass_bottle')!;
    expect(def.id).toBe(ItemId.GlassBottle);
    expect(def.id).toBe(74);
    expect(def.name).toBe('Glass Bottle');
    expect(def.stackSize).toBe(64);
    expect(def.iconTile).toBe(76);
    expect(def.placeBlock).toBeUndefined();
    expect(def.isFood).toBeFalsy();
    expect(def.maxDurability ?? 0).toBe(0);
    expect(registry.getByLegacyId(74)?.key).toBe('glass_bottle');
  });

  it('tile 76 is the glass bottle tile and no other atlas entry or item icon uses it', () => {
    expect(TILE_INDEX.glassBottle).toBe(76);
    expect(Object.entries(TILE_INDEX).filter(([, v]) => v === 76).map(([k]) => k)).toEqual(['glassBottle']);
    expect(registry.all().filter((d) => d.iconTile === 76).map((d) => d.key)).toEqual(['glass_bottle']);
  });

  it('existing ids are unchanged (gunpowder 73 and potion keep their ids)', () => {
    expect(registry.getByKey('gunpowder')?.id).toBe(73);
    expect(registry.getByKey('potion')?.id).toBe(ItemId.Potion);
  });

  it('has no crafting recipe (golden-isolation rule failed; documented gap)', () => {
    const legacy = createDefaultRecipeRegistry().toLegacyRecipes();
    expect(legacy).toHaveLength(9);
    expect(legacy.some((r) => r.output === ItemId.GlassBottle)).toBe(false);
    expect(legacy.some((r) => r.ingredients.some(([id]) => id === ItemId.Glass))).toBe(false);
    expect(createDefaultRecipeRegistry().getByKey('glass_bottle')).toBeUndefined();
  });

  it('witch glass-bottle rolls drop real bottles (ticket 4, 0-2 each)', () => {
    const ticket = (t: number) => (t + 0.5) / 8;
    expect(resolveWitchDrops(registry, seq(0, ticket(4), 0.5)).stacks).toEqual([{ item: ItemId.GlassBottle, count: 1 }]);
    expect(resolveWitchDrops(registry, seq(0, ticket(4), 0)).stacks).toEqual([]);
  });
});
