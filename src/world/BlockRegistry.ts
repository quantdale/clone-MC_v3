/**
 * Centralized block registry.
 *
 * Maps stable numeric block ids to definitions. Gameplay code must resolve all
 * block properties through this registry — block ids are never hard-coded in
 * gameplay logic.
 */

/** Block ids are stable numeric identifiers. */
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

export interface FaceUV {
  /** Atlas tile index for a face. */
  tile: number;
}

export interface BlockDefinition {
  /** Stable numeric id. */
  id: number;
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
  /** Whether the player can place it. */
  placeable: boolean;
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
  /** Tool family for a non-placeable item. */
  toolKind?: ToolKind;
  /** Mining speed multiplier supplied by a tool. */
  toolPower?: number;
  /** Maximum durability for a non-placeable tool item. */
  maxDurability?: number;
  /** Inventory item emitted when this block is broken, when different from id. */
  dropId?: BlockId;
}

export class BlockRegistry {
  private readonly byId = new Map<number, BlockDefinition>();
  private readonly byKey = new Map<string, BlockDefinition>();
  /** Mirrors Map entries for O(1) indexed access in the hot path. */
  private readonly fastLookup: (BlockDefinition | undefined)[] = [];

  constructor(definitions: BlockDefinition[]) {
    for (const def of definitions) {
      this.byId.set(def.id, def);
      this.byKey.set(def.key, def);
      this.fastLookup[def.id] = def;
    }
  }

  /** Look up a block by numeric id. Throws for unknown ids to catch bugs. */
  get(id: number): BlockDefinition {
    if (id >= 0 && id < this.fastLookup.length) {
      const def = this.fastLookup[id];
      if (def) {
        return def;
      }
    }
    const def = this.byId.get(id);
    if (!def) {
      throw new Error(`Unknown block id: ${id}`);
    }
    return def;
  }

