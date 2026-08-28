/**
 * Structure generator (101): the first end-to-end structure placement. A `StructureGenerator`
 * composes the 099 template registry, the 100 placement registry, and a world seed into
 * deterministic per-chunk structure blocks. `blocksForChunk` queries every start chunk within
 * `±ceil(maxExtent / 16)` of the queried chunk (placements in registration order), applies the
 * start's transform to its template, maps blocks to world coordinates (origin Y = the surface
 * at the start center), and keeps the ones inside the chunk's 16x16 footprint. Later
 * placements overwrite earlier ones on overlap. `createDefaultStructureTemplates`/
 * `createDefaultStructurePlacements`/`createDefaultStructureGenerator` provide the documented
 * default structure: the dry ruined well.
 */

import { applyStructureTransform, StructureTemplateRegistry, type StructureBlock } from './StructureTemplate';
import {
  StructurePlacementRegistry,
  structureStartAtChunk,
  type StructurePlacementConfig,
  type StructurePlacementContext,
  type StructureStart,
} from './StructurePlacement';

/** Options for a structure generator. */
export interface StructureGeneratorOptions {
  templates: StructureTemplateRegistry;
  placements: StructurePlacementRegistry;
  seed: number;
}

/** A world-coordinate structure block within a chunk's 16x16 footprint. */
export interface StructureWorldBlock {
  x: number;
  y: number;
  z: number;
  blockId: number;
}

/**
 * Deterministic structure placement. Construction fails fast when a placement config
 * references a template that is not registered.
 */
export class StructureGenerator {
  private readonly templates: StructureTemplateRegistry;
  private readonly placements: StructurePlacementRegistry;
  private readonly seed: number;
  private readonly maxExtentValue: number;

  constructor(options: StructureGeneratorOptions) {
    this.templates = options.templates;
    this.placements = options.placements;
    this.seed = options.seed >>> 0;
    let maxExtent = 0;
    for (const template of this.templates.all()) {
      maxExtent = Math.max(maxExtent, template.size.width, template.size.height, template.size.depth);
    }
    this.maxExtentValue = maxExtent;
    for (const config of this.placements.all()) {
      if (!this.templates.has(config.templateKey)) {
        throw new Error(`StructureGenerator: placement ${config.key} references missing template ${config.templateKey}`);
      }
    }
  }

  /** The maximum template extent across the registry (0 when empty). */
  get maxExtent(): number {
    return this.maxExtentValue;
  }

  /** All starts whose start chunk is exactly the queried chunk (gates applied), in placement order. */
  startAt(chunkX: number, chunkZ: number, ctx: StructurePlacementContext): StructureStart[] {
    const starts: StructureStart[] = [];
    for (const config of this.placements.all()) {
      const start = structureStartAtChunk(config, ctx, chunkX, chunkZ, this.seed);
      if (start !== null) {
        starts.push(start);
      }
    }
    return starts;
  }

  /**
   * All structure blocks (world coordinates, this chunk's 16x16 footprint) for every start
   * whose footprint intersects the chunk. Placements in registration order; later placements
   * overwrite earlier on overlap.
   */
  blocksForChunk(chunkX: number, chunkZ: number, ctx: StructurePlacementContext): StructureWorldBlock[] {
    const out: StructureWorldBlock[] = [];
    const reach = Math.ceil(this.maxExtent / 16);
    const minX = chunkX * 16;
    const minZ = chunkZ * 16;
    for (const config of this.placements.all()) {
      const template = this.templates.get(config.templateKey);
      if (template === null) {
        continue; // unreachable after construction; defensive
      }
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
          const start = structureStartAtChunk(config, ctx, chunkX + dx, chunkZ + dz, this.seed);
          if (start === null) {
            continue;
          }
          const transformed = applyStructureTransform(template, { rotation: start.rotation, mirror: start.mirror });
          const originY = ctx.surfaceY(start.chunkX * 16 + 8, start.chunkZ * 16 + 8);
          for (const b of transformed.blocks) {
            const wx = start.chunkX * 16 + b.x;
            const wz = start.chunkZ * 16 + b.z;
            if (wx < minX || wx >= minX + 16 || wz < minZ || wz >= minZ + 16) {
              continue;
            }
            out.push({ x: wx, y: originY + b.y, z: wz, blockId: b.blockId });
          }
        }
      }
    }
    return out;
  }
}

/**
 * Documented default structure templates: the dry ruined well (5x5x3 cobblestone ring with a
 * hollow center; dry by design so water never appears above sea level). Block id 16 is
 * cobblestone per `src/world/BlockRegistry.ts`.
 */
export function createDefaultStructureTemplates(): StructureTemplateRegistry {
  const registry = new StructureTemplateRegistry();
  const blocks: StructureBlock[] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        const ring = x === 0 || x === 4 || z === 0 || z === 4;
        if (y === 0) {
          if (!(x === 2 && z === 2)) {
            blocks.push({ x, y, z, blockId: 16 });
          }
        } else if (ring) {
          blocks.push({ x, y, z, blockId: 16 });
        }
      }
    }
  }
  registry.register({
    key: 'overworld/ruined_well',
    size: { width: 5, height: 3, depth: 5 },
    blocks,
    entities: [],
    connectors: [],
  });
  return registry;
}

/**
 * Documented default structure placements: the ruined well (spacing 12, separation 4, salt
 * 40101, plains/forest/taiga only, surface at least 33 — just above sea level 32).
 */
export function createDefaultStructurePlacements(): StructurePlacementRegistry {
  const registry = new StructurePlacementRegistry();
  const config: StructurePlacementConfig = {
    key: 'overworld/ruined_well',
    templateKey: 'overworld/ruined_well',
    spacing: 12,
    separation: 4,
    salt: 40101,
    biomeKeys: ['plains', 'forest', 'taiga'],
    minSurfaceHeight: 33,
  };
  registry.register(config);
  return registry;
}

/** The default structure generator for a world seed (well template + placement + seed). */
export function createDefaultStructureGenerator(seed: number): StructureGenerator {
  return new StructureGenerator({
    templates: createDefaultStructureTemplates(),
    placements: createDefaultStructurePlacements(),
    seed,
  });
}
