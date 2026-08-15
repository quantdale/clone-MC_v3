import { describe, it, expect } from 'vitest';
import {
  BlockId,
  BlockTypeDefinition,
  BlockTypeRegistry,
  RenderCategory,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  ItemTypeRegistry,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createResourceId, resourceIdToString } from '../../src/data/ResourceId';
import { Inventory } from '../../src/inventory/Inventory';

/**
 * Change 004 invariants: item-only resources are absent from the block registry;
 * item definitions own tool/food metadata and explicitly reference target blocks;
 * block drops reference item identity; legacy numeric ids retain their meaning;
 * duplicate legacy mappings are rejected; unknown legacy values are safe-rejected;
 * generic runtime ids are never persisted.
 */
describe('block/item registry separation', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('keeps item-only resources out of the block registry', () => {
    const appleRid = createResourceId('minecraft', 'apple');
    expect(itemRegistry.hasByResourceId(appleRid)).toBe(true);
    expect(blockRegistry.hasByResourceId(appleRid)).toBe(false);
    // The block registry has no apple key at all.
    expect(itemRegistry.getByKey('apple')?.id).toBe(ItemId.Apple);
    expect(blockRegistry.getByKey('apple')).toBeUndefined();
    // Pen/tool-only items are likewise absent as blocks.
    expect(blockRegistry.getByKey('wooden_pickaxe')).toBeUndefined();
    expect(blockRegistry.getByKey('stick')).toBeUndefined();
    expect(blockRegistry.has(ItemId.RawIron)).toBe(false);
  });

  it('resolves a placeable item to its target block via resource identity', () => {
    const grassItem = itemRegistry.getByKey('grass')!;
    expect(grassItem.placeBlock).toBeDefined();
    const target = blockRegistry.getByResourceId(grassItem.placeBlock!);
    expect(resourceIdToString(target.resourceId)).toBe('minecraft:grass');
    expect(target.id).toBe(BlockId.Grass);
    expect(resourceIdToString(grassItem.placeBlock!)).toBe(
      resourceIdToString(blockRegistry.getByKey('grass')!.resourceId),
    );
  });

  it('owns tool metadata on the item, not the block', () => {
    const pickaxe = itemRegistry.getByKey('wooden_pickaxe')!;
    expect(pickaxe.toolKind).toBeDefined();
    expect(pickaxe.toolPower).toBeGreaterThan(1);
    expect(pickaxe.maxDurability).toBeGreaterThan(0);
    // The block side of the shared numeric space carries no tool metadata: the
    // furnace block at id 20 is not a tool and the pickaxe has no block.
    const furnaceDef = blockRegistry.get(BlockId.Furnace) as unknown as Record<string, unknown>;
    expect('toolKind' in furnaceDef).toBe(false);
    expect('toolPower' in furnaceDef).toBe(false);
    expect('maxDurability' in furnaceDef).toBe(false);
    expect(blockRegistry.has(ItemId.RawIron)).toBe(false);
  });

  it('resolves a block drop to the correct item id', () => {
    const coalOre = blockRegistry.getByKey('coal_ore')!;
    expect(coalOre.dropItem).toBeDefined();
    const dropped = itemRegistry.getByResourceId(coalOre.dropItem!);
    expect(dropped.id).toBe(ItemId.Coal);
    expect(resourceIdToString(coalOre.dropItem!)).toBe('minecraft:coal');
    // Iron ore drops raw iron, not the ore item.
    expect(blockRegistry.getByKey('iron_ore')!.dropItem).toBeDefined();
    expect(
      itemRegistry.getByResourceId(blockRegistry.getByKey('iron_ore')!.dropItem!).id,
    ).toBe(ItemId.RawIron);
  });

  it('preserves every legacy numeric id across both registries', () => {
    const table: Array<[number, string | null, string | null]> = [
      [0, 'air', null],
      [1, 'grass', 'grass'],
      [2, 'dirt', 'dirt'],
      [3, 'stone', 'stone'],
      [4, 'sand', 'sand'],
      [5, 'water', 'water'],
      [6, 'bedrock', 'bedrock'],
      [7, 'wood', 'wood'],
      [8, 'leaves', 'leaves'],
      [9, 'glass', 'glass'],
      [10, 'snow', 'snow'],
      [11, 'gravel', 'gravel'],
      [12, 'planks', 'planks'],
      [13, null, 'apple'],
      [14, 'coal_ore', 'coal_ore'],
      [15, 'iron_ore', 'iron_ore'],
      [16, 'cobblestone', 'cobblestone'],
      [17, 'bricks', 'bricks'],
      [18, 'lava', 'lava'],
      [19, 'chest', 'stick'],
      [20, 'furnace', 'wooden_pickaxe'],
      [21, null, 'stone_pickaxe'],
      [22, null, 'wooden_axe'],
      [23, null, 'coal'],
      [24, null, 'raw_iron'],
      [25, null, 'chest'],
      [26, null, 'furnace'],
    ];
    for (const [id, blockPath, itemPath] of table) {
      if (blockPath !== null) {
        expect(resourceIdToString(blockRegistry.getByLegacyId(id)!.resourceId)).toBe(`minecraft:${blockPath}`);
      } else {
        expect(blockRegistry.getByLegacyId(id)).toBeUndefined();
      }
      if (itemPath !== null) {
        expect(resourceIdToString(itemRegistry.getByLegacyId(id)!.resourceId)).toBe(`minecraft:${itemPath}`);
      } else {
        expect(itemRegistry.getByLegacyId(id)).toBeUndefined();
      }
    }
  });

  it('rejects duplicate legacy id mappings', () => {
    const def: BlockTypeDefinition = {
      id: 99,
      resourceId: createResourceId('test', 'dup'),
      key: 'dup',
      name: 'Dup',
      solid: false,
      opaque: false,
      breakable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: Infinity,
    };
    expect(() => new BlockTypeRegistry([def, def])).toThrow();
    expect(() => new ItemTypeRegistry([
      { ...def, id: 7, resourceId: createResourceId('test', 'dupitem'), key: 'dupitem', iconTile: 0, stackSize: 64 },
      { ...def, id: 7, resourceId: createResourceId('test', 'dupitem2'), key: 'dupitem2', iconTile: 0, stackSize: 64 },
    ])).toThrow();
  });

  it('safe-rejects unknown legacy values when restoring inventory', () => {
    const inv = new Inventory();
    const snapshot = { version: 1, slots: [999], counts: [1], storage: [], selected: 0 };
    // The validator treats unknown ids as invalid, so restore refuses them.
    expect(inv.restore(snapshot, (id) => itemRegistry.has(id))).toBe(false);
    // A known item id is accepted.
    const good = { version: 1, slots: [ItemId.Stone], counts: [1], storage: [], selected: 0 };
    expect(inv.restore(good, (id) => itemRegistry.has(id))).toBe(true);
  });

  it('round-trips default hotbar inventory state', () => {
    const fresh = new Inventory();
    const restored = new Inventory();
    expect(restored.restore(fresh.snapshot())).toBe(true);
    expect(restored.slots).toEqual(fresh.slots);
    expect(restored.slots.map((s) => s.count)).toEqual(fresh.slots.map((s) => s.count));
  });

  it('places blocks through resource identity, never numeric inference', () => {
    for (const item of itemRegistry.all()) {
      if (item.placeBlock === undefined) {
        // Non-placeable items (food, tools, raw materials) carry no placeBlock.
        expect(item.isFood === true || item.toolKind !== undefined || ['stick', 'coal', 'raw_iron', 'bedrock'].includes(item.key)).toBe(true);
        continue;
      }
      const placed = blockRegistry.getByResourceId(item.placeBlock);
      expect(blockRegistry.has(placed.id)).toBe(true);
      // Resolution is by resource path, not by coincidental numeric equality.
      expect(resourceIdToString(item.placeBlock)).toBe(`minecraft:${item.key}`);
    }
  });

  it('never persists generic runtime ids', () => {
    for (const def of blockRegistry.all()) {
      expect('runtimeId' in def).toBe(false);
    }
    for (const def of itemRegistry.all()) {
      expect('runtimeId' in def).toBe(false);
    }
    // A serialized default block definition carries no runtime id field.
    const serialized = JSON.parse(JSON.stringify(blockRegistry.get(BlockId.Stone)));
    expect(serialized.runtimeId).toBeUndefined();
  });

  it('validates block/item cross-references at bootstrap', () => {
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();

    // A breakable block whose drop is missing from the item registry must be rejected.
    const brokenBlock = new BlockTypeRegistry([
      {
        id: 1,
        resourceId: createResourceId('minecraft', 'grass'),
        key: 'grass',
        name: 'Grass',
        solid: true,
        opaque: true,
        breakable: true,
        renderCategory: RenderCategory.Opaque,
        topTile: 1,
        bottomTile: 2,
        sideTile: 3,
        hardness: 0.1,
        dropItem: createResourceId('minecraft', 'does_not_exist'),
      },
    ]);
    const items = new ItemTypeRegistry([
      { id: 1, resourceId: createResourceId('minecraft', 'grass'), key: 'grass', name: 'Grass', iconTile: 1, stackSize: 64, placeBlock: createResourceId('minecraft', 'grass') },
    ]);
    expect(() => validateItemBlockCrossReferences(brokenBlock, items)).toThrow();
  });
});
