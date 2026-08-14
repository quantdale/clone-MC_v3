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
    expect(blockRegistry.has(ItemId.WoodenPickaxe)).toBe(false);
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
    // The same numeric id carries no block and no tool metadata on the block side.
    expect(blockRegistry.has(ItemId.WoodenPickaxe)).toBe(false);
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
    const table: Array<[number, string, 'block' | 'item' | 'both']> = [
      [0, 'air', 'block'],
      [1, 'grass', 'both'],
      [2, 'dirt', 'both'],
      [3, 'stone', 'both'],
      [4, 'sand', 'both'],
      [5, 'water', 'both'],
      [6, 'bedrock', 'both'],
      [7, 'wood', 'both'],
      [8, 'leaves', 'both'],
      [9, 'glass', 'both'],
      [10, 'snow', 'both'],
      [11, 'gravel', 'both'],
      [12, 'planks', 'both'],
      [13, 'apple', 'item'],
      [14, 'coal_ore', 'both'],
      [15, 'iron_ore', 'both'],
      [16, 'cobblestone', 'both'],
      [17, 'bricks', 'both'],
      [18, 'lava', 'both'],
      [19, 'stick', 'item'],
      [20, 'wooden_pickaxe', 'item'],
      [21, 'stone_pickaxe', 'item'],
      [22, 'wooden_axe', 'item'],
      [23, 'coal', 'item'],
      [24, 'raw_iron', 'item'],
    ];
    for (const [id, path, kind] of table) {
      const expected = `minecraft:${path}`;
      if (kind === 'block' || kind === 'both') {
        expect(resourceIdToString(blockRegistry.getByLegacyId(id)!.resourceId)).toBe(expected);
      } else {
        expect(blockRegistry.getByLegacyId(id)).toBeUndefined();
      }
      if (kind === 'item' || kind === 'both') {
        expect(resourceIdToString(itemRegistry.getByLegacyId(id)!.resourceId)).toBe(expected);
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
