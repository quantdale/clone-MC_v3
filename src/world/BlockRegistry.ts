/**
 * Centralized block registry.
 *
 * Maps stable numeric block ids to world-block definitions. Inventory/tool item
 * definitions live in a separate registry (see `inventory/ItemRegistry.ts`) as
 * of change 004 — this registry owns only blocks that can exist in the world.
 * Gameplay code must resolve all block properties through this registry; block
 * ids are never hard-coded in gameplay logic.
 */

import { type ResourceId, createResourceId, resourceIdToString } from '../data/ResourceId';
import { RegistryError } from '../data/Registry';
import { TagRegistry, type TagDefinition, type TagMember } from '../data/TagRegistry';
import { BlockPropertySchema, EMPTY_SCHEMA } from './BlockPropertySchema';

/** Block ids are stable numeric identifiers for world blocks only. */
export const enum BlockId {
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
  CoalOre = 14,
  IronOre = 15,
  Cobblestone = 16,
  Bricks = 17,
  Lava = 18,
  Chest = 19,
  Furnace = 20,
  EnchantingTable = 32,
  Bookshelf = 33,
  Wheat = 34,
  Farmland = 35,
  Fire = 36,
  RedstoneWire = 37,
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
}

/**
 * Growth-stage property schema for the wheat crop: a single integer `age` in
 * [0, 7] (0 = freshly planted, 7 = mature). Consumed by the 007 state registry
 * to enumerate exactly 8 wheat states.
 */
export const WHEAT_SCHEMA = new BlockPropertySchema([
  { kind: 'integer', name: 'age', min: 0, max: 7 },
]);

/**
 * Hydration-level property schema for farmland: a single integer `moisture` in
 * [0, 7] (0 = dry, 7 = fully hydrated). Consumed by the 007 state registry to
 * enumerate exactly 8 farmland states.
 */
export const FARMLAND_SCHEMA = new BlockPropertySchema([
  { kind: 'integer', name: 'moisture', min: 0, max: 7 },
]);

/**
 * Burn-stage property schema for fire (128): a single integer `age` in [0, 15]
 * (0 = freshly ignited, 15 = last live stage before extinguishing). Consumed by
 * the 007 state registry to enumerate exactly 16 fire states.
 */
export const FIRE_SCHEMA = new BlockPropertySchema([
  { kind: 'integer', name: 'age', min: 0, max: 15 },
]);

/**
 * Redstone wire property schema (155): the carried signal strength as an integer `power` in
 * [0, 15], plus one named connection property per horizontal side (`none` = unconnected,
 * `side` = connected at this level or descending, `up` = climbing the neighbouring block).
 * Consumed by the 007 state registry to enumerate exactly 16 x 3^4 = 1296 wire states — the first
 * multi-property block in the registry, and ~2% of `MAX_STATES_PER_BLOCK`.
 */
export const REDSTONE_WIRE_SCHEMA = new BlockPropertySchema([
  { kind: 'integer', name: 'power', min: 0, max: 15 },
  { kind: 'named', name: 'north', values: ['none', 'side', 'up'] },
  { kind: 'named', name: 'south', values: ['none', 'side', 'up'] },
  { kind: 'named', name: 'east', values: ['none', 'side', 'up'] },
  { kind: 'named', name: 'west', values: ['none', 'side', 'up'] },
]);

/**
 * Shared on/off property schema for the 157 input components (lever, button, pressure plate): a
 * single boolean `powered`. Each block enumerates exactly 2 states. Facing/attachment state is
 * deliberately omitted — it drives models (059/060), not signal behavior.
 */
export const POWERED_SCHEMA = new BlockPropertySchema([{ kind: 'boolean', name: 'powered' }]);

/**
 * Lit-state property schema for the redstone torch (158): a single boolean `lit`. Kept distinct
 * from `POWERED_SCHEMA` because a torch's state is named for what it *is* (lit), not for what is
 * driving it — a torch is lit precisely when its attachment is *un*powered.
 */
