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
}

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
   * Inventory item dropped when this block is broken, as a resource id. The
   * referenced item MUST exist in the item registry (validated at init). Omitted
   * for unbreakable blocks.
   */
  dropItem?: ResourceId;
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
      dropItem: rid('stone'),
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
      dropItem: rid('coal'),
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
      dropItem: rid('raw_iron'),
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
      dropItem: rid('cobblestone'),
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
      dropItem: rid('bricks'),
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
  ];
  return new BlockTypeRegistry(defs);
}
