import { CONFIG } from '../config';
import { fbm2, valueNoise3 } from '../math/Noise';
import { PRNG, hash2 } from '../math/PRNG';
import { BlockId, BlockRegistry } from './BlockRegistry';
import { buildTreeBlocks, createDefaultTreeConfiguredFeatures, type TreeFoliageConfig, type TreeTrunkConfig } from '../worldgen/TreeFeature';
import { createDefaultStructureGenerator, StructureGenerator } from '../worldgen/StructureGenerator';
import { ClimateSampler } from '../worldgen/ClimateSampler';
import { ValueNoise3D } from '../worldgen/DensityNoise';
import { applySurfaceRules, validateSurfaceRules, type SurfaceRule } from '../worldgen/SurfaceRuleEngine';
import { createDefaultOreVeinDefinitions, stampChunkOreVeins, type OreVeinDefinition } from '../worldgen/OreVeinFeature';
import { Chunk } from './Chunk';
import { CHUNK_DIMENSIONS } from './WorldCoordinates';

/** Probability that a given column is a tree location. */
const TREE_DENSITY = 0.012;
/** Half the vertical range of the height noise around sea level. */
const HEIGHT_AMPLITUDE = 12;
/** Number of octaves for the height fbm. */
const NOISE_OCTAVES = 4;
/** Spatial frequency of the height noise (larger = more varied terrain). */
const NOISE_SCALE = 0.025;
/** Keep the spawn area familiar and easy to navigate. */
const SPAWN_PLAINS_RADIUS = 48;
/** Vertical cave noise frequency. */
const CAVE_Y_SCALE = 0.085;
/** Seed xor for the sea-floor patchiness noise used by the surface rules. */
const SEA_FLOOR_SEED_XOR = 0x27d4eb2f;
/** How deep (in blocks below the surface cell) surface rules may reach. */
const MAX_SURFACE_DEPTH = 4;

export type Biome = 'plains' | 'forest' | 'desert' | 'taiga';

/** Dense biome indices for the per-column cache (mirrors `BIOME_KEYS`). */
const BIOME_PLAINS = 0;
const BIOME_FOREST = 1;
const BIOME_DESERT = 2;
const BIOME_TAIGA = 3;

/** Biome keys by dense index; order matches the index constants above. */
const BIOME_KEYS: readonly Biome[] = ['plains', 'forest', 'desert', 'taiga'];

/**
 * Declarative surface rules (Phase 6). Evaluated first-match-wins per near-surface
 * cell; `depthFromSurface` 0 is the surface cell. Replaces the former hard-coded
 * desert/taiga/underwater if-chains with data the SurfaceRuleEngine can validate.
 * Order matters: desert sand wins over the underwater band, which wins over the
 * generic grass/dirt cap.
 */
function createDefaultSurfaceRules(seaLevel: number): SurfaceRule[] {
  const submerged = { type: 'height' as const, minY: CONFIG.bedrockY, maxY: seaLevel + 1 };
  return validateSurfaceRules([
    // Desert: a 4-block sand cap.
    { condition: { type: 'biome', biomeKey: 'desert' }, blockId: BlockId.Sand, depth: 4 },
    // Submerged columns: patchy gravel sea floor over a sand cap.
    {
      condition: { type: 'and', conditions: [submerged, { type: 'noise', noiseId: 'seafloor_gravel', threshold: -0.2 }] },
      blockId: BlockId.Gravel,
      depth: 1,
    },
    { condition: submerged, blockId: BlockId.Sand, depth: 1 },
    { condition: submerged, blockId: BlockId.Gravel, depth: 2 },
    // Taiga: snow cap over dirt.
    { condition: { type: 'biome', biomeKey: 'taiga' }, blockId: BlockId.Snow, depth: 1 },
    { condition: { type: 'biome', biomeKey: 'taiga' }, blockId: BlockId.Dirt, depth: 3 },
    // Everything else (plains/forest): grass over a dirt band.
    { condition: { type: 'always' }, blockId: BlockId.Grass, depth: 1 },
    { condition: { type: 'always' }, blockId: BlockId.Dirt, depth: 3 },
  ]);
}

/**
 * Deterministic, seed-driven terrain generation.
 *
 * Generation stage order (audit 04 "World generation" / roadmap Phase 6), executed
 * per chunk in `generateChunk`:
 *
 *   1. CLIMATE  — five-field `ClimateSampler` per column (cached per chunk pass)
 *   2. BIOMES   — climate fields classified into the live biome keys
 *   3. TERRAIN  — heightmap density fill: bedrock / stone / dirt / water / air
 *   4. CAVES    — two-noise carving of stone-band cells (surface/sea guards kept)
 *   5. SURFACE  — declarative `SurfaceRuleEngine` rules on the near-surface band
 *   6. ORES     — owner-chunk coal/iron veins (`OreVeinFeature`, region-hashed rng)
 *   7. VEGETATION — trees via the tree feature system (owner-based canopy overlap)
 *   8. STRUCTURES — template structures (region-owned starts, last writer wins)
 *
 * Every stage is a pure function of (seed, world coordinates): no Math.random, no
 * cross-chunk mutable state. Features that could cross chunk borders are either
 * confined to their owner chunk (ores) or recomputed identically by every chunk
 * they touch (tree canopies), so worker scheduling cannot change world output.
 */