export const LIT_SCHEMA = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);

/**
 * Redstone repeater property schema (159): `facing` (4-way, behavioral — determines input/output
 * vs. lock sides, unlike prior blocks' purely-visual facing), `delay` (1-4 redstone-tick setting),
 * `locked` (frozen by a perpendicular neighbour), and `powered` (current output). Enumerates
 * 4 x 4 x 2 x 2 = 64 states.
 */
export const REPEATER_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['north', 'south', 'east', 'west'] },
  { kind: 'integer', name: 'delay', min: 1, max: 4 },
  { kind: 'boolean', name: 'locked' },
  { kind: 'boolean', name: 'powered' },
]);

/**
 * Redstone comparator property schema (160): `facing` (4-way, behavioral like 159's repeater),
 * `mode` (`compare`/`subtract`, named rather than boolean so it reads naturally in a debug dump
 * and matches vanilla's own data convention), and `powered`. Enumerates 4 x 2 x 2 = 16 states.
 */
export const COMPARATOR_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['north', 'south', 'east', 'west'] },
  { kind: 'named', name: 'mode', values: ['compare', 'subtract'] },
  { kind: 'boolean', name: 'powered' },
]);

/**
 * Observer property schema (161): `facing` is six-way (north/south/east/west/up/down) — the first
 * non-horizontal-only facing in this series, since an observer can watch the block directly above
 * or below it just as validly as one to a side — and `powered`. Enumerates 6 x 2 = 12 states.
 */
export const OBSERVER_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['north', 'south', 'east', 'west', 'up', 'down'] },
  { kind: 'boolean', name: 'powered' },
]);

/**
 * Redstone lamp property schema (162): a single boolean `lit`. The first pure-consumer block in
 * this series — it reads power in and changes its own visible state, with nothing to emit back out.
 */
export const LAMP_SCHEMA = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);

/**
 * Door/trapdoor property schema (162): a single boolean `open`, shared by both blocks — the same
 * one-schema-many-blocks pattern `POWERED_SCHEMA` established for lever/button/plate. `facing` is
 * deliberately omitted (purely visual swing/orientation, 157/158's identical reasoning), as is the
 * real door's two-block hinge/half geometry (placement/rendering scope, not redstone-consumer
 * scope).
 */
export const OPEN_SCHEMA = new BlockPropertySchema([{ kind: 'boolean', name: 'open' }]);

/**
 * Piston property schema (164): `facing` is six-way (north/south/east/west/up/down) — behavioral,
 * since it determines the push direction, the same reasoning 161's observer applied — and
 * `extended`. Enumerates 6 x 2 = 12 states. Non-sticky only; `sticky_piston` is 165's scope.
 */
export const PISTON_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['north', 'south', 'east', 'west', 'up', 'down'] },
  { kind: 'boolean', name: 'extended' },
]);

/** Tool families used for preferred-tool mining bonuses. */
export const enum ToolKind {
  Pickaxe = 1,
  Axe = 2,
  Shovel = 3,
}

/** Render category — determines which material / geometry a block belongs to. */
export const enum RenderCategory {
  Opaque = 0,
  Transparent = 1,
}

