/**
 * Overworld density terrain (088). `generateTerrainColumn` produces a deterministic 16×16×height
 * column of modern-height terrain (-64..320) from a density function over 087 noise: solid stone
 * where density > 0, water filling air below `seaLevel`, bedrock at `minY`, air elsewhere. Output
 * is sparse (only non-air cells), indexed `x + 16·(y - minY) + 16·height·z`. `TerrainColumn`
 * exposes block lookups and surface heights. Deterministic per (seed, columnX, columnZ).
 */
import { fbm3D, ValueNoise3D } from './DensityNoise';

/** Terrain volume configuration. */
export interface OverworldTerrainConfig {
  worldSeed: number;
  /** Lowest world Y (inclusive). */
  minY: number;
  /** Highest world Y + 1 (exclusive). */
  maxY: number;
  /** Water fills air below this Y. */
  seaLevel: number;
}

/** Block ids the generator writes. */
export interface TerrainBlockIds {
  stone: number;
  water: number;
  bedrock: number;
}

export const DEFAULT_TERRAIN_BLOCK_IDS: TerrainBlockIds = { stone: 1, water: 8, bedrock: 7 };

/** Default modern-height overworld volume (-64..320, sea level 63). */
export const DEFAULT_OVERWORLD_TERRAIN_CONFIG: Omit<OverworldTerrainConfig, 'worldSeed'> = {
  minY: -64,
  maxY: 320,
  seaLevel: 63,
};

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function resolveConfig(seed: number, partial?: Partial<OverworldTerrainConfig>): OverworldTerrainConfig {
  const config: OverworldTerrainConfig = {
    worldSeed: seed,
    minY: partial?.minY ?? DEFAULT_OVERWORLD_TERRAIN_CONFIG.minY,
    maxY: partial?.maxY ?? DEFAULT_OVERWORLD_TERRAIN_CONFIG.maxY,
    seaLevel: partial?.seaLevel ?? DEFAULT_OVERWORLD_TERRAIN_CONFIG.seaLevel,
  };
  if (
    !isInteger(config.minY) ||
    !isInteger(config.maxY) ||
    !isInteger(config.seaLevel) ||
    config.minY >= config.maxY ||
    config.seaLevel <= config.minY ||
    config.seaLevel >= config.maxY
  ) {
    throw new Error(
      `OverworldTerrain: invalid config (minY ${config.minY}, maxY ${config.maxY}, seaLevel ${config.seaLevel})`,
    );
  }
  return config;
}

function resolveIds(partial?: Partial<TerrainBlockIds>): TerrainBlockIds {
  const ids: TerrainBlockIds = {
    stone: partial?.stone ?? DEFAULT_TERRAIN_BLOCK_IDS.stone,
    water: partial?.water ?? DEFAULT_TERRAIN_BLOCK_IDS.water,
    bedrock: partial?.bedrock ?? DEFAULT_TERRAIN_BLOCK_IDS.bedrock,
  };
  for (const [name, value] of Object.entries(ids)) {
    if (!isInteger(value) || value < 0) {
      throw new Error(`OverworldTerrain: ${name} id must be a non-negative integer, got ${value}`);
    }
  }
  return ids;
}

/** One generated 16×16×height terrain column (sparse). */
export class TerrainColumn {
  private readonly cells = new Map<number, number>();
  readonly columnX: number;
  readonly columnZ: number;
  readonly minY: number;
  readonly maxY: number;

  constructor(columnX: number, columnZ: number, minY: number, maxY: number) {
    this.columnX = columnX;
    this.columnZ = columnZ;
    this.minY = minY;
    this.maxY = maxY;
  }

  private index(localX: number, localY: number, localZ: number): number {
    const height = this.maxY - this.minY;
    return localX + 16 * (localY - this.minY) + 16 * height * localZ;
  }

  /** The block id at local coordinates, or null for air. */
  getBlock(localX: number, localY: number, localZ: number): number | null {
    if (localY < this.minY || localY >= this.maxY) return null;
    return this.cells.get(this.index(localX, localY, localZ)) ?? null;
  }

  /** Number of non-air cells. */
  get blockCount(): number {
    return this.cells.size;
  }

  /** The highest solid local y in the footprint column, or `minY - 1` when empty. */
  surfaceHeightAt(localX: number, localZ: number): number {
    for (let localY = this.maxY - 1; localY >= this.minY; localY--) {
      if (this.getBlock(localX, localY, localZ) !== null) return localY;
    }
    return this.minY - 1;
  }

  /** Internal: store a classified cell. */
  setCell(localX: number, localY: number, localZ: number, blockId: number): void {
    this.cells.set(this.index(localX, localY, localZ), blockId);
  }

  /** Remove a stored cell (idempotent). */
  removeCell(localX: number, localY: number, localZ: number): void {
    this.cells.delete(this.index(localX, localY, localZ));
  }
}

const SURFACE_AMPLITUDE = 12;
const SURFACE_SCALE = 0.01;
const DENSITY_VERTICAL_SCALE = 32;
const DETAIL_AMPLITUDE = 0.25;
const DETAIL_SEED_XOR = 0x9e3779b9;

/**
 * Generate a terrain column for (columnX, columnZ) with the given world seed. Pure and
 * deterministic.
 */
export function generateTerrainColumn(
  seed: number,
  columnX: number,
  columnZ: number,
  config?: Partial<OverworldTerrainConfig>,
  ids?: Partial<TerrainBlockIds>,
): TerrainColumn {
  const resolved = resolveConfig(seed, config);
  const blockIds = resolveIds(ids);
  const column = new TerrainColumn(columnX, columnZ, resolved.minY, resolved.maxY);

  const surfaceNoise = new ValueNoise3D(resolved.worldSeed);
  const detailNoise = new ValueNoise3D(resolved.worldSeed ^ DETAIL_SEED_XOR);

  const height = resolved.maxY - resolved.minY;
  for (let localZ = 0; localZ < 16; localZ++) {
    for (let localX = 0; localX < 16; localX++) {
      const wx = columnX * 16 + localX;
      const wz = columnZ * 16 + localZ;
      const surface =
        64 + SURFACE_AMPLITUDE * fbm3D(surfaceNoise, 4, 2, 0.5, wx * SURFACE_SCALE, 0, wz * SURFACE_SCALE);

      for (let localY = 0; localY < height; localY++) {
        const wy = resolved.minY + localY;
        if (wy === resolved.minY) {
          column.setCell(localX, wy, localZ, blockIds.bedrock);
          continue;
        }
        const detail = DETAIL_AMPLITUDE * detailNoise.sample(wx, wy, wz);
        const density = (surface - wy) / DENSITY_VERTICAL_SCALE + detail;
        if (density > 0) {
          column.setCell(localX, wy, localZ, blockIds.stone);
        } else if (wy < resolved.seaLevel) {
          column.setCell(localX, wy, localZ, blockIds.water);
        }
      }
    }
  }
  return column;
}