export class TerrainGenerator {
  private readonly registry: BlockRegistry;
  private readonly seed: number;

  /** The tree configured feature used for all placed trees (097). */
  private readonly treeConfig: { trunk: TreeTrunkConfig; foliage: TreeFoliageConfig };
  /** The structure generator (101): deterministic template structures per seed. */
  private readonly structures: StructureGenerator;
  /** Five-field climate sampler (089) driving biome classification. */
  private readonly climate: ClimateSampler;
  /** Validated declarative surface rules (091). */
  private readonly surfaceRules: SurfaceRule[];
  /** Sea-floor patchiness noise referenced by the surface rules. */
  private readonly seaFloorNoise: ValueNoise3D;
  /** Owner-chunk ore vein definitions (096 wiring). */
  private readonly oreVeins: readonly OreVeinDefinition[];
  constructor(registry: BlockRegistry, seed: number, structures: StructureGenerator = createDefaultStructureGenerator(seed)) {
    this.registry = registry;
    this.seed = seed >>> 0;
    this.structures = structures;
    this.climate = new ClimateSampler(this.seed);
    this.surfaceRules = createDefaultSurfaceRules(CONFIG.seaLevel);
    this.seaFloorNoise = new ValueNoise3D(this.seed ^ SEA_FLOOR_SEED_XOR);
    this.oreVeins = createDefaultOreVeinDefinitions(CONFIG.seaLevel, CONFIG.bedrockY);
    // Fail fast on a registry missing the block ids generation emits.
    this.registry.get(BlockId.Bedrock);
    this.registry.get(BlockId.Grass);
    this.registry.get(BlockId.Dirt);
    this.registry.get(BlockId.Stone);
    this.registry.get(BlockId.Sand);
    this.registry.get(BlockId.Water);
    this.registry.get(BlockId.Wood);
    this.registry.get(BlockId.Leaves);
    this.registry.get(BlockId.Snow);
    this.registry.get(BlockId.Gravel);
    this.registry.get(BlockId.CoalOre);
    this.registry.get(BlockId.IronOre);
    this.registry.get(BlockId.Lava);
    // Resolve the default tree feature (097): fail fast on a missing/invalid default.
    const oak = createDefaultTreeConfiguredFeatures().get('overworld/oak_tree');
    if (!oak || oak.config.type !== 'tree') {
      throw new Error('TerrainGenerator: missing default oak tree feature');
    }
    this.treeConfig = oak.config;
  }

  /**
   * World Y of the surface block for a given world column. Uses the same noise
   * as generateChunk so the two always agree.
   */
  getHeightAt(worldX: number, worldZ: number): number {
    const n = fbm2(worldX * NOISE_SCALE, worldZ * NOISE_SCALE, this.seed, NOISE_OCTAVES);
    return Math.round(CONFIG.seaLevel + n * HEIGHT_AMPLITUDE);
  }

  /**
   * Return the deterministic climate biome at a world column. The protected
   * spawn radius stays plains so a new world always starts on readable grass;
   * beyond that ring the 089 five-field climate fields classify the column:
   * hot+dry → desert, cold → taiga, humid → forest, otherwise plains.
   */
  getBiomeAt(worldX: number, worldZ: number): Biome {
    if (Math.hypot(worldX, worldZ) <= SPAWN_PLAINS_RADIUS) {
      return 'plains';
    }

    const sample = this.climate.sample(worldX, worldZ);
    if (sample.temperature > 0.45 && sample.humidity < -0.1) {
      return 'desert';
    }
    if (sample.temperature < -0.45) {
      return 'taiga';
    }
    if (sample.humidity > 0.35) {
      return 'forest';
    }
    return 'plains';
  }

  /** Whether a subterranean coordinate should be carved into a cave. */
  isCaveAt(worldX: number, worldY: number, worldZ: number, surfaceHeight = this.getHeightAt(worldX, worldZ)): boolean {
    if (
      Math.hypot(worldX, worldZ) <= SPAWN_PLAINS_RADIUS * 0.66 ||
      worldY <= CONFIG.bedrockY + 1 ||
      worldY >= surfaceHeight - 3 ||
      worldY >= CONFIG.seaLevel - 1
    ) {
      return false;
    }

    const broad = valueNoise3(
      worldX * 0.052,
      worldY * CAVE_Y_SCALE,
      worldZ * 0.052,
      this.seed + 41011,
    );
    const detail = valueNoise3(
      worldX * 0.115,
      worldY * 0.12,
      worldZ * 0.115,
      this.seed + 41027,
    );
    return broad > 0.77 && detail > 0.48;
  }