/** A world-block definition. */
export interface BlockTypeDefinition {
  /** Stable numeric legacy id. This value is the current save identity. */
  id: number;
  /** Stable resource id backing the legacy numeric id. */
  resourceId: ResourceId;
  /** Stable string key. */
  key: string;
  /** Human-readable display name. */
  name: string;
  /** Whether the block is solid (collidable + occludes faces). */
  solid: boolean;
  /** Whether the block is opaque (hides faces behind it). */
  opaque: boolean;
  /** Whether the player can destroy it. */
  breakable: boolean;
  /** Render category (opaque vs transparent). */
  renderCategory: RenderCategory;
  /** Texture tile index for the top face. */
  topTile: number;
  /** Texture tile index for the bottom face. */
  bottomTile: number;
  /** Texture tile index for the side face. */
  sideTile: number;
  /** Relative break time in seconds; Infinity means unbreakable. */
  hardness: number;
  /** Preferred tool family for efficient mining, when applicable. */
  preferredTool?: ToolKind;
  /**
   * Minimum tool tier required to harvest (drop) this block. `0` (the default
   * when omitted) means the block drops even when broken by hand; a higher value
   * requires a tool of the matching kind whose `toolTier` meets or exceeds this
   * level, otherwise breaking removes the block without a drop.
   */
  miningLevel?: number;
  /**
   * Inventory item dropped when this block is broken, as a resource id. The
   * referenced item MUST exist in the item registry (validated at init). Omitted
   * for unbreakable blocks.
   */
  dropItem?: ResourceId;
  /**
   * Loot table governing this block's drops, as a resource id. Set for every
   * breakable block (011) and resolved by the interaction system to produce drops.
   * Kept separate from `dropItem`, which remains the validated cross-reference
   * used by item/block bootstrap validation.
   */
  lootTable?: ResourceId;
  /**
   * Ordered immutable property schema for this block type. Omitted for current
   * blocks that declare no state properties; resolved as EMPTY_SCHEMA.
   */
  propertySchema?: BlockPropertySchema;
  /**
   * Default property value assignment for this block type, keyed by property
   * name. Required when the block declares a non-empty property schema; the
   * 007 state registry fails construction when absent or invalid.
   */
  defaultState?: Record<string, boolean | number | string>;
}

/**
 * Typed registry of world-block definitions keyed by stable numeric id.
 *
 * Lookups are constant-time via a dense lookup array; resource-id and key maps
 * support compatibility/validation lookups. The numeric `id` is the persistent
 * save identity — generic runtime registry ids are intentionally absent.
 */
export class BlockTypeRegistry {
  private readonly byId = new Map<number, BlockTypeDefinition>();
  private readonly byKey = new Map<string, BlockTypeDefinition>();
  private readonly byResourceId = new Map<string, BlockTypeDefinition>();
  /** Mirrors Map entries for O(1) indexed access in the hot path. */
  private readonly fastLookup: (BlockTypeDefinition | undefined)[] = [];

  constructor(definitions: BlockTypeDefinition[]) {
    for (const def of definitions) {
      if (this.byId.has(def.id)) {
        throw new RegistryError(
          'DUPLICATE_ID',
          String(def.id),
          `duplicate legacy block id: ${def.id}`,
        );
      }
      this.byId.set(def.id, def);
      this.byKey.set(def.key, def);
      this.byResourceId.set(resourceIdToString(def.resourceId), def);
      this.fastLookup[def.id] = def;
    }
  }

  /** Look up a block by numeric id. Throws for unknown ids to catch bugs. */
  get(id: number): BlockTypeDefinition {
    const def = this.getById(id);
    if (!def) {
      throw new RegistryError('MISSING_ID', String(id), `unknown block id: ${id}`);
    }
    return def;
  }

  /** Look up a block by numeric id, returning undefined when absent. */
  getByLegacyId(id: number): BlockTypeDefinition | undefined {
    return this.getById(id);
  }

  /** Look up a block by resource id. Throws for unknown ids. */
  getByResourceId(rid: ResourceId): BlockTypeDefinition {
    const def = this.byResourceId.get(resourceIdToString(rid));
    if (!def) {
      throw new RegistryError('MISSING_ID', resourceIdToString(rid), 'unknown block resource id');
    }
    return def;
  }

