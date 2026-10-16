/**
 * End world generation (181): the first End terrain, consuming 180's `END_DIMENSION_TYPE` bounds
 * (0..255) and mirroring 176's pattern — a pure, deterministic `generateEndColumn(seed, columnX,
 * columnZ)` producing a sparse `TerrainColumn` over the End void.
 *
 * The End is almost entirely VOID; this baseline generates:
 * - the **main island** at the origin: an end-stone blob centered on (0, 64) with a noisy radius
 *   (35..55), so its top reaches ~y=119 and its underside ~y=9 (vanilla's main island profile);
 * - **outer islands** beyond `END_OUTER_ISLAND_DISTANCE` (1000, vanilla's outer ring): seeded
 *   per-column noise decides which columns carry a small end-stone blob around y=64;
 * - air everywhere else (the void).
 *
 * Block ids are caller-configurable like 176's `EndTerrainBlockIds`: the default `endStone: 1` is a
 * documented placeholder until a later content change (215) registers the real end_stone block —
 * exactly the 176→179 handoff pattern. The obsidian platform and pillars are 182/183's scope.
 */
import { fbm3D, ValueNoise3D } from './DensityNoise';
import { TerrainColumn } from './OverworldTerrain';

/** End terrain volume configuration. */
export interface EndTerrainConfig {
  worldSeed: number;
  /** Lowest world Y (inclusive). */
  minY: number;
  /** Highest world Y + 1 (exclusive). */
  maxY: number;
}

/** Block ids the generator writes. */
export interface EndTerrainBlockIds {
  endStone: number;
}

/** Default End volume: matches 180's `END_DIMENSION_TYPE` bounds (0..256). */
export const DEFAULT_END_TERRAIN_CONFIG: Omit<EndTerrainConfig, 'worldSeed'> = {
  minY: 0,
  maxY: 256,
};

/**
 * Default ids: endStone 1 — a documented placeholder (215 registers the real end_stone block;
 * callers pass its id), matching the 176→179 handoff pattern.
 */
export const DEFAULT_END_TERRAIN_BLOCK_IDS: EndTerrainBlockIds = {
  endStone: 1,
};

/** The main island's center Y (vanilla ~64). */
export const END_MAIN_ISLAND_CENTER_Y = 64;
/** Base main-island radius; the noisy radius ranges base ± variation. */
export const END_MAIN_ISLAND_BASE_RADIUS = 45;
export const END_MAIN_ISLAND_RADIUS_VARIATION = 10;
/** Columns beyond this world distance from the origin may carry outer islands. */
export const END_OUTER_ISLAND_DISTANCE = 1000;
/** Seeded noise above this threshold marks an outer column as island-bearing. */
export const END_OUTER_ISLAND_THRESHOLD = 0.35;
/** Outer-island blob radius around y=64. */
export const END_OUTER_ISLAND_RADIUS = 12;

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function resolveConfig(seed: number, partial?: Partial<EndTerrainConfig>): EndTerrainConfig {
  const config: EndTerrainConfig = {
    worldSeed: seed,
    minY: partial?.minY ?? DEFAULT_END_TERRAIN_CONFIG.minY,
    maxY: partial?.maxY ?? DEFAULT_END_TERRAIN_CONFIG.maxY,
  };
  if (!isInteger(config.minY) || !isInteger(config.maxY) || config.minY >= config.maxY) {
    throw new Error(
      `EndTerrain: invalid config (minY ${config.minY}, maxY ${config.maxY})`,
    );
  }
  return config;
}

function resolveIds(partial?: Partial<EndTerrainBlockIds>): EndTerrainBlockIds {
  const ids: EndTerrainBlockIds = {
    endStone: partial?.endStone ?? DEFAULT_END_TERRAIN_BLOCK_IDS.endStone,
  };
  if (!isInteger(ids.endStone) || ids.endStone < 0) {
    throw new Error(`EndTerrain: endStone id must be a non-negative integer, got ${ids.endStone}`);
  }
  return ids;
}

const ISLAND_NOISE_SCALE = 0.008;
const ISLAND_NOISE_SEED_XOR = 0x6a09e667;

/**
 * Generate an End terrain column for (columnX, columnZ) with the given world seed. Pure and
 * deterministic; output is sparse (non-air cells only), matching 088's `TerrainColumn`.
 */
export function generateEndColumn(
  seed: number,
  columnX: number,
  columnZ: number,
  config?: Partial<EndTerrainConfig>,
  ids?: Partial<EndTerrainBlockIds>,
): TerrainColumn {
  const resolved = resolveConfig(seed, config);
  const blockIds = resolveIds(ids);
  const column = new TerrainColumn(columnX, columnZ, resolved.minY, resolved.maxY);

  const islandNoise = new ValueNoise3D(resolved.worldSeed ^ ISLAND_NOISE_SEED_XOR);
  const centerX = columnX * 16 + 8;
  const centerZ = columnZ * 16 + 8;
  const isOuterRegion = Math.abs(centerX) >= END_OUTER_ISLAND_DISTANCE || Math.abs(centerZ) >= END_OUTER_ISLAND_DISTANCE;
  const outerNoise = fbm3D(islandNoise, 4, 2, 0.5, centerX * ISLAND_NOISE_SCALE, 0, centerZ * ISLAND_NOISE_SCALE);
  const hasOuterIsland = isOuterRegion && outerNoise > END_OUTER_ISLAND_THRESHOLD;
  const outerRadius = END_OUTER_ISLAND_RADIUS * (0.5 + 0.5 * Math.abs(outerNoise));

  const height = resolved.maxY - resolved.minY;
  for (let localZ = 0; localZ < 16; localZ++) {
    for (let localX = 0; localX < 16; localX++) {
      const wx = columnX * 16 + localX;
      const wz = columnZ * 16 + localZ;

      let radius: number | null = null;
      if (!isOuterRegion) {
        // Main island: noisy radius around (0, 64).
        const noise = fbm3D(islandNoise, 4, 2, 0.5, wx * ISLAND_NOISE_SCALE, 0, wz * ISLAND_NOISE_SCALE);
        radius = END_MAIN_ISLAND_BASE_RADIUS + END_MAIN_ISLAND_RADIUS_VARIATION * noise;
      } else if (hasOuterIsland) {
        radius = outerRadius;
      }

      for (let localY = 0; localY < height; localY++) {
        const wy = resolved.minY + localY;
        if (radius === null) continue;
        const dx = wx;
        const dy = wy - END_MAIN_ISLAND_CENTER_Y;
        const dz = wz;
        if (dx * dx + dy * dy + dz * dz < radius * radius) {
          column.setCell(localX, wy, localZ, blockIds.endStone);
        }
      }
    }
  }
  return column;
}