  /** Look up a block by key. Returns undefined for unknown keys. */
  getByKey(key: string): BlockDefinition | undefined {
    return this.byKey.get(key);
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
  all(): BlockDefinition[] {
    return [...this.byId.values()];
  }

  private getById(id: number): BlockDefinition | undefined {
    if (Number.isInteger(id) && id >= 0 && id < this.fastLookup.length) {
      const fast = this.fastLookup[id];
      if (fast) {
        return fast;
      }
    }
    return this.byId.get(id);
  }
}

/** Build the default block registry with the core and expanded block types. */
export function createDefaultRegistry(): BlockRegistry {
  const defs: BlockDefinition[] = [
    {
      id: BlockId.Air,
      key: 'air',
      name: 'Air',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
      hardness: Infinity,
    },
    {
      id: BlockId.Grass,
      key: 'grass',
      name: 'Grass Block',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 1,
      bottomTile: 2,
      sideTile: 3,
      hardness: 0.45,
      preferredTool: ToolKind.Shovel,
    },
    {
      id: BlockId.Dirt,
      key: 'dirt',
      name: 'Dirt',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 2,
      bottomTile: 2,
      sideTile: 2,
      hardness: 0.45,
      preferredTool: ToolKind.Shovel,
    },
    {
      id: BlockId.Stone,
      key: 'stone',
      name: 'Stone',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 4,
      bottomTile: 4,
      sideTile: 4,
      hardness: 1.5,
      preferredTool: ToolKind.Pickaxe,
    },
    {
      id: BlockId.Sand,
      key: 'sand',
      name: 'Sand',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 5,
      bottomTile: 5,
      sideTile: 5,
      hardness: 0.5,
      preferredTool: ToolKind.Shovel,
    },
    {
      id: BlockId.Water,
      key: 'water',
      name: 'Water',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 6,
      bottomTile: 6,
      sideTile: 6,
      hardness: Infinity,
    },
    {
      id: BlockId.Bedrock,
      key: 'bedrock',
      name: 'Bedrock',
      solid: true,
      opaque: true,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 7,
      bottomTile: 7,
      sideTile: 7,
      hardness: Infinity,
    },
    {
      id: BlockId.Wood,
      key: 'wood',
      name: 'Wood Log',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 8,
      bottomTile: 8,
      sideTile: 9,
      hardness: 1.0,
      preferredTool: ToolKind.Axe,
    },
    {
      id: BlockId.Leaves,
      key: 'leaves',
      name: 'Leaves',
      solid: true,
      opaque: false,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 10,
      bottomTile: 10,
      sideTile: 10,
      hardness: 0.2,
      preferredTool: ToolKind.Axe,
    },
    {
      id: BlockId.Glass,
      key: 'glass',
      name: 'Glass',
      solid: true,
      opaque: false,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 11,
      bottomTile: 11,
      sideTile: 11,
      hardness: 0.3,
    },
    {
      id: BlockId.Snow,
      key: 'snow',
      name: 'Snow Block',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 12,
      bottomTile: 12,
      sideTile: 12,
      hardness: 0.3,
      preferredTool: ToolKind.Shovel,
    },
    {
      id: BlockId.Gravel,
      key: 'gravel',
      name: 'Gravel',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 13,
      bottomTile: 13,
      sideTile: 13,
      hardness: 0.6,
      preferredTool: ToolKind.Shovel,
    },
    {
      id: BlockId.Planks,
      key: 'planks',
      name: 'Oak Planks',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 14,
      bottomTile: 14,
      sideTile: 14,
      hardness: 1.0,
      preferredTool: ToolKind.Axe,
    },
    {
      id: BlockId.Apple,
      key: 'apple',
      name: 'Apple',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 15,
      bottomTile: 15,
      sideTile: 15,
      hardness: Infinity,
    },
    {
      id: BlockId.CoalOre,
      key: 'coal_ore',
      name: 'Coal Ore',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 16,
      bottomTile: 16,
      sideTile: 16,
      hardness: 2.4,
      preferredTool: ToolKind.Pickaxe,
      dropId: BlockId.Coal,
    },
    {
      id: BlockId.IronOre,
      key: 'iron_ore',
      name: 'Iron Ore',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 17,
      bottomTile: 17,
      sideTile: 17,
      hardness: 3.0,
      preferredTool: ToolKind.Pickaxe,
      dropId: BlockId.RawIron,
    },
    {
      id: BlockId.Cobblestone,
      key: 'cobblestone',
      name: 'Cobblestone',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 18,
      bottomTile: 18,
      sideTile: 18,
      hardness: 2.0,
      preferredTool: ToolKind.Pickaxe,
    },
    {
      id: BlockId.Bricks,
      key: 'bricks',
      name: 'Bricks',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 19,
      bottomTile: 19,
      sideTile: 19,
      hardness: 2.0,
      preferredTool: ToolKind.Pickaxe,
    },
    {
      id: BlockId.Lava,
      key: 'lava',
      name: 'Lava',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: true,
      renderCategory: RenderCategory.Transparent,
      topTile: 20,
      bottomTile: 20,
      sideTile: 20,
      hardness: Infinity,
    },
    {
      id: BlockId.Stick,
      key: 'stick',
      name: 'Stick',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 21,
      bottomTile: 21,
      sideTile: 21,
      hardness: Infinity,
    },
    {
      id: BlockId.WoodenPickaxe,
      key: 'wooden_pickaxe',
      name: 'Wooden Pickaxe',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 22,
      bottomTile: 22,
      sideTile: 22,
      hardness: Infinity,
      toolKind: ToolKind.Pickaxe,
      toolPower: 2.2,
      maxDurability: 59,
    },
    {
      id: BlockId.StonePickaxe,
      key: 'stone_pickaxe',
      name: 'Stone Pickaxe',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 23,
      bottomTile: 23,
      sideTile: 23,
      hardness: Infinity,
      toolKind: ToolKind.Pickaxe,
      toolPower: 4,
      maxDurability: 131,
    },
    {
      id: BlockId.WoodenAxe,
      key: 'wooden_axe',
      name: 'Wooden Axe',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 24,
      bottomTile: 24,
      sideTile: 24,
      hardness: Infinity,
      toolKind: ToolKind.Axe,
      toolPower: 2.4,
      maxDurability: 59,
    },
    {
      id: BlockId.Coal,
      key: 'coal',
      name: 'Coal',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 25,
      bottomTile: 25,
      sideTile: 25,
      hardness: Infinity,
    },
    {
      id: BlockId.RawIron,
      key: 'raw_iron',
      name: 'Raw Iron',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 26,
      bottomTile: 26,
      sideTile: 26,
      hardness: Infinity,
    },
  ];
  return new BlockRegistry(defs);
}
