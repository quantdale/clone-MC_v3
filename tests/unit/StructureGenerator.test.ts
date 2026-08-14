import { describe, it, expect } from 'vitest';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import {
  StructureGenerator,
  createDefaultStructureGenerator,
  createDefaultStructurePlacements,
  createDefaultStructureTemplates,
} from '../../src/worldgen/StructureGenerator';
import {
  StructurePlacementRegistry,
  type StructurePlacementConfig,
  type StructurePlacementContext,
} from '../../src/worldgen/StructurePlacement';
import { StructureTemplateRegistry } from '../../src/worldgen/StructureTemplate';

function context(biomeKey: (x: number, z: number) => string = () => 'plains', surfaceY: (x: number, z: number) => number = () => 40): StructurePlacementContext {
  return { biomeKey, surfaceY };
}

// Known placement vectors from 100: spacing 8, separation 3, salt 12345, seed 42 ->
// region (0,0) start chunk (3,0) with rotation 180.
function knownConfig(key: string, templateKey: string): StructurePlacementConfig {
  return { key, templateKey, spacing: 8, separation: 3, salt: 12345, biomeKeys: ['plains'], minSurfaceHeight: 33 };
}

describe('defaults', () => {
  it('registers exactly the documented ruined well template deterministically', () => {
    const a = createDefaultStructureTemplates();
    const b = createDefaultStructureTemplates();
    expect(a.size).toBe(1);
    const well = a.get('overworld/ruined_well')!;
    expect(well.size).toEqual({ width: 5, height: 3, depth: 5 });
    expect(well.blocks.length).toBe(56);
    expect(well.blocks.every((bl) => bl.blockId === 16)).toBe(true);
    // y=0 ring is full except the hollow center; y=1/2 are outer rings only.
    expect(well.blocks.some((bl) => bl.x === 0 && bl.y === 0 && bl.z === 0)).toBe(true);
    expect(well.blocks.some((bl) => bl.x === 4 && bl.y === 2 && bl.z === 4)).toBe(true);
    expect(well.blocks.some((bl) => bl.x === 2 && bl.y === 0 && bl.z === 2)).toBe(false);
    expect(well.blocks.some((bl) => bl.x === 2 && bl.y === 1 && bl.z === 2)).toBe(false);
    expect(a.get('overworld/ruined_well')).toEqual(b.get('overworld/ruined_well'));
  });

  it('registers exactly the documented placement config deterministically', () => {
    const a = createDefaultStructurePlacements();
    const b = createDefaultStructurePlacements();
    expect(a.size).toBe(1);
    expect(a.get('overworld/ruined_well')).toEqual({
      key: 'overworld/ruined_well',
      templateKey: 'overworld/ruined_well',
      spacing: 12,
      separation: 4,
      salt: 40101,
      biomeKeys: ['plains', 'forest', 'taiga'],
      minSurfaceHeight: 33,
    });
    expect(a.get('overworld/ruined_well')).toEqual(b.get('overworld/ruined_well'));
  });

  it('constructs the default generator with maxExtent 5', () => {
    const gen = createDefaultStructureGenerator(1234);
    expect(gen.maxExtent).toBe(5);
  });
});

describe('StructureGenerator construction', () => {
  it('fails fast when a placement references a missing template', () => {
    const templates = createDefaultStructureTemplates();
    const placements = new StructurePlacementRegistry();
    placements.register(knownConfig('x', 'missing/template'));
    expect(() => new StructureGenerator({ templates, placements, seed: 1 })).toThrow(/missing template/i);
  });
});

