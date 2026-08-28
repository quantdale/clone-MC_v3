import { describe, it, expect } from 'vitest';
import {
  lightLevelAt,
  isValidSpawnDistance,
  isValidSpawnBiome,
  isValidSpawnLight,
  isValidSpawnBlock,
  canSpawn,
  MONSTER_MAX_LIGHT,
  CREATURE_MIN_LIGHT,
  MIN_SPAWN_DISTANCE,
  MAX_SPAWN_DISTANCE,
  type SpawnWorld,
} from '../../src/simulation/MobSpawnRules';
import { BlockId } from '../../src/world/BlockRegistry';
import { VoxelShape } from '../../src/world/VoxelShape';
import { createResourceId } from '../../src/data/ResourceId';
import type { BiomeTypeDefinition } from '../../src/data/Biome';
import type { EntityCategory } from '../../src/data/EntityType';

class FakeSpawnWorld implements SpawnWorld {
  private readonly blocks = new Map<string, number>();
  private readonly skyLight = new Map<string, number>();
  private readonly blockLight = new Map<string, number>();

  private static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    this.blocks.set(FakeSpawnWorld.key(x, y, z), id);
  }

  setLight(x: number, y: number, z: number, sky: number, block: number): void {
    this.skyLight.set(FakeSpawnWorld.key(x, y, z), sky);
    this.blockLight.set(FakeSpawnWorld.key(x, y, z), block);
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.blocks.get(FakeSpawnWorld.key(x, y, z)) ?? BlockId.Air;
  }

  getCollisionShape(x: number, y: number, z: number): VoxelShape {
    return this.getBlockId(x, y, z) === BlockId.Stone ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
  }

  getSkyLight(x: number, y: number, z: number): number {
    return this.skyLight.get(FakeSpawnWorld.key(x, y, z)) ?? 0;
  }

  getBlockLight(x: number, y: number, z: number): number {
    return this.blockLight.get(FakeSpawnWorld.key(x, y, z)) ?? 0;
  }
}

function makeBiome(category: BiomeTypeDefinition['category']): BiomeTypeDefinition {
  return {
    id: createResourceId('minecraft', `biome/test_${category.toLowerCase()}`),
    key: `test_${category.toLowerCase()}`,
    name: 'Test Biome',
    category,
    temperature: 0.5,
    precipitation: 'RAIN',
    grassColor: 0x00ff00,
    foliageColor: 0x00aa00,
  };
}

const OCEAN = makeBiome('OCEAN');
const PLAINS = makeBiome('PLAINS');

function groundedWorld(x: number, y: number, z: number): FakeSpawnWorld {
  const world = new FakeSpawnWorld();
  world.setBlock(x, y - 1, z, BlockId.Stone);
  world.setBlock(x, y, z, BlockId.Air);
  world.setBlock(x, y + 1, z, BlockId.Air);
  return world;
}

describe('lightLevelAt', () => {
  it('is the max of clamped sky and block light', () => {
    const world = new FakeSpawnWorld();
    world.setLight(0, 0, 0, 4, 10);
    expect(lightLevelAt(world, 0, 0, 0)).toBe(10);
  });

  it('clamps out-of-range values into [0, 15]', () => {
    const world = new FakeSpawnWorld();
    world.setLight(0, 0, 0, -5, 99);
    expect(lightLevelAt(world, 0, 0, 0)).toBe(15);
  });
});

describe('isValidSpawnDistance', () => {
  it('is false below MIN_SPAWN_DISTANCE, true within bounds (inclusive), false above MAX', () => {
    expect(isValidSpawnDistance(MIN_SPAWN_DISTANCE - 1)).toBe(false);
    expect(isValidSpawnDistance(MIN_SPAWN_DISTANCE)).toBe(true);
    expect(isValidSpawnDistance((MIN_SPAWN_DISTANCE + MAX_SPAWN_DISTANCE) / 2)).toBe(true);
    expect(isValidSpawnDistance(MAX_SPAWN_DISTANCE)).toBe(true);
    expect(isValidSpawnDistance(MAX_SPAWN_DISTANCE + 1)).toBe(false);
  });
});

