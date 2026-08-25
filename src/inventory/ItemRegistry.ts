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
import { TagRegistry, type TagDefinition, type TagMember } from '../data/TagRegistry';
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
  IronIngot = 27,
  LapisLazuli = 28,
  Book = 29,
  Bookshelf = 30,
  EnchantingTable = 31,
  WheatSeeds = 32,
  Wheat = 33,
  BoneMeal = 34,
  Porkchop = 35,
  RottenFlesh = 36,
  Redstone = 37,
  Lever = 38,
  StoneButton = 39,
  PressurePlate = 40,
  RedstoneTorch = 41,
  RedstoneRepeater = 42,
  RedstoneComparator = 43,
  Observer = 44,
  RedstoneLamp = 45,
  Door = 46,
  Trapdoor = 47,
  Piston = 48,
  StickyPiston = 49,
  Hopper = 50,
  Dropper = 51,
  Dispenser = 52,
  Tnt = 53,
  Rail = 54,
  Netherrack = 56,
  Obsidian = 57,
  SoulSand = 58,
  NetherWart = 59,
  SoulSoil = 60,
  WitherSkull = 61,
  WitherSkeletonSkull = 62,
  NetherStar = 63,
}

/**
 * One status effect granted by eating a food item. Identical in shape to a potion
 * effect row (`PotionEffectData`) so the same `applyConsumeEffects` helper serves both.
 * `typeId` follows the `minecraft:effect/<key>` convention.
 */
