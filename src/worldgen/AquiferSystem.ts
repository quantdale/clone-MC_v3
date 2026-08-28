/**
 * Aquifer system (093). `classifyAquifer` decides each cell's fluid deterministically: above sea
 * level → NONE; dryness noise above `dryThreshold` → NONE (dry pocket); below `lavaLevel` →
 * LAVA; otherwise WATER. `applyAquifers` fills a 092 `CarvedColumn`'s cells in a 088
 * `TerrainColumn` with the fluid block ids (or leaves them air), purely.
 */
import { fbm3D, ValueNoise3D } from './DensityNoise';
import type { CarvedColumn } from './CaveCarver';
import { TerrainColumn } from './OverworldTerrain';

/** Per-cell aquifer decision. */
export type AquiferDecision = 'WATER' | 'LAVA' | 'NONE';

/** Aquifer configuration. */
export interface AquiferConfig {
  seed: number;
  seaLevel: number;
  lavaLevel: number;
  dryThreshold: number;
}

export const DEFAULT_AQUIFER_CONFIG: Omit<AquiferConfig, 'seed'> = {
  seaLevel: 63,
  lavaLevel: -54,
  dryThreshold: 0.4,
};

/** Block ids for aquifer fluids. */
export interface AquiferBlockIds {
  water: number;
  lava: number;
}

export const DEFAULT_AQUIFER_BLOCK_IDS: AquiferBlockIds = { water: 8, lava: 10 };

const DRY_SCALE = 0.03;
const DRY_SEED_XOR = 0x165667b1;

function resolveConfig(seed: number, partial?: Partial<AquiferConfig>): AquiferConfig {
  const config: AquiferConfig = {
    seed,
    seaLevel: partial?.seaLevel ?? DEFAULT_AQUIFER_CONFIG.seaLevel,
    lavaLevel: partial?.lavaLevel ?? DEFAULT_AQUIFER_CONFIG.lavaLevel,
    dryThreshold: partial?.dryThreshold ?? DEFAULT_AQUIFER_CONFIG.dryThreshold,
  };
  if (
    typeof config.dryThreshold !== 'number' ||
    !Number.isFinite(config.dryThreshold) ||
    !Number.isInteger(config.seaLevel) ||
    !Number.isInteger(config.lavaLevel) ||
    config.lavaLevel >= config.seaLevel
  ) {
    throw new Error(
      `Aquifer: invalid config (seaLevel ${config.seaLevel}, lavaLevel ${config.lavaLevel}, dryThreshold ${config.dryThreshold})`,
    );
  }
  return config;
}

/**
 * The deterministic aquifer decision for a cell: above sea level → NONE; dryness noise above the
 * threshold → NONE; below `lavaLevel` → LAVA; otherwise WATER.
 */
export function classifyAquifer(
  seed: number,
  x: number,
  y: number,
  z: number,
  config?: Partial<AquiferConfig>,
): AquiferDecision {
  const resolved = resolveConfig(seed, config);
  if (y >= resolved.seaLevel) return 'NONE';
  const dry = new ValueNoise3D(seed ^ DRY_SEED_XOR);
  if (fbm3D(dry, 3, 2, 0.5, x * DRY_SCALE, y * DRY_SCALE, z * DRY_SCALE) > resolved.dryThreshold) {
    return 'NONE';
  }
  return y < resolved.lavaLevel ? 'LAVA' : 'WATER';
}

/**
 * Fill a carved column's cells with aquifer fluids: carved cells get water/lava ids per
 * classification (dry/above-sea cells stay air); everything else is preserved. Pure.
 */
export function applyAquifers(
  column: TerrainColumn,
  carved: CarvedColumn,
  seed: number,
  config?: Partial<AquiferConfig>,
  ids?: Partial<AquiferBlockIds>,
): TerrainColumn {
  const resolved = resolveConfig(seed, config);
  const blockIds: AquiferBlockIds = {
    water: ids?.water ?? DEFAULT_AQUIFER_BLOCK_IDS.water,
    lava: ids?.lava ?? DEFAULT_AQUIFER_BLOCK_IDS.lava,
  };
  const dry = new ValueNoise3D(seed ^ DRY_SEED_XOR);
  const result = new TerrainColumn(column.columnX, column.columnZ, column.minY, column.maxY);

  for (let localZ = 0; localZ < 16; localZ++) {
    for (let localX = 0; localX < 16; localX++) {
      const wx = column.columnX * 16 + localX;
      const wz = column.columnZ * 16 + localZ;
      for (let wy = column.minY; wy < column.maxY; wy++) {
        const block = column.getBlock(localX, wy, localZ);
        if (block === null) continue;
        if (carved.has(localX, wy, localZ)) {
          if (wy >= resolved.seaLevel) continue; // carved above sea stays air
          const isDry = fbm3D(dry, 3, 2, 0.5, wx * DRY_SCALE, wy * DRY_SCALE, wz * DRY_SCALE) > resolved.dryThreshold;
          if (isDry) continue;
          result.setCell(localX, wy, localZ, wy < resolved.lavaLevel ? blockIds.lava : blockIds.water);
        } else {
          result.setCell(localX, wy, localZ, block);
        }
      }
    }
  }
  return result;
}