  /** Fill a chunk's block storage through the full generation stage pipeline. */
  generateChunk(chunk: Chunk): void {
    const wx0 = chunk.cx * CHUNK_DIMENSIONS.width;
    const wy0 = chunk.cy * CHUNK_DIMENSIONS.height;
    const wz0 = chunk.cz * CHUNK_DIMENSIONS.depth;
    const width = CHUNK_DIMENSIONS.width;
    const depth = CHUNK_DIMENSIONS.depth;

    // Stages 1-2 (CLIMATE/BIOMES): one sample per column, cached as a dense index.
    const biomes = new Uint8Array(width * depth);
    for (let lx = 0; lx < width; lx++) {
      for (let lz = 0; lz < depth; lz++) {
        biomes[lx + lz * width] = this.biomeIndex(wx0 + lx, wz0 + lz);
      }
    }

    // Stages 3-5 (TERRAIN/CAVES/SURFACE): per-column vertical sweep. The surface
    // context object is reused across cells to avoid per-voxel allocation.
    const surfaceCtx = {
      biomeKey: '',
      x: 0,
      y: 0,
      z: 0,
      depthFromSurface: 0,
      noise: (id: string, x: number, y: number, z: number): number =>
        id === 'seafloor_gravel' ? this.seaFloorNoise.sample(x * 0.08, y * 0.1, z * 0.08) : 0,
    };

    for (let lx = 0; lx < width; lx++) {
      const wx = wx0 + lx;
      for (let lz = 0; lz < depth; lz++) {
        const wz = wz0 + lz;
        const height = this.getHeightAt(wx, wz);
        const biome = BIOME_KEYS[biomes[lx + lz * width]!]!;
        for (let ly = 0; ly < CHUNK_DIMENSIONS.height; ly++) {
          const wy = wy0 + ly;
          let id: number;
          if (wy === CONFIG.bedrockY) {
            id = BlockId.Bedrock;
          } else if (wy < height) {
            id = wy >= height - 3 ? BlockId.Dirt : BlockId.Stone;
          } else if (wy === height) {
            id = BlockId.Dirt; // surface rules pick the actual cap block below
          } else if (wy <= CONFIG.seaLevel) {
            id = BlockId.Water;
          } else {
            id = BlockId.Air;
          }

          if (id === BlockId.Stone && this.isLavaAt(wx, wy, wz, height)) {
            id = BlockId.Lava;
          }

          if (
            (id === BlockId.Stone || id === BlockId.Dirt) &&
            this.isCaveAt(wx, wy, wz, height)
          ) {
            id = BlockId.Air;
          }

          // Stage 5 (SURFACE): declarative rules replace the near-surface band.
          // Deep stone and non-solid cells fall through untouched.
          const depthFromSurface = height - wy;
          if (
            depthFromSurface >= 0 &&
            depthFromSurface < MAX_SURFACE_DEPTH &&
            id !== BlockId.Air &&
            id !== BlockId.Water &&
            id !== BlockId.Bedrock
          ) {
            surfaceCtx.biomeKey = biome;
            surfaceCtx.x = wx;
            surfaceCtx.y = wy;
            surfaceCtx.z = wz;
            surfaceCtx.depthFromSurface = depthFromSurface;
            const ruled = applySurfaceRules(this.surfaceRules, surfaceCtx, id);
            if (ruled !== null) {
              id = ruled;
            }
          }

          chunk.setLocal(lx, ly, lz, id);
        }
      }
    }

    // Stage 6 (ORES): owner-chunk veins replace deep stone left by stages 3-5.
    this.placeOreVeins(chunk);

    // Stages 7-8 (VEGETATION/STRUCTURES).
    this.placeTrees(chunk);
    this.placeStructures(chunk);
  }

  /** Dense biome-cache index for a world column (pure). */
  private biomeIndex(worldX: number, worldZ: number): number {
    switch (this.getBiomeAt(worldX, worldZ)) {
      case 'forest':
        return BIOME_FOREST;
      case 'desert':
        return BIOME_DESERT;
      case 'taiga':
        return BIOME_TAIGA;
      default:
        return BIOME_PLAINS;
    }
  }

