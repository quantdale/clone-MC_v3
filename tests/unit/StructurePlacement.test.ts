import { describe, it, expect } from 'vitest';
import {
  StructurePlacementRegistry,
  structureStartAtChunk,
  validateStructurePlacementConfig,
  type StructurePlacementConfig,
  type StructurePlacementContext,
  type StructureStart,
} from '../../src/worldgen/StructurePlacement';

const config: StructurePlacementConfig = {
  key: 'overworld/well',
  templateKey: 'well',
  spacing: 8,
  separation: 3,
  salt: 12345,
  biomeKeys: ['plains'],
  minSurfaceHeight: 62,
};

function context(biomeKey: (x: number, z: number) => string = () => 'plains', surfaceY: (x: number, z: number) => number = () => 70): StructurePlacementContext {
  return { biomeKey, surfaceY };
}

describe('validateStructurePlacementConfig', () => {
  it('accepts a valid config', () => {
    expect(validateStructurePlacementConfig(config)).toEqual(config);
  });

  it('rejects malformed configs naming the field', () => {
    expect(() => validateStructurePlacementConfig({ ...config, key: '' })).toThrow(/key/i);
    expect(() => validateStructurePlacementConfig({ ...config, templateKey: '' })).toThrow(/templateKey/i);
    expect(() => validateStructurePlacementConfig({ ...config, spacing: 0 })).toThrow(/spacing/i);
    expect(() => validateStructurePlacementConfig({ ...config, spacing: -4 })).toThrow(/spacing/i);
    expect(() => validateStructurePlacementConfig({ ...config, spacing: 4.5 })).toThrow(/spacing/i);
    expect(() => validateStructurePlacementConfig({ ...config, separation: -1 })).toThrow(/separation/i);
    expect(() => validateStructurePlacementConfig({ ...config, separation: 8 })).toThrow(/separation/i);
    expect(() => validateStructurePlacementConfig({ ...config, separation: 2.5 })).toThrow(/separation/i);
    expect(() => validateStructurePlacementConfig({ ...config, salt: -1 })).toThrow(/salt/i);
    expect(() => validateStructurePlacementConfig({ ...config, salt: 1.5 })).toThrow(/salt/i);
    expect(() => validateStructurePlacementConfig({ ...config, biomeKeys: [] })).toThrow(/biomeKeys/i);
    expect(() => validateStructurePlacementConfig({ ...config, biomeKeys: [''] })).toThrow(/biomeKeys/i);
    expect(() => validateStructurePlacementConfig({ ...config, biomeKeys: [3] })).toThrow(/biomeKeys/i);
    expect(() => validateStructurePlacementConfig({ ...config, minSurfaceHeight: 1.5 })).toThrow(/minSurfaceHeight/i);
    expect(() => validateStructurePlacementConfig(null)).toThrow(/object/i);
  });
});

