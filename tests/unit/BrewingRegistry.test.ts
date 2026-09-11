import { describe, it, expect } from 'vitest';
import { BlockId, ToolKind, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import {
  BLAZE_POWDER_ITEM,
  POTION_BOTTLE_ITEM,
  NETHER_WART_ITEM,
  REDSTONE_ITEM,
} from '../../src/inventory/BrewingRecipes';
import { ATLAS_ROWS, TILE_INDEX } from '../../src/rendering/TextureAtlas';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';

const blocks = createDefaultBlockRegistry();
const items = createDefaultItemRegistry();

describe('brewing stand block (260)', () => {
  it('pins the stable numeric block id', () => {
    expect(BlockId.BrewingStand).toBe(62);
  });

  it('registers an opaque pickaxe-mined device cube with tile-66 faces', () => {
    const def = blocks.getByLegacyId(BlockId.BrewingStand);
    expect(def?.key).toBe('brewing_stand');
    expect(def?.name).toBe('Brewing Stand');
    expect(def?.solid).toBe(true);
    expect(def?.opaque).toBe(true);
    expect(def?.breakable).toBe(true);
    expect(def?.hardness).toBe(0.5);
    expect(def?.preferredTool).toBe(ToolKind.Pickaxe);
    expect(def?.miningLevel).toBe(0);
    expect(def?.topTile).toBe(66);
    expect(def?.bottomTile).toBe(66);
    expect(def?.sideTile).toBe(66);
    expect(def && resourceIdToString(def.dropItem!)).toBe('minecraft:brewing_stand');
  });

  it('keeps the stand at exactly one block state', () => {
    const states = createDefaultBlockStateRegistry();
    expect(states.statesForBlock(BlockId.BrewingStand).length).toBe(1);
  });
});

describe('brewing items (260)', () => {
  it('pins the stable numeric item ids', () => {
    expect(ItemId.BrewingStand).toBe(64);
    expect(ItemId.BlazePowder).toBe(65);
    expect(ItemId.Potion).toBe(66);
  });

  it('registers the stand item as the block placer', () => {
    const def = items.getByLegacyId(ItemId.BrewingStand);
    expect(def?.key).toBe('brewing_stand');
    expect(def?.stackSize).toBe(64);
    expect(def?.iconTile).toBe(66);
    expect(def?.placeBlock).toBeDefined();
    const target = blocks.getByResourceId(def!.placeBlock!);
    expect(target?.key).toBe('brewing_stand');
    expect(target?.id).toBe(BlockId.BrewingStand);
  });

  it('registers blaze powder as stackable fuel with no placement', () => {
    const def = items.getByLegacyId(ItemId.BlazePowder);
    expect(def?.key).toBe('blaze_powder');
    expect(def?.stackSize).toBe(64);
    expect(def?.iconTile).toBe(67);
    expect(def?.placeBlock).toBeUndefined();
  });

  it('registers the potion bottle unstacked with no placement', () => {
    const def = items.getByLegacyId(ItemId.Potion);
    expect(def?.key).toBe('potion');
    expect(def?.stackSize).toBe(1);
    expect(def?.iconTile).toBe(68);
    expect(def?.placeBlock).toBeUndefined();
  });

  it('speaks the live-registry id vocabulary the 123 engine matches', () => {
    // Menu slots carry resourceIdToString(def.resourceId); the brewing
    // context compares those exact strings. Any drift here makes live fuel
    // or recipes silently unmatchable.
    expect(resourceIdToString(items.getByLegacyId(ItemId.BlazePowder)!.resourceId)).toBe(BLAZE_POWDER_ITEM);
    expect(resourceIdToString(items.getByLegacyId(ItemId.Potion)!.resourceId)).toBe(POTION_BOTTLE_ITEM);
    expect(resourceIdToString(items.getByLegacyId(ItemId.NetherWart)!.resourceId)).toBe(NETHER_WART_ITEM);
    expect(resourceIdToString(items.getByLegacyId(ItemId.Redstone)!.resourceId)).toBe(REDSTONE_ITEM);
  });
});

describe('brewing atlas tiles (260)', () => {
  it('pins the fresh tile indices past every existing iconTile', () => {
    expect(TILE_INDEX.brewingStand).toBe(66);
    expect(TILE_INDEX.blazePowder).toBe(67);
    expect(TILE_INDEX.potionBottle).toBe(68);
    expect(ATLAS_ROWS).toBe(5);
  });
});