  /**
   * Stage 6 (ORES): stamp this chunk's coal/iron veins. Columns inside the protected
   * spawn radius stay ore-free (matching the previous noise-speck behavior); veins
   * only replace stone, so caves, surface caps, and lava pockets survive intact.
   */
  private placeOreVeins(chunk: Chunk): void {
    const wx0 = chunk.cx * CHUNK_DIMENSIONS.width;
    const wz0 = chunk.cz * CHUNK_DIMENSIONS.depth;
    stampChunkOreVeins(
      this.oreVeins,
      ['overworld/stone_ore_replaceables'],
      chunk.cx,
      chunk.cz,
      this.seed,
      {
        getLocal: (lx, ly, lz) =>
          lx >= 0 && lx < CHUNK_DIMENSIONS.width && ly >= 0 && ly < CHUNK_DIMENSIONS.height && lz >= 0 && lz < CHUNK_DIMENSIONS.depth
            ? chunk.getLocal(lx, ly, lz)
            : null,
        setLocal: (lx, ly, lz, id) => chunk.setLocal(lx, ly, lz, id),
      },
      CHUNK_DIMENSIONS,
      { x: wx0, z: wz0 },
      (wx, wz) => Math.hypot(wx, wz) > SPAWN_PLAINS_RADIUS * 0.66,
    );
  }

  /**
   * Place structure template blocks (101). Deterministic per seed: the structure generator
   * resolves every start whose footprint intersects this chunk and returns world-coordinate
   * blocks; structures overwrite terrain (no air gate, unlike trees).
   */
  private placeStructures(chunk: Chunk): void {
    const wx0 = chunk.cx * CHUNK_DIMENSIONS.width;
    const wy0 = chunk.cy * CHUNK_DIMENSIONS.height;
    const wz0 = chunk.cz * CHUNK_DIMENSIONS.depth;
    const blocks = this.structures.blocksForChunk(chunk.cx, chunk.cz, {
      biomeKey: (x, z) => this.getBiomeAt(x, z),
      surfaceY: (x, z) => this.getHeightAt(x, z),
    });
    for (const block of blocks) {
      const ly = block.y - wy0;
      if (ly < 0 || ly >= CHUNK_DIMENSIONS.height) {
        continue;
      }
      chunk.setLocal(block.x - wx0, ly, block.z - wz0, block.blockId);
    }
  }

  /** Rare deep lava pockets give caves a dangerous lower layer. */
  private isLavaAt(worldX: number, worldY: number, worldZ: number, surfaceHeight: number): boolean {
    if (
      Math.hypot(worldX, worldZ) <= SPAWN_PLAINS_RADIUS * 0.66 ||
      worldY < CONFIG.bedrockY + 2 ||
      worldY > 8 ||
      worldY >= surfaceHeight - 4
    ) {
      return false;
    }
    return valueNoise3(
      worldX * 0.21,
      worldY * 0.26,
      worldZ * 0.21,
      this.seed + 53011,
    ) > 0.94;
  }

  /**
   * Build the deterministic tree spec for a column, or null if it is not a
   * tree location. Pure function of (worldX, worldZ, seed); returns the PRNG
   * positioned right after the density draw, so the caller's next draw is the
   * tree height draw (unchanged stream).
   */
  private treeSpec(ax: number, az: number): { rng: PRNG } | null {
    const biome = this.getBiomeAt(ax, az);
    if (biome === 'desert') {
      return null;
    }
    const rng = new PRNG(hash2(ax, az, this.seed));
    const density = biome === 'forest' ? TREE_DENSITY * 2.2 : biome === 'taiga' ? TREE_DENSITY * 1.5 : TREE_DENSITY;
    if (rng.next() >= density) {
      return null;
    }
    return { rng };
  }

  /**
   * Place trees via the tree feature system (097). Trunks live in their anchor
   * column, so they never cross chunk borders. Canopy blocks are written by
   * iterating over every anchor column whose canopy could reach this chunk;
   * because this depends only on world coordinates and the seed, neighboring
   * chunks compute the identical blocks, so there is no duplication and no
   * clipping. The per-column rng stream (density draw, then height draw) is
   * unchanged from the former hard-coded trees, so world output is identical.
   */
  private placeTrees(chunk: Chunk): void {
    const wx0 = chunk.cx * CHUNK_DIMENSIONS.width;
    const wy0 = chunk.cy * CHUNK_DIMENSIONS.height;
    const wz0 = chunk.cz * CHUNK_DIMENSIONS.depth;
    const half = this.treeConfig.foliage.radius;

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

        const blocks = buildTreeBlocks(this.treeConfig, { nextFloat: () => spec.rng.next() });
        const baseY = surface;
        for (const block of blocks) {
          const wx = ax + block.dx;
          const wy = baseY + block.dy;
          const wz = az + block.dz;
          const ly = wy - wy0;
          if (ly < 0 || ly >= CHUNK_DIMENSIONS.height) {
            continue;
          }
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
            chunk.setLocal(lx, ly, lz, block.blockId);
          }
        }
      }
    }
  }
}