describe('StructureGenerator', () => {
  const seed = 42;

  it('startAt returns the start for the exact start chunk', () => {
    const templates = createDefaultStructureTemplates();
    const placements = new StructurePlacementRegistry();
    placements.register(knownConfig('overworld/ruined_well', 'overworld/ruined_well'));
    const gen = new StructureGenerator({ templates, placements, seed });
    // Known vector: region (0,0) -> start chunk (3,0), rotation 180.
    expect(gen.startAt(3, 0, context())).toEqual([
      {
        configKey: 'overworld/ruined_well',
        templateKey: 'overworld/ruined_well',
        chunkX: 3,
        chunkZ: 0,
        rotation: 180,
        mirror: 'none',
      },
    ]);
    expect(gen.startAt(4, 0, context())).toEqual([]);
  });

  it('default generator finds its start via startAt (seeded)', () => {
    const gen = createDefaultStructureGenerator(seed);
    let found: boolean = false;
    for (let cx = 0; cx < 24 && !found; cx++) {
      for (let cz = 0; cz < 24 && !found; cz++) {
        if (gen.startAt(cx, cz, context()).length > 0) {
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('blocksForChunk returns the rotated well at world coordinates', () => {
    const templates = createDefaultStructureTemplates();
    const placements = new StructurePlacementRegistry();
    placements.register(knownConfig('overworld/ruined_well', 'overworld/ruined_well'));
    const gen = new StructureGenerator({ templates, placements, seed });

    // Region (0,0) start (3,0) rotation 180: template (x,y,z) -> (4-x, y, 4-z).
    const blocks = gen.blocksForChunk(3, 0, context());
    expect(blocks.length).toBe(56);
    expect(blocks.every((b) => b.x >= 48 && b.x < 64 && b.z >= 0 && b.z < 16)).toBe(true);
    // Template (0,0,0) -> rotated (4,0,4) -> world (52, 40, 4).
    expect(blocks).toContainEqual({ x: 52, y: 40, z: 4, blockId: 16 });
    // Template (4,2,4) -> rotated (0,2,0) -> world (48, 42, 0).
    expect(blocks).toContainEqual({ x: 48, y: 42, z: 0, blockId: 16 });
    // The hollow center stays empty: world (50, 40, 2).
    expect(blocks.some((b) => b.x === 50 && b.y === 40 && b.z === 2)).toBe(false);
  });

  it('slices structures spanning into neighboring chunks', () => {
    const templates = new StructureTemplateRegistry();
    const wideBlocks = [];
    for (let x = 0; x < 20; x++) {
      wideBlocks.push({ x, y: 0, z: 0, blockId: 7 });
    }
    templates.register({ key: 'wide', size: { width: 20, height: 1, depth: 1 }, blocks: wideBlocks, entities: [], connectors: [] });
    const placements = new StructurePlacementRegistry();
    placements.register(knownConfig('wide', 'wide'));
    const gen = new StructureGenerator({ templates, placements, seed });

    const startBlocks = gen.blocksForChunk(3, 0, context());
    expect(startBlocks.length).toBe(16); // footprint [48, 64): blocks 16..19 of the rotated span
    const nextBlocks = gen.blocksForChunk(4, 0, context());
    expect(nextBlocks.length).toBe(4); // x in [64, 68)
    // Rotation 180 flips x: template x=0 lands at world 67, template x=3 at world 64.
    expect(nextBlocks[0]).toEqual({ x: 67, y: 40, z: 0, blockId: 7 });
    expect(nextBlocks[nextBlocks.length - 1]).toEqual({ x: 64, y: 40, z: 0, blockId: 7 });
  });

  it('later placements overwrite earlier ones at overlapping cells', () => {
    const templates = new StructureTemplateRegistry();
    templates.register({ key: 'a', size: { width: 1, height: 1, depth: 1 }, blocks: [{ x: 0, y: 0, z: 0, blockId: 1 }], entities: [], connectors: [] });
    templates.register({ key: 'b', size: { width: 1, height: 1, depth: 1 }, blocks: [{ x: 0, y: 0, z: 0, blockId: 2 }], entities: [], connectors: [] });
    const placements = new StructurePlacementRegistry();
    placements.register(knownConfig('pa', 'a'));
    placements.register(knownConfig('pb', 'b'));
    const gen = new StructureGenerator({ templates, placements, seed });

    const blocks = gen.blocksForChunk(3, 0, context());
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toEqual({ x: 48, y: 40, z: 0, blockId: 1 });
    expect(blocks[blocks.length - 1]).toEqual({ x: 48, y: 40, z: 0, blockId: 2 });
  });

  it('is deterministic for identical inputs', () => {
    const gen = createDefaultStructureGenerator(seed);
    const a = gen.blocksForChunk(3, 0, context());
    const b = gen.blocksForChunk(3, 0, context());
    expect(b).toEqual(a);
  });
});

describe('TerrainGenerator integration (end-to-end)', () => {
  it('generates the ruined well at a computed start', () => {
    const registry = createDefaultBlockRegistry();
    const gen = new TerrainGenerator(registry, 1234);
    const structures = createDefaultStructureGenerator(1234);
    const ctx: StructurePlacementContext = {
      biomeKey: (x, z) => gen.getBiomeAt(x, z),
      surfaceY: (x, z) => gen.getHeightAt(x, z),
    };

    let found = false;
    for (let cx = 0; cx < 48 && !found; cx++) {
      for (let cz = 0; cz < 48 && !found; cz++) {
        const starts = structures.startAt(cx, cz, ctx);
        if (starts.length === 0) {
          continue;
        }
        const start = starts[0]!;
        const originY = ctx.surfaceY(start.chunkX * 16 + 8, start.chunkZ * 16 + 8);
        // Rotate template corner (0,0,0) by the start's rotation to get the world corner.
        const corner = (() => {
          switch (start.rotation) {
            case 90:
              return { x: 4, y: 0, z: 0 };
            case 180:
              return { x: 4, y: 0, z: 4 };
            case 270:
              return { x: 0, y: 0, z: 4 };
            default:
              return { x: 0, y: 0, z: 0 };
          }
        })();
        const chunk = new Chunk(start.chunkX, 0, start.chunkZ);
        gen.generateChunk(chunk);
        const lx = start.chunkX * 16 + corner.x - start.chunkX * 16;
        const lz = start.chunkZ * 16 + corner.z - start.chunkZ * 16;
        expect(chunk.getLocal(lx, originY + corner.y - 0, lz)).toBe(BlockId.Cobblestone);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});
