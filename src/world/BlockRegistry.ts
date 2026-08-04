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
  /** Whether the block collides with the player (same as solid for now). */
  collision: boolean;
  /** Render category (opaque vs transparent). */
  renderCategory: RenderCategory;
  /** Texture tile index for the top face. */
  topTile: number;
  /** Texture tile index for the bottom face. */
  bottomTile: number;
  /** Texture tile index for the side face. */
  sideTile: number;
}

export class BlockRegistry {
  private readonly byId = new Map<number, BlockDefinition>();
  private readonly byKey = new Map<string, BlockDefinition>();

  constructor(definitions: BlockDefinition[]) {
    for (const def of definitions) {
      this.byId.set(def.id, def);
      this.byKey.set(def.key, def);
    }
  }

  /** Look up a block by numeric id. Throws for unknown ids to catch bugs. */
  get(id: number): BlockDefinition {
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
}

/** Build the default block registry with the nine required block types. */
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
      collision: false,
      renderCategory: RenderCategory.Opaque,
      topTile: 0,
      bottomTile: 0,
      sideTile: 0,
    },
    {
      id: BlockId.Grass,
      key: 'grass',
      name: 'Grass Block',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      collision: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 1,
      bottomTile: 2,
      sideTile: 3,
    },
    {
      id: BlockId.Dirt,
      key: 'dirt',
      name: 'Dirt',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      collision: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 2,
      bottomTile: 2,
      sideTile: 2,
    },
    {
      id: BlockId.Stone,
      key: 'stone',
      name: 'Stone',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      collision: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 4,
      bottomTile: 4,
      sideTile: 4,
    },
    {
      id: BlockId.Sand,
      key: 'sand',
      name: 'Sand',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      collision: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 5,
      bottomTile: 5,
      sideTile: 5,
    },
    {
      id: BlockId.Water,
      key: 'water',
      name: 'Water',
      solid: false,
      opaque: false,
      breakable: false,
      placeable: true,
      collision: false,
      renderCategory: RenderCategory.Transparent,
      topTile: 6,
      bottomTile: 6,
      sideTile: 6,
    },
    {
      id: BlockId.Bedrock,
      key: 'bedrock',
      name: 'Bedrock',
      solid: true,
      opaque: true,
      breakable: false,
      placeable: false,
      collision: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 7,
      bottomTile: 7,
      sideTile: 7,
    },
    {
      id: BlockId.Wood,
      key: 'wood',
      name: 'Wood Log',
      solid: true,
      opaque: true,
      breakable: true,
      placeable: true,
      collision: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 8,
      bottomTile: 8,
      sideTile: 9,
    },
    {
      id: BlockId.Leaves,
      key: 'leaves',
      name: 'Leaves',
      solid: true,
      opaque: false,
      breakable: true,
      placeable: true,
      collision: true,
      renderCategory: RenderCategory.Opaque,
      topTile: 10,
      bottomTile: 10,
      sideTile: 10,
    },
  ];
  return new BlockRegistry(defs);
}