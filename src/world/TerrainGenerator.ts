import { CONFIG } from '../config';
import { fbm2 } from '../math/Noise';
import { PRNG, hash2 } from '../math/PRNG';
import { BlockId, BlockRegistry } from './BlockRegistry';
import { Chunk } from './Chunk';
import { CHUNK_DIMENSIONS } from './WorldCoordinates';

/** Horizontal reach (in blocks) of a tree canopy on each side of the trunk. */
const CANOPY_HALF_WIDTH = 2;
/** Probability that a given column is a tree location. */
const TREE_DENSITY = 0.012;
/** Half the vertical range of the height noise around sea level. */
const HEIGHT_AMPLITUDE = 12;
/** Number of octaves for the height fbm. */
const NOISE_OCTAVES = 4;
/** Spatial frequency of the height noise (larger = more varied terrain). */
const NOISE_SCALE = 0.025;

/**
 * Deterministic, seed-driven terrain generation.
 *
 * Produces the base terrain for a chunk: bedrock, stone, dirt, surface (grass
 * or sand), water, and air — plus trees. Everything is derived from the seed
 * and world coordinates via the seeded PRNG / noise, never from Math.random.
 * Tree placement is owner-based so that a chunk computes the exact same
 * overhanging canopy blocks its neighbor would, guaranteeing no duplication
 * and no clipping across chunk borders.
 */
export class TerrainGenerator {
  private readonly registry: BlockRegistry;
  private readonly seed: number;

  constructor(registry: BlockRegistry, seed: number) {
    this.registry = registry;
    this.seed = seed >>> 0;
    // Fail fast on a registry missing the block ids generation emits.
    this.registry.get(BlockId.Bedrock);
    this.registry.get(BlockId.Grass);
    this.registry.get(BlockId.Dirt);
    this.registry.get(BlockId.Stone);
    this.registry.get(BlockId.Sand);
    this.registry.get(BlockId.Water);
    this.registry.get(BlockId.Wood);
    this.registry.get(BlockId.Leaves);
  }

  /**
   * World Y of the surface block for a given world column. Uses the same noise
   * as generateChunk so the two always agree.
   */
  getHeightAt(worldX: number, worldZ: number): number {
    const n = fbm2(worldX * NOISE_SCALE, worldZ * NOISE_SCALE, this.seed, NOISE_OCTAVES);
    return Math.round(CONFIG.seaLevel + n * HEIGHT_AMPLITUDE);
  }

  /** Fill a chunk's block storage with the base terrain plus trees. */
  generateChunk(chunk: Chunk): void {
    const wx0 = chunk.cx * CHUNK_DIMENSIONS.width;
    const wy0 = chunk.cy * CHUNK_DIMENSIONS.height;
    const wz0 = chunk.cz * CHUNK_DIMENSIONS.depth;

    for (let lx = 0; lx < CHUNK_DIMENSIONS.width; lx++) {
      const wx = wx0 + lx;
      for (let lz = 0; lz < CHUNK_DIMENSIONS.depth; lz++) {
        const wz = wz0 + lz;
        const height = this.getHeightAt(wx, wz);
        for (let ly = 0; ly < CHUNK_DIMENSIONS.height; ly++) {
          const wy = wy0 + ly;
          let id: number;
          if (wy === CONFIG.bedrockY) {
            id = BlockId.Bedrock;
          } else if (wy < height) {
            id = wy >= height - 3 ? BlockId.Dirt : BlockId.Stone;
          } else if (wy === height) {
            id = height > CONFIG.seaLevel ? BlockId.Grass : BlockId.Sand;
          } else if (wy <= CONFIG.seaLevel) {
            id = BlockId.Water;
          } else {
            id = BlockId.Air;
          }
          chunk.setLocal(lx, ly, lz, id);
        }
      }
    }

    this.placeTrees(chunk);
  }

  /**
   * Build the deterministic tree spec for a column, or null if it is not a
   * tree location. Pure function of (worldX, worldZ, seed).
   */
  private treeSpec(ax: number, az: number): { trunkHeight: number } | null {
    const rng = new PRNG(hash2(ax, az, this.seed));
    if (rng.next() >= TREE_DENSITY) {
      return null;
    }
    return { trunkHeight: 4 + rng.nextInt(2) };
  }

  /**
   * Place trees. Trunks live in their anchor column, so they never cross chunk
   * borders. Canopy blocks are written by iterating over every anchor column
   * whose canopy could reach this chunk; because this depends only on world
   * coordinates and the seed, neighboring chunks compute the identical canopy
   * blocks, so there is no duplication and no clipping.
   */
  private placeTrees(chunk: Chunk): void {
    const wx0 = chunk.cx * CHUNK_DIMENSIONS.width;
    const wy0 = chunk.cy * CHUNK_DIMENSIONS.height;
    const wz0 = chunk.cz * CHUNK_DIMENSIONS.depth;
    const half = CANOPY_HALF_WIDTH;

    for (let ax = wx0 - half; ax <= wx0 + CHUNK_DIMENSIONS.width - 1 + half; ax++) {
      for (let az = wz0 - half; az <= wz0 + CHUNK_DIMENSIONS.depth - 1 + half; az++) {
        const spec = this.treeSpec(ax, az);
        if (!spec) {
          continue;
        }
        const surface = this.getHeightAt(ax, az);
        if (surface <= CONFIG.seaLevel) {
          continue; // no trees below or at sea level
        }

        const trunkHeight = spec.trunkHeight;

        // Trunk: only in the anchor column, which sits in this chunk whenever
        // the anchor is within this chunk's horizontal footprint.
        if (
          ax >= wx0 &&
          ax < wx0 + CHUNK_DIMENSIONS.width &&
          az >= wz0 &&
          az < wz0 + CHUNK_DIMENSIONS.depth
        ) {
          const lx = ax - wx0;
          const lz = az - wz0;
          for (let y = surface + 1; y <= surface + trunkHeight; y++) {
            const ly = y - wy0;
            if (ly >= 0 && ly < CHUNK_DIMENSIONS.height && chunk.getLocalSafe(lx, ly, lz) === BlockId.Air) {
              chunk.setLocal(lx, ly, lz, BlockId.Wood);
            }
          }
        }

        // Canopy: a 5x5x3 blob (top layer 3x3) sitting just above the trunk.
        const canopyBottom = surface + trunkHeight + 1;
        for (let layer = 0; layer < 3; layer++) {
          const y = canopyBottom + layer;
          const ly = y - wy0;
          if (ly < 0 || ly >= CHUNK_DIMENSIONS.height) {
            continue;
          }
          const reach = layer === 2 ? 1 : half;
          for (let dx = -reach; dx <= reach; dx++) {
            for (let dz = -reach; dz <= reach; dz++) {
              const wx = ax + dx;
              const wz = az + dz;
              if (
                wx < wx0 ||
                wx >= wx0 + CHUNK_DIMENSIONS.width ||
                wz < wz0 ||
                wz >= wz0 + CHUNK_DIMENSIONS.depth
              ) {
                continue;
              }
              const lx = wx - wx0;
              const lz = wz - wz0;
              if (chunk.getLocalSafe(lx, ly, lz) === BlockId.Air) {
                chunk.setLocal(lx, ly, lz, BlockId.Leaves);
              }
            }
          }
        }
      }
    }
  }
}