/**
 * Nether world generation (176): the first dimension-specific terrain, consuming 175's
 * `NETHER_DIMENSION_TYPE` bounds (0..255) and reusing the exact worldgen shape 088 established —
 * a pure, deterministic `generateNetherColumn(seed, columnX, columnZ)` producing a sparse
 * 16×16×height `TerrainColumn`.
 *
 * Nether rules (deterministic approximations of vanilla, each asserted by tests):
 * - **Bedrock floor** at `minY` (0) and a full **bedrock roof** at `ceilingY` (127 — vanilla's
 *   Nether ceiling); cells above the roof are air (open roof area).
 * - **No water anywhere** — the overworld's water role is played by **lava**: every cell below
 *   `lavaLevel` (31) that is not terrain is lava.
 * - **Netherrack body**: solid where density > 0, with the terrain band concentrated around the
 *   middle of the 32..127 band (vanilla's main terrain layer).
 *
 * Block ids are caller-configurable (like 088's `TerrainBlockIds`): the defaults are `lava: 20`
 * (`BlockId.Lava`), `bedrock: 7` (`BlockId.Bedrock`), and `netherrack: 1` — a documented
 * placeholder until 179 (`nether-content-baseline`) registers the real netherrack block; callers
 * pass the real id.
 */
import { ValueNoise3D } from './DensityNoise';
import { TerrainColumn } from './OverworldTerrain';

/** Nether terrain volume configuration. */
export interface NetherTerrainConfig {
  worldSeed: number;
  /** Lowest world Y (inclusive). */
  minY: number;
  /** Highest world Y + 1 (exclusive). */
  maxY: number;
  /** Lava fills air below this Y. */
  lavaLevel: number;
  /** The flat bedrock roof layer at this Y (must lie strictly inside the volume). */
  ceilingY: number;
}

/** Block ids the generator writes. */
export interface NetherTerrainBlockIds {
  netherrack: number;
  lava: number;
  bedrock: number;
}

/**
 * Default Nether volume (matches 175's `NETHER_DIMENSION_TYPE` bounds): 0..255, lava sea at 31,
 * bedrock roof at 127.
 */
export const DEFAULT_NETHER_TERRAIN_CONFIG: Omit<NetherTerrainConfig, 'worldSeed'> = {
  minY: 0,
  maxY: 256,
  lavaLevel: 31,
  ceilingY: 127,
};

/**
 * Default ids: lava 20 (`BlockId.Lava`), bedrock 7 (`BlockId.Bedrock`), netherrack 1 — a
 * placeholder (179 registers the real netherrack block; callers pass its id).
 */
export const DEFAULT_NETHER_TERRAIN_BLOCK_IDS: NetherTerrainBlockIds = {
  netherrack: 1,
  lava: 20,
  bedrock: 7,
};

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function resolveConfig(seed: number, partial?: Partial<NetherTerrainConfig>): NetherTerrainConfig {
  const config: NetherTerrainConfig = {
    worldSeed: seed,
    minY: partial?.minY ?? DEFAULT_NETHER_TERRAIN_CONFIG.minY,
    maxY: partial?.maxY ?? DEFAULT_NETHER_TERRAIN_CONFIG.maxY,
    lavaLevel: partial?.lavaLevel ?? DEFAULT_NETHER_TERRAIN_CONFIG.lavaLevel,
    ceilingY: partial?.ceilingY ?? DEFAULT_NETHER_TERRAIN_CONFIG.ceilingY,
  };
  if (
    !isInteger(config.minY) ||
    !isInteger(config.maxY) ||
    !isInteger(config.lavaLevel) ||
    !isInteger(config.ceilingY) ||
    config.minY >= config.maxY ||
    config.lavaLevel <= config.minY ||
    config.ceilingY <= config.lavaLevel ||
    config.ceilingY >= config.maxY
  ) {
    throw new Error(
      `NetherTerrain: invalid config (minY ${config.minY}, maxY ${config.maxY}, lavaLevel ${config.lavaLevel}, ceilingY ${config.ceilingY})`,
    );
  }
  return config;
}

function resolveIds(partial?: Partial<NetherTerrainBlockIds>): NetherTerrainBlockIds {
  const ids: NetherTerrainBlockIds = {
    netherrack: partial?.netherrack ?? DEFAULT_NETHER_TERRAIN_BLOCK_IDS.netherrack,
    lava: partial?.lava ?? DEFAULT_NETHER_TERRAIN_BLOCK_IDS.lava,
    bedrock: partial?.bedrock ?? DEFAULT_NETHER_TERRAIN_BLOCK_IDS.bedrock,
  };
  for (const [name, value] of Object.entries(ids)) {
    if (!isInteger(value) || value < 0) {
      throw new Error(`NetherTerrain: ${name} id must be a non-negative integer, got ${value}`);
    }
  }
  return ids;
}

const NETHER_DENSITY_VERTICAL_SCALE = 64;
const NETHER_DETAIL_AMPLITUDE = 1;
const NETHER_DETAIL_SEED_XOR = 0x85ebca6b;

/**
 * Generate a Nether terrain column for (columnX, columnZ) with the given world seed. Pure and
 * deterministic; output is sparse (non-air cells only), matching 088's `TerrainColumn`.
 */
export function generateNetherColumn(
  seed: number,
  columnX: number,
  columnZ: number,
  config?: Partial<NetherTerrainConfig>,
  ids?: Partial<NetherTerrainBlockIds>,
): TerrainColumn {
  const resolved = resolveConfig(seed, config);
  const blockIds = resolveIds(ids);
  const column = new TerrainColumn(columnX, columnZ, resolved.minY, resolved.maxY);

  // Spongy 3D density centered on the lava level: below it the field is mostly positive (solid
  // lava-ocean floor with air pockets that become lava), above it the field oscillates around zero
  // so netherrack forms caverns up to ~lavaLevel + 64, and beyond that stays air.
  const densityNoise = new ValueNoise3D(resolved.worldSeed ^ NETHER_DETAIL_SEED_XOR);

  const height = resolved.maxY - resolved.minY;
  for (let localZ = 0; localZ < 16; localZ++) {
    for (let localX = 0; localX < 16; localX++) {
      const wx = columnX * 16 + localX;
      const wz = columnZ * 16 + localZ;

      for (let localY = 0; localY < height; localY++) {
        const wy = resolved.minY + localY;
        if (wy === resolved.minY || wy === resolved.ceilingY) {
          // Bedrock floor and full bedrock roof.
          column.setCell(localX, wy, localZ, blockIds.bedrock);
          continue;
        }
        if (wy > resolved.ceilingY) {
          // Open roof area above the bedrock ceiling: air.
          continue;
        }
        const detail = NETHER_DETAIL_AMPLITUDE * densityNoise.sample(wx, wy, wz);
        const density = (resolved.lavaLevel - wy) / NETHER_DENSITY_VERTICAL_SCALE + detail;
        if (density > 0) {
          column.setCell(localX, wy, localZ, blockIds.netherrack);
        } else if (wy < resolved.lavaLevel) {
          // The overworld's water role is played by lava in the Nether.
          column.setCell(localX, wy, localZ, blockIds.lava);
        }
      }
    }
  }
  return column;
}