export interface FoodEffectData {
  /** Effect-type ResourceId string, e.g. `minecraft:effect/regeneration`. */
  readonly typeId: string;
  /** Effect duration in seconds (>= 0). */
  readonly duration: number;
  /** Effect amplifier/level (>= 0). */
  readonly amplifier: number;
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
  /** Armor protection points contributed when worn (default 0). Added in 116. */
  defensePoints?: number;
  /** Armor toughness preserving protection at high damage (default 0). Added in 116. */
  toughness?: number;
  /** Tool family for a tool item. */
  toolKind?: ToolKind;
  /** Tier of a tool item; higher tiers satisfy higher block mining levels. `0` (default) for non-tools. */
  toolTier?: number;
  /** Mining speed multiplier supplied by a tool. */
  toolPower?: number;
  /** Whether this item is edible. */
  isFood?: boolean;
  /** Whether this item is a weapon (sword). Reserved enchantment target; none set yet. */
  isWeapon?: boolean;
  /** Whether this item is a bow. Reserved enchantment target; none set yet. */
  isBow?: boolean;
  /** Whether this item is a fishing rod. Reserved enchantment target; none set yet. */
  isFishingRod?: boolean;
  /** Enchanting-table "enchantability" — biases offer strength; undefined ⇒ 0 (not enchantable). Added in 120. */
  enchantability?: number;
  /** Hunger restored when eaten. */
  foodHunger?: number;
  /** Saturation restored when eaten. */
  foodSaturation?: number;
  /** Status effects applied when this food is eaten. Each row uses a
   *  `minecraft:effect/<key>` typeId. Absent = no effects (default food). */
  foodEffects?: readonly FoodEffectData[];
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
      // Durable items never stack (vanilla parity): a shared-damage pile would
      // destroy every copy when the shared durability breaks (see the
      // durable-items-stack invariant below).
      stackSize: 1,
      toolKind: ToolKind.Pickaxe,
      toolPower: 2.2,
      toolTier: 1,
      maxDurability: 59,
      enchantability: 15,
    },
    {
      id: ItemId.StonePickaxe,
      resourceId: rid('stone_pickaxe'),
      key: 'stone_pickaxe',
      name: 'Stone Pickaxe',
      iconTile: 23,
      stackSize: 1,
      toolKind: ToolKind.Pickaxe,
      toolPower: 4,
      toolTier: 2,
      maxDurability: 131,
      enchantability: 5,
    },
    {
      id: ItemId.WoodenAxe,
      resourceId: rid('wooden_axe'),
      key: 'wooden_axe',
      name: 'Wooden Axe',
      iconTile: 24,
      stackSize: 1,
      toolKind: ToolKind.Axe,
      toolPower: 2.4,
      toolTier: 1,
      maxDurability: 59,
      enchantability: 15,
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
    {
      id: ItemId.IronIngot,
      resourceId: rid('iron_ingot'),
      key: 'iron_ingot',
      name: 'Iron Ingot',
      iconTile: 29,
      stackSize: 64,
    },
    {
      id: ItemId.LapisLazuli,
      resourceId: rid('lapis_lazuli'),
      key: 'lapis_lazuli',
      name: 'Lapis Lazuli',
      iconTile: 30,
      stackSize: 64,
    },
    {
      id: ItemId.Book,
      resourceId: rid('book'),
      key: 'book',
      name: 'Book',
      iconTile: 31,
      stackSize: 64,
      enchantability: 1,
    },
    {
      id: ItemId.Bookshelf,
      resourceId: rid('bookshelf'),
      key: 'bookshelf',
      name: 'Bookshelf',
      iconTile: 32,
      stackSize: 64,
      placeBlock: rid('bookshelf'),
    },
    {
      id: ItemId.EnchantingTable,
      resourceId: rid('enchanting_table'),
      key: 'enchanting_table',
      name: 'Enchanting Table',
      iconTile: 33,
      stackSize: 64,
      placeBlock: rid('enchanting_table'),
    },
    {
      id: ItemId.WheatSeeds,
      resourceId: rid('wheat_seeds'),
      key: 'wheat_seeds',
      name: 'Wheat Seeds',
      iconTile: 34,
      stackSize: 64,
      placeBlock: rid('wheat'),
    },
    {
      id: ItemId.Wheat,
      resourceId: rid('wheat'),
      key: 'wheat',
      name: 'Wheat',
      iconTile: 35,
      stackSize: 64,
    },
    {
      id: ItemId.BoneMeal,
      resourceId: rid('bone_meal'),
      key: 'bone_meal',
      name: 'Bone Meal',
      iconTile: 36,
      stackSize: 64,
    },
    {
      id: ItemId.Porkchop,
      resourceId: rid('porkchop'),
      key: 'porkchop',
      name: 'Porkchop',
      iconTile: 37,
      stackSize: 64,
      isFood: true,
      foodHunger: 3,
      foodSaturation: 1.8,
    },
    {
      id: ItemId.RottenFlesh,
      resourceId: rid('rotten_flesh'),
      key: 'rotten_flesh',
      name: 'Rotten Flesh',
      iconTile: 38,
      stackSize: 64,
      isFood: true,
      foodHunger: 4,
      foodSaturation: 0.4,
    },
    {
      id: ItemId.Redstone,
      resourceId: rid('redstone'),
      key: 'redstone',
      name: 'Redstone Dust',
      iconTile: 39,
      stackSize: 64,
      placeBlock: rid('redstone_wire'),
    },
    {
      id: ItemId.Lever,
      resourceId: rid('lever'),
      key: 'lever',
      name: 'Lever',
      iconTile: 40,
      stackSize: 64,
      placeBlock: rid('lever'),
    },
    {
      id: ItemId.StoneButton,
      resourceId: rid('stone_button'),
      key: 'stone_button',
      name: 'Stone Button',
      iconTile: 41,
      stackSize: 64,
      placeBlock: rid('stone_button'),
    },
    {
      id: ItemId.PressurePlate,
      resourceId: rid('pressure_plate'),
      key: 'pressure_plate',
      name: 'Pressure Plate',
      iconTile: 42,
      stackSize: 64,
      placeBlock: rid('pressure_plate'),
    },
    {
      id: ItemId.RedstoneTorch,
      resourceId: rid('redstone_torch'),
      key: 'redstone_torch',
      name: 'Redstone Torch',
      iconTile: 43,
      stackSize: 64,
      placeBlock: rid('redstone_torch'),
    },
    {
      id: ItemId.RedstoneRepeater,
      resourceId: rid('redstone_repeater'),
      key: 'redstone_repeater',
      name: 'Redstone Repeater',
      iconTile: 44,
      stackSize: 64,
      placeBlock: rid('redstone_repeater'),
    },
    {
      id: ItemId.RedstoneComparator,
      resourceId: rid('redstone_comparator'),
      key: 'redstone_comparator',
      name: 'Redstone Comparator',
      iconTile: 45,
      stackSize: 64,
      placeBlock: rid('redstone_comparator'),
    },
    {
      id: ItemId.Observer,
      resourceId: rid('observer'),
      key: 'observer',
      name: 'Observer',
      iconTile: 46,
      stackSize: 64,
      placeBlock: rid('observer'),
    },
    {
      id: ItemId.RedstoneLamp,
      resourceId: rid('redstone_lamp'),
      key: 'redstone_lamp',
      name: 'Redstone Lamp',
      iconTile: 47,
      stackSize: 64,
      placeBlock: rid('redstone_lamp'),
    },
    {
      id: ItemId.Door,
      resourceId: rid('door'),
      key: 'door',
      name: 'Door',
      iconTile: 48,
      stackSize: 64,
      placeBlock: rid('door'),
    },
    {
      id: ItemId.Trapdoor,
      resourceId: rid('trapdoor'),
      key: 'trapdoor',
      name: 'Trapdoor',
      iconTile: 49,
      stackSize: 64,
      placeBlock: rid('trapdoor'),
    },
    {
      id: ItemId.Piston,
      resourceId: rid('piston'),
      key: 'piston',
      name: 'Piston',
      iconTile: 50,
      stackSize: 64,
      placeBlock: rid('piston'),
    },
    {
      id: ItemId.StickyPiston,
      resourceId: rid('sticky_piston'),
      key: 'sticky_piston',
      name: 'Sticky Piston',
      iconTile: 51,
      stackSize: 64,
      placeBlock: rid('sticky_piston'),
    },
    {
      id: ItemId.Hopper,
      resourceId: rid('hopper'),
      key: 'hopper',
      name: 'Hopper',
      iconTile: 52,
      stackSize: 64,
      placeBlock: rid('hopper'),
    },
    {
      id: ItemId.Dropper,
      resourceId: rid('dropper'),
      key: 'dropper',
      name: 'Dropper',
      iconTile: 53,
      stackSize: 64,
      placeBlock: rid('dropper'),
    },
    {
      id: ItemId.Dispenser,
      resourceId: rid('dispenser'),
      key: 'dispenser',
      name: 'Dispenser',
      iconTile: 54,
      stackSize: 64,
      placeBlock: rid('dispenser'),
    },
    {
      id: ItemId.Tnt,
      resourceId: rid('tnt'),
      key: 'tnt',
      name: 'TNT',
      iconTile: 55,
      stackSize: 64,
      placeBlock: rid('tnt'),
    },
    {
      id: ItemId.Rail,
      resourceId: rid('rail'),
      key: 'rail',
      name: 'Rail',
      iconTile: 56,
      stackSize: 64,
      placeBlock: rid('rail'),
    },
    {
      id: ItemId.Netherrack,
      resourceId: rid('netherrack'),
      key: 'netherrack',
      name: 'Netherrack',
      iconTile: 58,
      stackSize: 64,
      placeBlock: rid('netherrack'),
    },
    {
      id: ItemId.Obsidian,
      resourceId: rid('obsidian'),
      key: 'obsidian',
      name: 'Obsidian',
      iconTile: 59,
      stackSize: 64,
      placeBlock: rid('obsidian'),
    },
    {
      id: ItemId.SoulSand,
      resourceId: rid('soul_sand'),
      key: 'soul_sand',
      name: 'Soul Sand',
      iconTile: 60,
      stackSize: 64,
      placeBlock: rid('soul_sand'),
    },
    {
      id: ItemId.NetherWart,
      resourceId: rid('nether_wart'),
      key: 'nether_wart',
      name: 'Nether Wart',
      iconTile: 61,
      stackSize: 64,
      placeBlock: rid('nether_wart'),
    },
    {
      id: ItemId.SoulSoil,
      resourceId: rid('soul_soil'),
      key: 'soul_soil',
      name: 'Soul Soil',
      iconTile: 62,
      stackSize: 64,
      placeBlock: rid('soul_soil'),
    },
    {
      id: ItemId.WitherSkull,
      resourceId: rid('wither_skull'),
      key: 'wither_skull',
      name: 'Wither Skull',
      iconTile: 63,
      stackSize: 64,
      placeBlock: rid('wither_skull'),
    },
    {
      id: ItemId.WitherSkeletonSkull,
      resourceId: rid('wither_skeleton_skull'),
      key: 'wither_skeleton_skull',
      name: 'Wither Skeleton Skull',
      iconTile: 64,
      stackSize: 64,
      placeBlock: rid('wither_skull'),
    },
    {
      id: ItemId.NetherStar,
      resourceId: rid('nether_star'),
      key: 'nether_star',
      name: 'Nether Star',
      iconTile: 65,
      stackSize: 64,
    },
  ];
  assertDurableItemsDoNotStack(defs);
  return new ItemTypeRegistry(defs);
}

