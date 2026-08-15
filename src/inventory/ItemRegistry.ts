/**
 * Centralized item registry.
 *
 * Maps stable numeric item ids to inventory-item definitions: placeable block
 * items, tools, and food. World-block definitions live in a separate registry
 * (see `world/BlockRegistry.ts`) as of change 004. Item definitions own tool and
 * food metadata, and explicitly reference the block they place and the item a
 * broken block drops. Gameplay code must resolve all item properties through
 * this registry; item ids are never hard-coded in gameplay logic.
 */

import { type ResourceId, createResourceId, resourceIdToString } from '../data/ResourceId';
import { RegistryError } from '../data/Registry';
import { BlockTypeRegistry, ToolKind } from '../world/BlockRegistry';

/** Item ids are stable numeric identifiers for inventory items. */
export const enum ItemId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Water = 5,
  Bedrock = 6,
  Wood = 7,
  Leaves = 8,
  Glass = 9,
  Snow = 10,
  Gravel = 11,
  Planks = 12,
  Apple = 13,
  CoalOre = 14,
  IronOre = 15,
  Cobblestone = 16,
  Bricks = 17,
  Lava = 18,
  Stick = 19,
  WoodenPickaxe = 20,
  StonePickaxe = 21,
  WoodenAxe = 22,
  Coal = 23,
  RawIron = 24,
  Chest = 25,
  Furnace = 26,
}

/** An inventory-item definition. */
export interface ItemTypeDefinition {
  /** Stable numeric legacy id. This value is the current save identity. */
  id: number;
  /** Stable resource id backing the legacy numeric id. */
  resourceId: ResourceId;
  /** Stable string key. */
  key: string;
  /** Human-readable display name. */
  name: string;
  /** Atlas tile index for the item's inventory/icon texture. */
  iconTile: number;
  /** Maximum stack size. */
  stackSize: number;
  /** Maximum durability for a tool item (0/absent for non-tools). */
  maxDurability?: number;
  /** Tool family for a tool item. */
  toolKind?: ToolKind;
  /** Mining speed multiplier supplied by a tool. */
  toolPower?: number;
  /** Whether this item is edible. */
  isFood?: boolean;
  /** Hunger restored when eaten. */
  foodHunger?: number;
  /** Saturation restored when eaten. */
  foodSaturation?: number;
  /** The block this item places, referenced explicitly. Absent = not placeable. */
  placeBlock?: ResourceId;
}

/**
 * Typed registry of inventory-item definitions keyed by stable numeric id.
 *
 * Lookups are constant-time via a dense lookup array; resource-id and key maps
 * support compatibility/validation lookups. The numeric `id` is the persistent
 * save identity — generic runtime registry ids are intentionally absent.
 */
export class ItemTypeRegistry {
  private readonly byId = new Map<number, ItemTypeDefinition>();
  private readonly byKey = new Map<string, ItemTypeDefinition>();
  private readonly byResourceId = new Map<string, ItemTypeDefinition>();
  /** Mirrors Map entries for O(1) indexed access in the hot path. */
  private readonly fastLookup: (ItemTypeDefinition | undefined)[] = [];

  constructor(definitions: ItemTypeDefinition[]) {
    for (const def of definitions) {
      if (this.byId.has(def.id)) {
        throw new RegistryError(
          'DUPLICATE_ID',
          String(def.id),
          `duplicate legacy item id: ${def.id}`,
        );
      }
      this.byId.set(def.id, def);
      this.byKey.set(def.key, def);
      this.byResourceId.set(resourceIdToString(def.resourceId), def);
      this.fastLookup[def.id] = def;
    }
  }

  /** Look up an item by numeric id. Throws for unknown ids to catch bugs. */
  get(id: number): ItemTypeDefinition {
    const def = this.getById(id);
    if (!def) {
      throw new RegistryError('MISSING_ID', String(id), `unknown item id: ${id}`);
    }
    return def;
  }

  /** Look up an item by numeric id, returning undefined when absent. */
  getByLegacyId(id: number): ItemTypeDefinition | undefined {
    return this.getById(id);
  }

  /** Look up an item by resource id. Throws for unknown ids. */
  getByResourceId(rid: ResourceId): ItemTypeDefinition {
    const def = this.byResourceId.get(resourceIdToString(rid));
    if (!def) {
      throw new RegistryError('MISSING_ID', resourceIdToString(rid), 'unknown item resource id');
    }
    return def;
  }