describe('structureStartAtChunk', () => {
  const seed = 42;

  it('is deterministic for identical inputs', () => {
    const a = structureStartAtChunk(config, context(), 3, 0, seed);
    const b = structureStartAtChunk(config, context(), 3, 0, seed);
    expect(b).toEqual(a);
  });

  it('matches the exact documented vectors for known regions', () => {
    expect(structureStartAtChunk(config, context(), 3, 0, seed)).toEqual({
      configKey: 'overworld/well',
      templateKey: 'well',
      chunkX: 3,
      chunkZ: 0,
      rotation: 180,
      mirror: 'none',
    });
    expect(structureStartAtChunk(config, context(), 8, 2, seed)).toEqual({
      configKey: 'overworld/well',
      templateKey: 'well',
      chunkX: 8,
      chunkZ: 2,
      rotation: 90,
      mirror: 'none',
    });
    expect(structureStartAtChunk(config, context(), -4, -8, seed)).toEqual({
      configKey: 'overworld/well',
      templateKey: 'well',
      chunkX: -4,
      chunkZ: -8,
      rotation: 270,
      mirror: 'none',
    });
    expect(structureStartAtChunk(config, context(), 19, 28, seed)).toEqual({
      configKey: 'overworld/well',
      templateKey: 'well',
      chunkX: 19,
      chunkZ: 28,
      rotation: 0,
      mirror: 'none',
    });
  });

  it('places starts only at the start chunk of each region, with offsets in range', () => {
    for (let regionX = -3; regionX <= 3; regionX++) {
      for (let regionZ = -3; regionZ <= 3; regionZ++) {
        let found: StructureStart | null = null;
        for (let cx = regionX * 8; cx < regionX * 8 + 8; cx++) {
          for (let cz = regionZ * 8; cz < regionZ * 8 + 8; cz++) {
            const start = structureStartAtChunk(config, context(), cx, cz, seed);
            if (start !== null) {
              expect(found).toBeNull(); // exactly one start per region
              found = start;
              expect(cx).toBe(start.chunkX);
              expect(cz).toBe(start.chunkZ);
              expect(start.chunkX).toBeGreaterThanOrEqual(regionX * 8);
              expect(start.chunkX).toBeLessThan(regionX * 8 + 5);
              expect(start.chunkZ).toBeGreaterThanOrEqual(regionZ * 8);
              expect(start.chunkZ).toBeLessThan(regionZ * 8 + 5);
              expect(start.rotation % 90).toBe(0);
              expect(start.mirror).toBe('none');
            }
          }
        }
        expect(found).not.toBeNull();
      }
    }
  });

  it('keeps adjacent region starts at least separation chunks apart', () => {
    const starts: Array<[number, number]> = [];
    for (let regionX = 0; regionX < 6; regionX++) {
      let found: StructureStart | null = null;
      for (let cx = regionX * 8; cx < regionX * 8 + 8; cx++) {
        for (let cz = 0; cz < 8; cz++) {
          const start = structureStartAtChunk(config, context(), cx, cz, seed);
          if (start !== null) {
            found = start;
          }
        }
      }
      expect(found).not.toBeNull();
      starts.push([found!.chunkX, found!.chunkZ]);
    }
    for (let i = 1; i < starts.length; i++) {
      expect(Math.abs(starts[i]![0] - starts[i - 1]![0])).toBeGreaterThanOrEqual(3);
    }
  });

  it('enforces the biome gate at the start chunk center', () => {
    const centerX = 3 * 16 + 8;
    const centerZ = 0 * 16 + 8;
    const keys: string[] = [];
    const ctx: StructurePlacementContext = {
      biomeKey: (x, z) => {
        keys.push(`${x},${z}`);
        return x === centerX && z === centerZ ? 'plains' : 'desert';
      },
      surfaceY: () => 70,
    };
    expect(structureStartAtChunk(config, ctx, 3, 0, seed)).not.toBeNull();
    expect(keys).toEqual([`${centerX},${centerZ}`]);

    const desert = context(() => 'desert');
    expect(structureStartAtChunk(config, desert, 3, 0, seed)).toBeNull();
  });

  it('enforces the terrain gate at the start chunk center', () => {
    expect(structureStartAtChunk(config, context(() => 'plains', () => 61), 3, 0, seed)).toBeNull();
    expect(structureStartAtChunk(config, context(() => 'plains', () => 62), 3, 0, seed)).not.toBeNull();
    expect(structureStartAtChunk(config, context(() => 'plains', () => 100), 3, 0, seed)).not.toBeNull();
  });

  it('returns null for chunks that are not start chunks', () => {
    expect(structureStartAtChunk(config, context(), 4, 0, seed)).toBeNull();
    expect(structureStartAtChunk(config, context(), 3, 1, seed)).toBeNull();
  });
});

describe('StructurePlacementRegistry', () => {
  it('registers, gets, checks, sizes, and clears', () => {
    const registry = new StructurePlacementRegistry();
    registry.register(config);
    expect(registry.get('overworld/well')).toEqual(config);
    expect(registry.has('overworld/well')).toBe(true);
    expect(registry.has('missing')).toBe(false);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('overworld/well')).toBeNull();
  });

  it('rejects duplicates and invalid configs atomically', () => {
    const registry = new StructurePlacementRegistry();
    registry.register(config);

    expect(() => registry.register(config)).toThrow(/duplicate/i);
    expect(() => registry.register({ ...config, key: 'x', spacing: 0 })).toThrow(/spacing/i);
    expect(registry.size).toBe(1);
    expect(registry.has('x')).toBe(false);
  });
});