describe('isValidSpawnBiome', () => {
  it('requires a water biome for water categories and a non-water biome for land categories', () => {
    expect(isValidSpawnBiome('WATER_CREATURE', OCEAN)).toBe(true);
    expect(isValidSpawnBiome('WATER_CREATURE', PLAINS)).toBe(false);
    expect(isValidSpawnBiome('MONSTER', PLAINS)).toBe(true);
    expect(isValidSpawnBiome('MONSTER', OCEAN)).toBe(false);
  });

  it('is false for OTHER and PROJECTILE regardless of biome', () => {
    expect(isValidSpawnBiome('OTHER', PLAINS)).toBe(false);
    expect(isValidSpawnBiome('PROJECTILE', OCEAN)).toBe(false);
  });
});

describe('isValidSpawnLight', () => {
  it('monster/ambient require darkness at or below the threshold', () => {
    const dark = new FakeSpawnWorld();
    dark.setLight(0, 0, 0, 0, MONSTER_MAX_LIGHT);
    const bright = new FakeSpawnWorld();
    bright.setLight(0, 0, 0, 0, MONSTER_MAX_LIGHT + 1);

    expect(isValidSpawnLight('MONSTER', dark, 0, 0, 0)).toBe(true);
    expect(isValidSpawnLight('MONSTER', bright, 0, 0, 0)).toBe(false);
    expect(isValidSpawnLight('AMBIENT', dark, 0, 0, 0)).toBe(true);
  });

  it('creature requires brightness at or above the threshold', () => {
    const bright = new FakeSpawnWorld();
    bright.setLight(0, 0, 0, 0, CREATURE_MIN_LIGHT);
    const dim = new FakeSpawnWorld();
    dim.setLight(0, 0, 0, 0, CREATURE_MIN_LIGHT - 1);

    expect(isValidSpawnLight('CREATURE', bright, 0, 0, 0)).toBe(true);
    expect(isValidSpawnLight('CREATURE', dim, 0, 0, 0)).toBe(false);
  });

  it('water categories are light-independent', () => {
    const dark = new FakeSpawnWorld();
    dark.setLight(0, 0, 0, 0, 0);
    expect(isValidSpawnLight('WATER_CREATURE', dark, 0, 0, 0)).toBe(true);
  });

  it('is false for OTHER regardless of light', () => {
    const world = new FakeSpawnWorld();
    world.setLight(0, 0, 0, 0, CREATURE_MIN_LIGHT);
    expect(isValidSpawnLight('OTHER' as EntityCategory, world, 0, 0, 0)).toBe(false);
  });
});

describe('isValidSpawnBlock', () => {
  it('land categories match canStandAt exactly', () => {
    const standable = groundedWorld(0, 5, 0);
    const obstructed = groundedWorld(0, 5, 0);
    obstructed.setBlock(0, 6, 0, BlockId.Stone); // block the second body-height cell

    expect(isValidSpawnBlock('MONSTER', standable, 0, 5, 0)).toBe(true);
    expect(isValidSpawnBlock('MONSTER', obstructed, 0, 5, 0)).toBe(false);
  });

  it('water categories require an actual water block', () => {
    const water = new FakeSpawnWorld();
    water.setBlock(0, 5, 0, BlockId.Water);
    const air = new FakeSpawnWorld();
    air.setBlock(0, 5, 0, BlockId.Air);

    expect(isValidSpawnBlock('WATER_CREATURE', water, 0, 5, 0)).toBe(true);
    expect(isValidSpawnBlock('WATER_CREATURE', air, 0, 5, 0)).toBe(false);
  });

  it('is false for OTHER regardless of block', () => {
    const world = groundedWorld(0, 5, 0);
    expect(isValidSpawnBlock('OTHER' as EntityCategory, world, 0, 5, 0)).toBe(false);
  });
});

describe('canSpawn', () => {
  it('fails when any single predicate fails (light too bright for a monster)', () => {
    const world = groundedWorld(0, 5, 0);
    world.setLight(0, 5, 0, MONSTER_MAX_LIGHT + 5, 0);
    expect(canSpawn('MONSTER', world, PLAINS, 0, 5, 0, MIN_SPAWN_DISTANCE + 10)).toBe(false);
  });

  it('succeeds when all four predicates independently pass', () => {
    const world = groundedWorld(0, 5, 0);
    world.setLight(0, 5, 0, 0, 0);
    expect(canSpawn('MONSTER', world, PLAINS, 0, 5, 0, MIN_SPAWN_DISTANCE + 10)).toBe(true);
  });
});
