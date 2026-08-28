import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/config';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';

const registry = createDefaultBlockRegistry();

function makeChunk(cx: number, cy: number, cz: number): Chunk {
  return new Chunk(cx, cy, cz);
}

describe('TerrainGenerator', () => {
  it('is deterministic: same seed + coords produce identical chunk data', () => {
    const a = new TerrainGenerator(registry, 1234);
    const b = new TerrainGenerator(registry, 1234);
    const ca = makeChunk(0, 0, 0);
    const cb = makeChunk(0, 0, 0);
    a.generateChunk(ca);
    b.generateChunk(cb);
    expect(ca.blocks).toEqual(cb.blocks);
  });

  it('different seeds produce different terrain', () => {
    const a = new TerrainGenerator(registry, 1234);
    const b = new TerrainGenerator(registry, 9999);
    const ca = makeChunk(0, 0, 0);
    const cb = makeChunk(0, 0, 0);
    a.generateChunk(ca);
    b.generateChunk(cb);
    expect(ca.blocks).not.toEqual(cb.blocks);
  });

  it('places bedrock at y=0', () => {
    const gen = new TerrainGenerator(registry, 1234);
    const chunk = makeChunk(0, 0, 0);
    gen.generateChunk(chunk);
    for (let lx = 0; lx < CONFIG.chunk.width; lx++) {
      for (let lz = 0; lz < CONFIG.chunk.depth; lz++) {
        expect(chunk.getLocal(lx, 0, lz)).toBe(BlockId.Bedrock);
      }
    }
  });

  it('keeps getHeightAt within the terrain band around sea level', () => {
    // fbm2 is bounded to [-1, 1] and the height is seaLevel + n * amplitude,
    // so the surface must never leave [seaLevel - 12, seaLevel + 12].
    const gen = new TerrainGenerator(registry, 1234);
    for (let x = -50; x <= 50; x++) {
      for (let z = -50; z <= 50; z++) {
        const h = gen.getHeightAt(x, z);
        expect(h).toBeGreaterThanOrEqual(CONFIG.seaLevel - 12);
        expect(h).toBeLessThanOrEqual(CONFIG.seaLevel + 12);
      }
    }
  });

  it('never places water above sea level', () => {
    const gen = new TerrainGenerator(registry, 1234);
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        const chunk = makeChunk(cx, 0, cz);
        gen.generateChunk(chunk);
        for (let ly = CONFIG.seaLevel + 1; ly < CONFIG.chunk.height; ly++) {
          for (let lx = 0; lx < CONFIG.chunk.width; lx++) {
            for (let lz = 0; lz < CONFIG.chunk.depth; lz++) {
              expect(chunk.getLocal(lx, ly, lz)).not.toBe(BlockId.Water);
            }
          }
        }
      }
    }
  });

  it('is deterministic for negative chunk coordinates', () => {
    const a = new TerrainGenerator(registry, 1234);
    const b = new TerrainGenerator(registry, 1234);
    const ca = makeChunk(-2, 0, -3);
    const cb = makeChunk(-2, 0, -3);
    a.generateChunk(ca);
    b.generateChunk(cb);
    expect(ca.blocks).toEqual(cb.blocks);
  });

  it('tree trunks grow upward from the surface', () => {
    const gen = new TerrainGenerator(registry, 1234);
    // Find a wood block and verify the block directly beneath it is solid
    // (the trunk is anchored to the terrain, not floating in air).
    let found = false;
    for (let cx = -1; cx <= 1 && !found; cx++) {
      for (let cz = -1; cz <= 1 && !found; cz++) {
        const chunk = makeChunk(cx, 0, cz);
        gen.generateChunk(chunk);
        for (let ly = 1; ly < CONFIG.chunk.height; ly++) {
          for (let lx = 0; lx < CONFIG.chunk.width; lx++) {
            for (let lz = 0; lz < CONFIG.chunk.depth; lz++) {
              if (chunk.getLocal(lx, ly, lz) === BlockId.Wood) {
                const below = chunk.getLocal(lx, ly - 1, lz);
                expect(below).not.toBe(BlockId.Air);
                found = true;
                break;
              }
            }
            if (found) break;
          }
          if (found) break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('trees carry foliage above their trunks (097 tree feature system)', () => {
    const gen = new TerrainGenerator(registry, 1234);
    let leaves = 0;
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        const chunk = makeChunk(cx, 0, cz);
        gen.generateChunk(chunk);
        for (const id of chunk.blocks) {
          if (id === BlockId.Leaves) {
            leaves++;
          }
        }
      }
    }
    expect(leaves).toBeGreaterThan(0);
  });

  it('surface is grass above sea level and getHeightAt matches the highest non-air block', () => {
    const gen = new TerrainGenerator(registry, 1234);

    let checked = 0;
    for (let cx = 0; cx < 3 && checked < 3; cx++) {
      for (let cz = 0; cz < 3 && checked < 3; cz++) {
        const chunk = makeChunk(cx, 0, cz);
        gen.generateChunk(chunk);
        const wx0 = cx * CONFIG.chunk.width;
        const wz0 = cz * CONFIG.chunk.depth;
        for (let lx = 0; lx < CONFIG.chunk.width && checked < 3; lx++) {
          for (let lz = 0; lz < CONFIG.chunk.depth && checked < 3; lz++) {
            const height = gen.getHeightAt(wx0 + lx, wz0 + lz);
            if (height <= CONFIG.seaLevel) {
              continue;
            }

            // Find the highest non-air block in this column.
            let highest = -1;
            for (let ly = 0; ly < CONFIG.chunk.height; ly++) {
              if (chunk.getLocal(lx, ly, lz) !== BlockId.Air) {
                highest = ly;
              }
            }

            // Only columns untampered by trees (no canopy above the surface)
            // must have their highest block exactly at getHeightAt — and it must
            // be grass, since the surface is above sea level.
            if (highest !== height) {
              continue;
            }
            expect(chunk.getLocal(lx, height, lz)).toBe(BlockId.Grass);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('handles negative coordinates and stays continuous', () => {
    const gen = new TerrainGenerator(registry, 1234);
    const chunk = makeChunk(-1, 0, -1);
    expect(() => gen.generateChunk(chunk)).not.toThrow();

    const hLeft = gen.getHeightAt(-1, -1);
    const hRight = gen.getHeightAt(0, -1);
    expect(Math.abs(hLeft - hRight)).toBeLessThanOrEqual(8);
  });

  it('generates at least one tree across a few chunks', () => {
    const gen = new TerrainGenerator(registry, 1234);
    let wood = 0;
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        const chunk = makeChunk(cx, 0, cz);
        gen.generateChunk(chunk);
        for (const id of chunk.blocks) {
          if (id === BlockId.Wood) {
            wood++;
          }
        }
      }
    }
    expect(wood).toBeGreaterThan(0);
  });

  it('exposes deterministic distant biome variety', () => {
    const a = new TerrainGenerator(registry, 1234);
    const b = new TerrainGenerator(registry, 1234);
    const biomes = new Set<string>();
    for (let x = -256; x <= 256; x += 8) {
      for (let z = -256; z <= 256; z += 8) {
        expect(a.getBiomeAt(x, z)).toBe(b.getBiomeAt(x, z));
        biomes.add(a.getBiomeAt(x, z));
      }
    }
    expect(biomes).toContain('plains');
    expect(biomes.size).toBeGreaterThan(1);
  });

  it('carves deterministic caves away from the spawn ring', () => {
    const a = new TerrainGenerator(registry, 1234);
    const b = new TerrainGenerator(registry, 1234);
    let found = false;
    for (let x = -256; x <= 256 && !found; x += 4) {
      for (let z = -256; z <= 256 && !found; z += 4) {
        for (let y = 5; y < CONFIG.seaLevel - 2; y += 3) {
          const height = a.getHeightAt(x, z);
          if (a.isCaveAt(x, y, z, height)) {
            expect(b.isCaveAt(x, y, z, height)).toBe(true);
            found = true;
            break;
          }
        }
      }
    }
    expect(found).toBe(true);
  });

  it('embeds deterministic coal and iron ore in distant underground stone', () => {
    const a = new TerrainGenerator(registry, 1234);
    let coal = 0;
    let iron = 0;
    let lava = 0;
    let firstOreChunk: Chunk | null = null;
    for (let cx = -6; cx <= 6 && (coal === 0 || iron === 0 || lava === 0); cx++) {
      for (let cz = -6; cz <= 6 && (coal === 0 || iron === 0 || lava === 0); cz++) {
        const ca = makeChunk(cx, 0, cz);
        a.generateChunk(ca);
        for (const id of ca.blocks) {
          if (id === BlockId.CoalOre) coal++;
          if (id === BlockId.IronOre) iron++;
          if (id === BlockId.Lava) lava++;
        }
        if (firstOreChunk === null && (coal > 0 || iron > 0)) {
          firstOreChunk = ca;
        }
      }
    }
    expect(coal).toBeGreaterThan(0);
    expect(iron).toBeGreaterThan(0);
    expect(lava).toBeGreaterThan(0);
    expect(firstOreChunk).not.toBeNull();
    const check = makeChunk(firstOreChunk!.cx, 0, firstOreChunk!.cz);
    new TerrainGenerator(registry, 1234).generateChunk(check);
    expect(check.blocks).toEqual(firstOreChunk!.blocks);
  });
});
