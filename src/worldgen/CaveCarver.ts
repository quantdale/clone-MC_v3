/**
 * Cave carver (092). `carveValue(seed, x, y, z)` implements a documented two-noise formula
 * independent of terrain density: `fbm4(wide, x·0.02, y·0.02, z·0.02) − 0.4 · fbm3(detail,
 * x·0.09, y·0.09, z·0.09)`; a cell is carved when the value exceeds the threshold (default
 * 0.05). `carveColumn` produces a deterministic sparse mask confined to `[minY, maxY)`;
 * `applyCarving` returns a new 088 `TerrainColumn` with exactly the carved cells removed.
 */
import { fbm3D, ValueNoise3D } from './DensityNoise';
import { TerrainColumn } from './OverworldTerrain';

/** Carver configuration. */
export interface CaveCarverConfig {
  seed: number;
  /** Cells with carveValue above this become air. */
  threshold: number;
  minY: number;
  maxY: number;
}

export const DEFAULT_CAVE_CARVER_CONFIG: Omit<CaveCarverConfig, 'seed'> = {
  threshold: 0.05,
  minY: -64,
  maxY: 320,
};

const WIDE_SCALE = 0.02;
const DETAIL_SCALE = 0.09;
const DETAIL_WEIGHT = 0.4;
const WIDE_SEED_XOR = 0x9e3779b9;
const DETAIL_SEED_XOR = 0x85ebca6b;

function resolveConfig(seed: number, partial?: Partial<CaveCarverConfig>): CaveCarverConfig {
  const config: CaveCarverConfig = {
    seed,
    threshold: partial?.threshold ?? DEFAULT_CAVE_CARVER_CONFIG.threshold,
    minY: partial?.minY ?? DEFAULT_CAVE_CARVER_CONFIG.minY,
    maxY: partial?.maxY ?? DEFAULT_CAVE_CARVER_CONFIG.maxY,
  };
  if (
    typeof config.threshold !== 'number' ||
    !Number.isFinite(config.threshold) ||
    !Number.isInteger(config.minY) ||
    !Number.isInteger(config.maxY) ||
    config.minY >= config.maxY
  ) {
    throw new Error(
      `CaveCarver: invalid config (threshold ${config.threshold}, minY ${config.minY}, maxY ${config.maxY})`,
    );
  }
  return config;
}

/** The deterministic carve value at world coordinates (bounded by the amplitude sums). */
export function carveValue(seed: number, x: number, y: number, z: number): number {
  const wide = new ValueNoise3D(seed ^ WIDE_SEED_XOR);
  const detail = new ValueNoise3D(seed ^ DETAIL_SEED_XOR);
  return (
    fbm3D(wide, 4, 2, 0.5, x * WIDE_SCALE, y * WIDE_SCALE, z * WIDE_SCALE) -
    DETAIL_WEIGHT * fbm3D(detail, 3, 2, 0.5, x * DETAIL_SCALE, y * DETAIL_SCALE, z * DETAIL_SCALE)
  );
}

/** Sparse mask of carved cells in one 16×16 column. */
export class CarvedColumn {
  private readonly cells = new Set<number>();
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

  private index(localX: number, worldY: number, localZ: number): number {
    const height = this.maxY - this.minY;
    return localX + 16 * (worldY - this.minY) + 16 * height * localZ;
  }

  /** Whether the cell at local coordinates is carved. */
  has(localX: number, worldY: number, localZ: number): boolean {
    if (worldY < this.minY || worldY >= this.maxY) return false;
    return this.cells.has(this.index(localX, worldY, localZ));
  }

  /** Number of carved cells. */
  get size(): number {
    return this.cells.size;
  }

  /** Internal: mark a cell carved. */
  add(localX: number, worldY: number, localZ: number): void {
    this.cells.add(this.index(localX, worldY, localZ));
  }
}

/** Carve one column: all cells with `carveValue > threshold` within `[minY, maxY)`. */
export function carveColumn(
  seed: number,
  columnX: number,
  columnZ: number,
  config?: Partial<CaveCarverConfig>,
): CarvedColumn {
  const resolved = resolveConfig(seed, config);
  const wide = new ValueNoise3D(seed ^ WIDE_SEED_XOR);
  const detail = new ValueNoise3D(seed ^ DETAIL_SEED_XOR);
  const mask = new CarvedColumn(columnX, columnZ, resolved.minY, resolved.maxY);
  const height = resolved.maxY - resolved.minY;

  for (let localZ = 0; localZ < 16; localZ++) {
    for (let localX = 0; localX < 16; localX++) {
      const wx = columnX * 16 + localX;
      const wz = columnZ * 16 + localZ;
      for (let localY = 0; localY < height; localY++) {
        const wy = resolved.minY + localY;
        const value =
          fbm3D(wide, 4, 2, 0.5, wx * WIDE_SCALE, wy * WIDE_SCALE, wz * WIDE_SCALE) -
          DETAIL_WEIGHT * fbm3D(detail, 3, 2, 0.5, wx * DETAIL_SCALE, wy * DETAIL_SCALE, wz * DETAIL_SCALE);
        if (value > resolved.threshold) {
          mask.add(localX, wy, localZ);
        }
      }
    }
  }
  return mask;
}

/** A new column with exactly the carved cells removed; the input is untouched. */
export function applyCarving(column: TerrainColumn, carved: CarvedColumn): TerrainColumn {
  const result = new TerrainColumn(column.columnX, column.columnZ, column.minY, column.maxY);
  for (let localZ = 0; localZ < 16; localZ++) {
    for (let localX = 0; localX < 16; localX++) {
      for (let wy = column.minY; wy < column.maxY; wy++) {
        const block = column.getBlock(localX, wy, localZ);
        if (block !== null && !carved.has(localX, wy, localZ)) {
          result.setCell(localX, wy, localZ, block);
        }
      }
    }
  }
  return result;
}