  /** Look up an item by key. Returns undefined for unknown keys. */
  getByKey(key: string): ItemTypeDefinition | undefined {
    return this.byKey.get(key);
  }

  /** Whether a resource id is registered. */
  hasByResourceId(rid: ResourceId): boolean {
    return this.byResourceId.has(resourceIdToString(rid));
  }

  /** Whether a numeric id is registered. Useful for validating external writes. */
  has(id: number): boolean {
    return this.getById(id) !== undefined;
  }

  /** All registered definitions. */
  all(): ItemTypeDefinition[] {
    return [...this.byId.values()];
  }

  private getById(id: number): ItemTypeDefinition | undefined {
    if (Number.isInteger(id) && id >= 0 && id < this.fastLookup.length) {
      return this.fastLookup[id];
    }
    return this.byId.get(id);
  }
}

const rid = (path: string): ResourceId => createResourceId('minecraft', path);

/** Build the default item registry covering every current inventory value. */
export function createDefaultItemRegistry(): ItemTypeRegistry {
  const defs: ItemTypeDefinition[] = [
    {
      id: ItemId.Grass,
      resourceId: rid('grass'),
      key: 'grass',
      name: 'Grass Block',
      iconTile: 1,
      stackSize: 64,
      placeBlock: rid('grass'),
    },
    {
      id: ItemId.Dirt,
      resourceId: rid('dirt'),
      key: 'dirt',
      name: 'Dirt',
      iconTile: 2,
      stackSize: 64,
      placeBlock: rid('dirt'),
    },
    {
      id: ItemId.Stone,
      resourceId: rid('stone'),
      key: 'stone',
      name: 'Stone',
      iconTile: 4,
      stackSize: 64,
      placeBlock: rid('stone'),
    },
    {
      id: ItemId.Sand,
      resourceId: rid('sand'),
      key: 'sand',
      name: 'Sand',
      iconTile: 5,
      stackSize: 64,
      placeBlock: rid('sand'),
    },
    {
      id: ItemId.Water,
      resourceId: rid('water'),
      key: 'water',
      name: 'Water',
      iconTile: 6,
      stackSize: 64,
      placeBlock: rid('water'),
    },
    {
      id: ItemId.Bedrock,
      resourceId: rid('bedrock'),
      key: 'bedrock',
      name: 'Bedrock',
      iconTile: 7,
      stackSize: 64,
    },
    {
      id: ItemId.Wood,
      resourceId: rid('wood'),
      key: 'wood',
      name: 'Wood Log',
      iconTile: 8,
      stackSize: 64,
      placeBlock: rid('wood'),
    },
    {
      id: ItemId.Leaves,
      resourceId: rid('leaves'),
      key: 'leaves',
      name: 'Leaves',
      iconTile: 10,
      stackSize: 64,
      placeBlock: rid('leaves'),
    },
    {
      id: ItemId.Glass,
      resourceId: rid('glass'),
      key: 'glass',
      name: 'Glass',
      iconTile: 11,
      stackSize: 64,
      placeBlock: rid('glass'),
    },
    {
      id: ItemId.Snow,
      resourceId: rid('snow'),
      key: 'snow',
      name: 'Snow Block',
      iconTile: 12,
      stackSize: 64,
      placeBlock: rid('snow'),
    },
    {
      id: ItemId.Gravel,
      resourceId: rid('gravel'),
      key: 'gravel',
      name: 'Gravel',
      iconTile: 13,
      stackSize: 64,
      placeBlock: rid('gravel'),
    },
    {
      id: ItemId.Planks,
      resourceId: rid('planks'),
      key: 'planks',
      name: 'Oak Planks',
      iconTile: 14,
      stackSize: 64,
      placeBlock: rid('planks'),
    },
    {
      id: ItemId.Apple,
      resourceId: rid('apple'),
      key: 'apple',
      name: 'Apple',
      iconTile: 15,
      stackSize: 64,
      isFood: true,
      foodHunger: 4,
      foodSaturation: 2,
    },
    {
      id: ItemId.CoalOre,
      resourceId: rid('coal_ore'),
      key: 'coal_ore',
      name: 'Coal Ore',
      iconTile: 16,
      stackSize: 64,
      placeBlock: rid('coal_ore'),
    },
    {
      id: ItemId.IronOre,
      resourceId: rid('iron_ore'),
      key: 'iron_ore',
      name: 'Iron Ore',
      iconTile: 17,
      stackSize: 64,
      placeBlock: rid('iron_ore'),
    },
    {
      id: ItemId.Cobblestone,
      resourceId: rid('cobblestone'),
      key: 'cobblestone',
      name: 'Cobblestone',
      iconTile: 18,
      stackSize: 64,
      placeBlock: rid('cobblestone'),
    },
    {
      id: ItemId.Bricks,
      resourceId: rid('bricks'),
      key: 'bricks',
      name: 'Bricks',
      iconTile: 19,
      stackSize: 64,
      placeBlock: rid('bricks'),
    },
    {
      id: ItemId.Lava,
      resourceId: rid('lava'),
      key: 'lava',
      name: 'Lava',
      iconTile: 20,
      stackSize: 64,
      placeBlock: rid('lava'),
    },
    {
      id: ItemId.Stick,
      resourceId: rid('stick'),
      key: 'stick',
      name: 'Stick',
      iconTile: 21,
      stackSize: 64,
    },
    {
      id: ItemId.WoodenPickaxe,
      resourceId: rid('wooden_pickaxe'),
      key: 'wooden_pickaxe',
      name: 'Wooden Pickaxe',
      iconTile: 22,
      stackSize: 64,
      toolKind: ToolKind.Pickaxe,
      toolPower: 2.2,
      maxDurability: 59,
    },
    {
      id: ItemId.StonePickaxe,
      resourceId: rid('stone_pickaxe'),
      key: 'stone_pickaxe',
      name: 'Stone Pickaxe',
      iconTile: 23,
      stackSize: 64,
      toolKind: ToolKind.Pickaxe,
      toolPower: 4,
      maxDurability: 131,
    },
    {
      id: ItemId.WoodenAxe,
      resourceId: rid('wooden_axe'),
      key: 'wooden_axe',
      name: 'Wooden Axe',
      iconTile: 24,
      stackSize: 64,
      toolKind: ToolKind.Axe,
      toolPower: 2.4,
      maxDurability: 59,
    },
    {
      id: ItemId.Coal,
      resourceId: rid('coal'),
      key: 'coal',
      name: 'Coal',
      iconTile: 25,
      stackSize: 64,
    },
    {
      id: ItemId.RawIron,
      resourceId: rid('raw_iron'),
      key: 'raw_iron',
      name: 'Raw Iron',
      iconTile: 26,
      stackSize: 64,
    },
    {
      id: ItemId.Chest,
      resourceId: rid('chest'),
      key: 'chest',
      name: 'Chest',
      iconTile: 27,
      stackSize: 64,
      placeBlock: rid('chest'),
    },
    {
      id: ItemId.Furnace,
      resourceId: rid('furnace'),
      key: 'furnace',
      name: 'Furnace',
      iconTile: 28,
      stackSize: 64,
      placeBlock: rid('furnace'),
    },
  ];
  return new ItemTypeRegistry(defs);
}

/**
 * Validate every required cross-reference between the two registries at
 * bootstrap. A missing target blocks initialization rather than silently
 * substituting an unrelated resource.
 */
export function validateItemBlockCrossReferences(
  blockRegistry: BlockTypeRegistry,
  itemRegistry: ItemTypeRegistry,
): void {
  for (const block of blockRegistry.all()) {
    if (!block.breakable) {
      continue;
    }
    if (block.dropItem === undefined) {
      throw new RegistryError(
        'MISSING_ID',
        resourceIdToString(block.resourceId),
        `breakable block ${block.key} declares no dropItem`,
      );
    }
    if (!itemRegistry.hasByResourceId(block.dropItem)) {
      throw new RegistryError(
        'MISSING_ID',
        resourceIdToString(block.dropItem),
        `block ${block.key} drop references a missing item`,
      );
    }
  }
  for (const item of itemRegistry.all()) {
    if (item.placeBlock === undefined) {
      continue;
    }
    if (!blockRegistry.hasByResourceId(item.placeBlock)) {
      throw new RegistryError(
        'MISSING_ID',
        resourceIdToString(item.placeBlock),
        `item ${item.key} places a missing block`,
      );
    }
  }
}
