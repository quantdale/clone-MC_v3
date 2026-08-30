import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { NETHER_DIMENSION_TYPE, OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { TERRAIN_GENERATION_VERSION, TerrainGenerator } from '../../src/world/TerrainGenerator';
import {
  LOD_TILE_PROTOCOL_VERSION,
  LOD_TILE_SAMPLE_COUNT,
  createTerrainLodSamplingSource,
  lodTileBlockSpan,
  lodTileKey,
  sampleLodTile,
  validateLodTileData,
  validateLodTileIdentity,
  type LodSamplingSource,
} from '../../src/rendering/LodTile';

const dimensionId = createResourceId('minecraft', 'overworld');

function identity(lod: 1 | 2 | 3, tileX = 0, tileZ = 0) {
  return {
    dimensionId,
    seed: 42,
    generationVersion: 'v2',
    lod,
    tileX,
    tileZ,
  };
}

function source(): LodSamplingSource {
  return {
    seed: 42,
    generationVersion: 'v2',
    sampleColumn(worldX, worldZ) {
      return {
        height: OVERWORLD_DIMENSION_TYPE.minY + ((worldX * 31 + worldZ * 17) % 96 + 96) % 96,
        material: Math.abs(worldX + worldZ) % 64,
        biome: Math.abs(worldX * 3 + worldZ) % 4,
      };
    },
  };
}

describe('LodTile contracts and deterministic sampling', () => {
  it('canonicalizes seed identity and produces a stable ownership key', () => {
    const normalized = validateLodTileIdentity({ ...identity(1), seed: -1 });
    expect(normalized.seed).toBe(0xffffffff);
    expect(lodTileKey(identity(1, -2, 3))).toBe('minecraft:overworld|42|v2|1|-2|3');
    expect(lodTileKey({ ...identity(1), dimensionId: { namespace: 'minecraft', path: 'overworld' } })).toBe(
      lodTileKey(identity(1)),
    );
  });

  it('uses deterministic level strides and negative-coordinate tile origins', () => {
    expect(lodTileBlockSpan(1)).toBe(32);
    expect(lodTileBlockSpan(2)).toBe(64);
    expect(lodTileBlockSpan(3)).toBe(128);

    const samples: Array<[number, number]> = [];
    const recording: LodSamplingSource = {
      ...source(),
      sampleColumn(worldX, worldZ) {
        samples.push([worldX, worldZ]);
        return { height: 0, material: 1, biome: 0 };
      },
    };
    const tile = sampleLodTile(identity(2, -1, -2), OVERWORLD_DIMENSION_TYPE, recording);
    expect(tile.originX).toBe(-64);
    expect(tile.originZ).toBe(-128);
    expect(samples.slice(0, 3)).toEqual([
      [-62, -126],
      [-58, -126],
      [-54, -126],
    ]);
    expect(samples.at(-1)).toEqual([-2, -66]);
  });

  it('produces byte-equivalent typed data for repeated sampling at every level', () => {
    for (const lod of [1, 2, 3] as const) {
      const first = sampleLodTile(identity(lod, 7, -5), OVERWORLD_DIMENSION_TYPE, source());
      const second = sampleLodTile(identity(lod, 7, -5), OVERWORLD_DIMENSION_TYPE, source());
      expect(first).toMatchObject({
        protocolVersion: LOD_TILE_PROTOCOL_VERSION,
        sampleCount: LOD_TILE_SAMPLE_COUNT,
        sampleStride: lod === 1 ? 2 : lod === 2 ? 4 : 8,
        lod,
      });
      expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
      expect(Array.from(first.materials)).toEqual(Array.from(second.materials));
      if (first.lod === 1 && second.lod === 1) {
        expect(Array.from(first.occupancy)).toEqual(Array.from(second.occupancy));
      } else if (first.lod !== 1 && second.lod !== 1) {
        expect(Array.from(first.biomes)).toEqual(Array.from(second.biomes));
      }
      expect(validateLodTileData(first)).toBe(first);
    }
  });

  it('binds the production terrain generator without exposing canonical storage', () => {
    const generator = new TerrainGenerator(createDefaultBlockRegistry(), 1337);
    const terrainSource = createTerrainLodSamplingSource(generator, 1337, TERRAIN_GENERATION_VERSION);
    const tile = sampleLodTile(
      {
        dimensionId,
        seed: 1337,
        generationVersion: TERRAIN_GENERATION_VERSION,
        lod: 1,
        tileX: 0,
        tileZ: 0,
      },
      OVERWORLD_DIMENSION_TYPE,
      terrainSource,
    );

    expect(tile.materials.some((id) => id === BlockId.Grass || id === BlockId.Water)).toBe(true);
    if (tile.lod !== 1) throw new Error('expected LOD1 tile');
    expect(tile.occupancy.every((value: number) => value === 0 || value === 1)).toBe(true);
    expect(terrainSource).not.toHaveProperty('storage');
  });

  it('marks dimension-floor terrain as occupied and rejects unsafe or forged coordinates', () => {
    const floorSource: LodSamplingSource = {
      seed: 42,
      generationVersion: 'v2',
      sampleColumn: () => ({ height: OVERWORLD_DIMENSION_TYPE.minY, material: 1, biome: 0 }),
    };
    const floorTile = sampleLodTile(identity(1), OVERWORLD_DIMENSION_TYPE, floorSource);
    if (floorTile.lod !== 1) throw new Error('expected LOD1 tile');
    expect(Array.from(floorTile.occupancy).every((value) => value === 1)).toBe(true);
    expect(() => validateLodTileIdentity({ ...identity(3), tileX: Number.MAX_SAFE_INTEGER })).toThrow(
      /safe world-coordinate range/,
    );

    const forged = sampleLodTile(identity(1), OVERWORLD_DIMENSION_TYPE, source());
    if (forged.lod !== 1) throw new Error('expected LOD1 tile');
    forged.occupancy[0] = 2;
    expect(() => validateLodTileData(forged)).toThrow(/occupancy values must be binary/);
  });

  it('rejects identity, source, dimension, version, lod, typed-array, and byte mismatches', () => {
    expect(() => validateLodTileIdentity({ ...identity(1), lod: 0 })).toThrow(/lod/);
    expect(() => sampleLodTile(identity(1), OVERWORLD_DIMENSION_TYPE, { ...source(), seed: 7 })).toThrow(
      /seed does not match/,
    );
    expect(() => sampleLodTile(identity(1), OVERWORLD_DIMENSION_TYPE, { ...source(), generationVersion: 'v1' })).toThrow(
      /generationVersion does not match/,
    );
    expect(() => sampleLodTile(identity(1), NETHER_DIMENSION_TYPE, source())).toThrow(
      /dimensionId/,
    );

    const tile = sampleLodTile(identity(1), OVERWORLD_DIMENSION_TYPE, source());
    const wrongLod: unknown = { ...tile, lod: 2 };
    expect(() => validateLodTileData(wrongLod)).toThrow(/does not match identity/);
    const wrongVersion: unknown = { ...tile, protocolVersion: 99 };
    expect(() => validateLodTileData(wrongVersion)).toThrow(/protocolVersion/);
    const wrongBytes: unknown = { ...tile, byteLength: tile.byteLength + 1 };
    expect(() => validateLodTileData(wrongBytes)).toThrow(/byteLength/);
    const wrongArray: unknown = { ...tile, heights: new Uint16Array(tile.heights.length) };
    expect(() => validateLodTileData(wrongArray)).toThrow(/heights/);
    const macroTile = sampleLodTile(identity(2), OVERWORLD_DIMENSION_TYPE, source());
    expect(() => validateLodTileData({ ...macroTile, biomes: undefined })).toThrow(/biomes/);
  });
});