  /** Look up a block by key. Returns undefined for unknown keys. */
  getByKey(key: string): BlockTypeDefinition | undefined {
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

  /** Convenience: is the block solid? */
  isSolid(id: number): boolean {
    return this.get(id).solid;
  }

  /** Convenience: is the block opaque? */
  isOpaque(id: number): boolean {
    return this.get(id).opaque;
  }

  /** Convenience: whether a face against this block should be culled. */
  occludesFace(id: number): boolean {
    return this.get(id).opaque;
  }

  /**
   * Property schema for a block type. Blocks that declare no state properties
   * resolve to EMPTY_SCHEMA so current gameplay/save behavior is unchanged.
   */
  getPropertySchema(id: number): BlockPropertySchema {
    return this.get(id).propertySchema ?? EMPTY_SCHEMA;
  }

  /** All registered definitions. */
  all(): BlockTypeDefinition[] {
    return [...this.byId.values()];
  }

  private getById(id: number): BlockTypeDefinition | undefined {
    if (Number.isInteger(id) && id >= 0 && id < this.fastLookup.length) {
      return this.fastLookup[id];
    }
    return this.byId.get(id);
  }
}

/** Backwards-compatible alias kept for world/consumer imports. */
export type BlockRegistry = BlockTypeRegistry;

const rid = (path: string): ResourceId => createResourceId('minecraft', path);

/** Build the default block registry with the core and expanded block types. */
export function createDefaultBlockRegistry(): BlockTypeRegistry {
  const defs: BlockTypeDefinition[] = [
    {
      id: BlockId.Air,
      resourceId: rid('air'),
      key: 'air',
      name: 'Air',
      solid: false,
      opaque: false,
      breakable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: Infinity,
    },
    {
      id: BlockId.Grass,
      resourceId: rid('grass'),
      key: 'grass',
      name: 'Grass Block',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 1,
      bottomTile: 2,
      sideTile: 3,
      hardness: 0.45,
      preferredTool: ToolKind.Shovel,
      dropItem: rid('grass'),
      lootTable: rid('loot/grass'),
    },
    {
      id: BlockId.Dirt,
      resourceId: rid('dirt'),
      key: 'dirt',
      name: 'Dirt',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 2,
      bottomTile: 2,
      sideTile: 2,
      hardness: 0.45,
      preferredTool: ToolKind.Shovel,
      dropItem: rid('dirt'),
      lootTable: rid('loot/dirt'),
    },
    {
      id: BlockId.Stone,
      resourceId: rid('stone'),
      key: 'stone',
      name: 'Stone',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 4,
      bottomTile: 4,
      sideTile: 4,
      hardness: 1.5,
      preferredTool: ToolKind.Pickaxe,
      miningLevel: 1,
      dropItem: rid('stone'),
      lootTable: rid('loot/stone'),
    },
    {
      id: BlockId.Sand,
      resourceId: rid('sand'),
      key: 'sand',
      name: 'Sand',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 5,
      bottomTile: 5,
      sideTile: 5,
      hardness: 0.5,
      preferredTool: ToolKind.Shovel,
      dropItem: rid('sand'),
      lootTable: rid('loot/sand'),
    },
    {
      id: BlockId.Water,
      resourceId: rid('water'),
      key: 'water',
      name: 'Water',
      solid: false,
      opaque: false,
      breakable: false,
      renderCategory: RenderCategory.Transparent,
      topTile: 6,
      bottomTile: 6,
      sideTile: 6,
      hardness: Infinity,
      dropItem: rid('water'),
    },
    {
      id: BlockId.Bedrock,
      resourceId: rid('bedrock'),
      key: 'bedrock',
      name: 'Bedrock',
      solid: true,
      opaque: true,
      breakable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 7,
      bottomTile: 7,
      sideTile: 7,
      hardness: Infinity,
    },
    {
      id: BlockId.Wood,
      resourceId: rid('wood'),
      key: 'wood',
      name: 'Wood Log',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 8,
      bottomTile: 8,
      sideTile: 9,
      hardness: 1.0,
      preferredTool: ToolKind.Axe,
      dropItem: rid('wood'),
      lootTable: rid('loot/wood'),
    },
    {
      id: BlockId.Leaves,
      resourceId: rid('leaves'),
      key: 'leaves',
      name: 'Leaves',
      solid: true,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 10,
      bottomTile: 10,
      sideTile: 10,
      hardness: 0.2,
      preferredTool: ToolKind.Axe,
      dropItem: rid('leaves'),
      lootTable: rid('loot/leaves'),
    },
    {
      id: BlockId.Glass,
      resourceId: rid('glass'),
      key: 'glass',
      name: 'Glass',
      solid: true,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 11,
      bottomTile: 11,
      sideTile: 11,
      hardness: 0.3,
      dropItem: rid('glass'),
      lootTable: rid('loot/glass'),
    },
    {
      id: BlockId.Snow,
      resourceId: rid('snow'),
      key: 'snow',
      name: 'Snow Block',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 12,
      bottomTile: 12,
      sideTile: 12,
      hardness: 0.3,
      preferredTool: ToolKind.Shovel,
      dropItem: rid('snow'),
      lootTable: rid('loot/snow'),
    },
    {
      id: BlockId.Gravel,
      resourceId: rid('gravel'),
      key: 'gravel',
      name: 'Gravel',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 13,
      bottomTile: 13,
      sideTile: 13,
      hardness: 0.6,
      preferredTool: ToolKind.Shovel,
      dropItem: rid('gravel'),
      lootTable: rid('loot/gravel'),
    },
    {
      id: BlockId.Planks,
      resourceId: rid('planks'),
      key: 'planks',
      name: 'Oak Planks',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 14,
      bottomTile: 14,
      sideTile: 14,
      hardness: 1.0,
      preferredTool: ToolKind.Axe,
      dropItem: rid('planks'),
      lootTable: rid('loot/planks'),
    },
    {
      id: BlockId.CoalOre,
      resourceId: rid('coal_ore'),
      key: 'coal_ore',
      name: 'Coal Ore',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 16,
      bottomTile: 16,
      sideTile: 16,
      hardness: 2.4,
      preferredTool: ToolKind.Pickaxe,
      miningLevel: 1,
      dropItem: rid('coal'),
      lootTable: rid('loot/coal_ore'),
    },
    {
      id: BlockId.IronOre,
      resourceId: rid('iron_ore'),
      key: 'iron_ore',
      name: 'Iron Ore',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 17,
      bottomTile: 17,
      sideTile: 17,
      hardness: 3.0,
      preferredTool: ToolKind.Pickaxe,
      miningLevel: 1,
      dropItem: rid('raw_iron'),
      lootTable: rid('loot/iron_ore'),
    },
    {
      id: BlockId.Cobblestone,
      resourceId: rid('cobblestone'),
      key: 'cobblestone',
      name: 'Cobblestone',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 18,
      bottomTile: 18,
      sideTile: 18,
      hardness: 2.0,
      preferredTool: ToolKind.Pickaxe,
      miningLevel: 1,
      dropItem: rid('cobblestone'),
      lootTable: rid('loot/cobblestone'),
    },
    {
      id: BlockId.Bricks,
      resourceId: rid('bricks'),
      key: 'bricks',
      name: 'Bricks',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 19,
      bottomTile: 19,
      sideTile: 19,
      hardness: 2.0,
      preferredTool: ToolKind.Pickaxe,
      miningLevel: 1,
      dropItem: rid('bricks'),
      lootTable: rid('loot/bricks'),
    },
    {
      id: BlockId.Lava,
      resourceId: rid('lava'),
      key: 'lava',
      name: 'Lava',
      solid: false,
      opaque: false,
      breakable: false,
      renderCategory: RenderCategory.Transparent,
      topTile: 20,
      bottomTile: 20,
      sideTile: 20,
      hardness: Infinity,
      dropItem: rid('lava'),
    },
    {
      id: BlockId.Chest,
      resourceId: rid('chest'),
      key: 'chest',
      name: 'Chest',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 27,
      bottomTile: 27,
      sideTile: 27,
      hardness: 2.5,
      preferredTool: ToolKind.Axe,
      dropItem: rid('chest'),
      lootTable: rid('loot/chest'),
    },
    {
      id: BlockId.Furnace,
      resourceId: rid('furnace'),
      key: 'furnace',
      name: 'Furnace',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 28,
      bottomTile: 28,
      sideTile: 28,
      hardness: 3.5,
      preferredTool: ToolKind.Pickaxe,
      miningLevel: 1,
      dropItem: rid('furnace'),
      lootTable: rid('loot/furnace'),
    },
    {
      id: BlockId.EnchantingTable,
      resourceId: rid('enchanting_table'),
      key: 'enchanting_table',
      name: 'Enchanting Table',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 33,
      bottomTile: 33,
      sideTile: 33,
      hardness: 5.0,
      preferredTool: ToolKind.Pickaxe,
      miningLevel: 1,
      dropItem: rid('enchanting_table'),
    },
    {
      id: BlockId.Bookshelf,
      resourceId: rid('bookshelf'),
      key: 'bookshelf',
      name: 'Bookshelf',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 32,
      bottomTile: 32,
      sideTile: 32,
      hardness: 0.8,
      preferredTool: ToolKind.Axe,
      dropItem: rid('bookshelf'),
    },
    {
      id: BlockId.Wheat,
      resourceId: rid('wheat'),
      key: 'wheat',
      name: 'Wheat',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 0.0,
      dropItem: rid('wheat_seeds'),
      lootTable: rid('loot/wheat'),
      propertySchema: WHEAT_SCHEMA,
      defaultState: { age: 0 },
    },
    {
      id: BlockId.Farmland,
      resourceId: rid('farmland'),
      key: 'farmland',
      name: 'Farmland',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 2,
      bottomTile: 2,
      sideTile: 2,
      hardness: 0.6,
      preferredTool: ToolKind.Shovel,
      dropItem: rid('dirt'),
      lootTable: rid('loot/dirt'),
      propertySchema: FARMLAND_SCHEMA,
      defaultState: { moisture: 0 },
    },
    {
      id: BlockId.Fire,
      resourceId: rid('fire'),
      key: 'fire',
      name: 'Fire',
      solid: false,
      opaque: false,
      breakable: false,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: Infinity,
      propertySchema: FIRE_SCHEMA,
      defaultState: { age: 0 },
    },
    {
      id: BlockId.RedstoneWire,
      resourceId: rid('redstone_wire'),
      key: 'redstone_wire',
      name: 'Redstone Wire',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 0,
      dropItem: createResourceId('minecraft', 'redstone'),
      propertySchema: REDSTONE_WIRE_SCHEMA,
      defaultState: { power: 0, north: 'none', south: 'none', east: 'none', west: 'none' },
    },
    {
      id: BlockId.Lever,
      resourceId: rid('lever'),
      key: 'lever',
      name: 'Lever',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 0.5,
      dropItem: rid('lever'),
      propertySchema: POWERED_SCHEMA,
      defaultState: { powered: false },
    },
    {
      id: BlockId.StoneButton,
      resourceId: rid('stone_button'),
      key: 'stone_button',
      name: 'Stone Button',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 0.5,
      dropItem: rid('stone_button'),
      propertySchema: POWERED_SCHEMA,
      defaultState: { powered: false },
    },
    {
      id: BlockId.PressurePlate,
      resourceId: rid('pressure_plate'),
      key: 'pressure_plate',
      name: 'Pressure Plate',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 0.5,
      dropItem: rid('pressure_plate'),
      propertySchema: POWERED_SCHEMA,
      defaultState: { powered: false },
    },
    {
      id: BlockId.RedstoneTorch,
      resourceId: rid('redstone_torch'),
      key: 'redstone_torch',
      name: 'Redstone Torch',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 0,
      dropItem: rid('redstone_torch'),
      propertySchema: LIT_SCHEMA,
      defaultState: { lit: false },
    },
    {
      id: BlockId.RedstoneRepeater,
      resourceId: rid('redstone_repeater'),
      key: 'redstone_repeater',
      name: 'Redstone Repeater',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 0,
      dropItem: rid('redstone_repeater'),
      propertySchema: REPEATER_SCHEMA,
      defaultState: { facing: 'north', delay: 1, locked: false, powered: false },
    },
    {
      id: BlockId.RedstoneComparator,
      resourceId: rid('redstone_comparator'),
      key: 'redstone_comparator',
      name: 'Redstone Comparator',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 0,
      dropItem: rid('redstone_comparator'),
      propertySchema: COMPARATOR_SCHEMA,
      defaultState: { facing: 'north', mode: 'compare', powered: false },
    },
    {
      id: BlockId.Observer,
      resourceId: rid('observer'),
      key: 'observer',
      name: 'Observer',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 34,
      bottomTile: 34,
      sideTile: 34,
      hardness: 3.5,
      preferredTool: ToolKind.Pickaxe,
      miningLevel: 1,
      dropItem: rid('observer'),
      propertySchema: OBSERVER_SCHEMA,
      defaultState: { facing: 'north', powered: false },
    },
    {
      id: BlockId.RedstoneLamp,
      resourceId: rid('redstone_lamp'),
      key: 'redstone_lamp',
      name: 'Redstone Lamp',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 35,
      bottomTile: 35,
      sideTile: 35,
      hardness: 0.3,
      dropItem: rid('redstone_lamp'),
      propertySchema: LAMP_SCHEMA,
      defaultState: { lit: false },
    },
    {
      id: BlockId.Door,
      resourceId: rid('door'),
      key: 'door',
      name: 'Door',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 3,
      dropItem: rid('door'),
      propertySchema: OPEN_SCHEMA,
      defaultState: { open: false },
    },
    {
      id: BlockId.Trapdoor,
      resourceId: rid('trapdoor'),
      key: 'trapdoor',
      name: 'Trapdoor',
      solid: false,
      opaque: false,
      breakable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: 3,
      dropItem: rid('trapdoor'),
      propertySchema: OPEN_SCHEMA,
      defaultState: { open: false },
    },
    {
      id: BlockId.Piston,
      resourceId: rid('piston'),
      key: 'piston',
      name: 'Piston',
      solid: true,
      opaque: true,
      breakable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 36,
      bottomTile: 36,
      sideTile: 36,
      hardness: 1.5,
      dropItem: rid('piston'),
      propertySchema: PISTON_SCHEMA,
      defaultState: { facing: 'north', extended: false },
    },
  ];
  return new BlockTypeRegistry(defs);
}

/** Block tag backing each tool kind, in the `minecraft:mineable/<kind>` form. */
export const MINABLE_TAG_BY_KIND: Readonly<Record<ToolKind, ResourceId>> = {
  [ToolKind.Pickaxe]: createResourceId('minecraft', 'mineable/pickaxe'),
  [ToolKind.Axe]: createResourceId('minecraft', 'mineable/axe'),
  [ToolKind.Shovel]: createResourceId('minecraft', 'mineable/shovel'),
};

/**
 * Build and finalize the block-domain tag registry that declares which blocks
 * are mineable by each tool kind.
 *
 * Membership is derived directly from each block definition's `preferredTool`,
 * so the tags cannot reference a block absent from the registry; finalization
 * validates membership against `blockRegistry.hasByResourceId` and throws on
 * any missing reference. The resulting registry is frozen and O(1) to query.
 */
export function createDefaultBlockTags(blockRegistry: BlockTypeRegistry): TagRegistry {
  const membersByKind = new Map<ToolKind, TagMember[]>();
  for (const def of blockRegistry.all()) {
    if (def.preferredTool === undefined) continue;
    const list = membersByKind.get(def.preferredTool) ?? [];
    list.push({ kind: 'resource', id: def.resourceId });
    membersByKind.set(def.preferredTool, list);
  }
  const defs: TagDefinition[] = [];
  for (const kind of [ToolKind.Pickaxe, ToolKind.Axe, ToolKind.Shovel]) {
    defs.push({ id: MINABLE_TAG_BY_KIND[kind], members: membersByKind.get(kind) ?? [] });
  }
  const registry = new TagRegistry('block', defs);
  registry.finalize((rid) => blockRegistry.hasByResourceId(rid));
  return registry;
}