/**
 * Authoring invariant (hardening 2026-08-23): an item with durability can never
 * stack. A shared-damage pile would apply wear to one shared component map and
 * zero the whole count on break, destroying every copy in the stack at once.
 * Throws at registry construction so a future durable definition cannot
 * silently reintroduce the defect.
 */
export function assertDurableItemsDoNotStack(defs: readonly ItemTypeDefinition[]): void {
  for (const def of defs) {
    if ((def.maxDurability ?? 0) > 0 && def.stackSize !== 1) {
      throw new Error(
        `ItemRegistry: durable item '${def.key}' must declare stackSize 1 (got ${def.stackSize}); ` +
          'stacking durable items shares one damage component across the pile',
      );
    }
  }
}

/** Item tag backing each tool kind, in the `minecraft:tools/<kind>` form. */
export const TOOLS_TAG_BY_KIND: Readonly<Record<ToolKind, ResourceId>> = {
  [ToolKind.Pickaxe]: createResourceId('minecraft', 'tools/pickaxe'),
  [ToolKind.Axe]: createResourceId('minecraft', 'tools/axe'),
  [ToolKind.Shovel]: createResourceId('minecraft', 'tools/shovel'),
};

/**
 * Build and finalize the item-domain tag registry that declares which tool
 * items belong to each tool kind.
 *
 * Membership is derived directly from each item definition's `toolKind`, so the
 * tags cannot reference an item absent from the registry; finalization validates
 * membership against `itemRegistry.hasByResourceId` and throws on any missing
 * reference. The resulting registry is frozen and O(1) to query.
 */
export function createDefaultItemTags(itemRegistry: ItemTypeRegistry): TagRegistry {
  const membersByKind = new Map<ToolKind, TagMember[]>();
  for (const def of itemRegistry.all()) {
    if (def.toolKind === undefined) continue;
    const list = membersByKind.get(def.toolKind) ?? [];
    list.push({ kind: 'resource', id: def.resourceId });
    membersByKind.set(def.toolKind, list);
  }
  const defs: TagDefinition[] = [];
  for (const kind of [ToolKind.Pickaxe, ToolKind.Axe, ToolKind.Shovel]) {
    defs.push({ id: TOOLS_TAG_BY_KIND[kind], members: membersByKind.get(kind) ?? [] });
  }
  const registry = new TagRegistry('item', defs);
  registry.finalize((rid) => itemRegistry.hasByResourceId(rid));
  return registry;
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
