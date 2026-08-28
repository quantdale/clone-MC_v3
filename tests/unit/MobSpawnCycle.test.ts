import { describe, it, expect } from 'vitest';
import {
  countLiveByCategory,
  selectSpawnCandidate,
  runSpawnCycleForChunk,
  DEFAULT_MAX_SPAWNS_PER_CYCLE,
  type SpawnCategoryConfig,
} from '../../src/simulation/MobSpawnCycle';
import { EntityManager } from '../../src/simulation/EntityManager';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import type { SpawnWorld } from '../../src/simulation/MobSpawnRules';
import { BlockId } from '../../src/world/BlockRegistry';
import { VoxelShape } from '../../src/world/VoxelShape';
import type { BiomeTypeDefinition } from '../../src/data/Biome';

const registry = createDefaultEntityRegistry();
const ZOMBIE = registry.getByKey('zombie')!.id; // MONSTER
const PIG = registry.getByKey('pig')!.id; // CREATURE
const OVERWORLD = createResourceId('minecraft', 'overworld');

const PLAINS: BiomeTypeDefinition = {
  id: createResourceId('minecraft', 'biome/test_plains'),
  key: 'test_plains',
  name: 'Test Plains',
  category: 'PLAINS',
  temperature: 0.5,
  precipitation: 'RAIN',
  grassColor: 0x00ff00,
  foliageColor: 0x00aa00,
};

const GROUND_Y = 4;
const SPAWN_Y = 5;

/** A world with solid ground at GROUND_Y everywhere and air above it (favorable for MONSTER spawns). */
class FlatFavorableWorld implements SpawnWorld {
  getBlockId(_x: number, y: number, _z: number): number {
    return y === GROUND_Y ? BlockId.Stone : BlockId.Air;
  }
  getCollisionShape(_x: number, y: number, _z: number): VoxelShape {
    return y === GROUND_Y ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
  }
  getSkyLight(): number {
    return 0;
  }
  getBlockLight(): number {
    return 0;
  }
}

/** A world with no ground anywhere (unfavorable — nothing can ever spawn). */
class EmptyWorld implements SpawnWorld {
  getBlockId(): number {
    return BlockId.Air;
  }
  getCollisionShape(): VoxelShape {
    return VoxelShape.EMPTY;
  }
  getSkyLight(): number {
    return 0;
  }
  getBlockLight(): number {
    return 0;
  }
}

const surfaceHeightAt = () => SPAWN_Y;
const nearestPlayerDistance = () => 50; // within [MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE]

function manager(): EntityManager {
  return new EntityManager(registry);
}

describe('countLiveByCategory', () => {
  it('counts only active entities of the matching category', () => {
    const m = manager();
    m.spawn(ZOMBIE, OVERWORLD, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    m.spawn(ZOMBIE, OVERWORLD, { x: 1, y: 0, z: 0, yaw: 0, pitch: 0 });
    m.spawn(PIG, OVERWORLD, { x: 2, y: 0, z: 0, yaw: 0, pitch: 0 });
    const removed = m.spawn(ZOMBIE, OVERWORLD, { x: 3, y: 0, z: 0, yaw: 0, pitch: 0 });
    m.remove(removed.id);

    expect(countLiveByCategory(m, registry, 'MONSTER')).toBe(2);
    expect(countLiveByCategory(m, registry, 'CREATURE')).toBe(1);
  });
});

describe('selectSpawnCandidate', () => {
  it('is deterministic across repeated identical calls', () => {
    const a = selectSpawnCandidate(42, 3, -2, 0, 0);
    const b = selectSpawnCandidate(42, 3, -2, 0, 0);
    expect(a).toEqual(b);
  });

  it('always falls within the requested chunk footprint, including negative coordinates', () => {
    const cases: Array<[number, number, number, number, number]> = [
      [1, 0, 0, 0, 0],
      [1, 3, -2, 1, 4],
      [7, -5, -5, 2, 10],
      [99, 100, 100, 0, 0],
    ];
    for (const [seed, cx, cz, categoryIndex, attempt] of cases) {
      const { x, z } = selectSpawnCandidate(seed, cx, cz, categoryIndex, attempt);
      expect(x).toBeGreaterThanOrEqual(cx * 16);
      expect(x).toBeLessThan(cx * 16 + 16);
      expect(z).toBeGreaterThanOrEqual(cz * 16);
      expect(z).toBeLessThan(cz * 16 + 16);
    }
  });
});

describe('runSpawnCycleForChunk — cap enforcement', () => {
  it('makes zero attempts for a category already at cap', () => {
    const m = manager();
    m.spawn(ZOMBIE, OVERWORLD, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }); // already at cap=1
    const config: SpawnCategoryConfig = {
      category: 'MONSTER',
      typeId: ZOMBIE,
      cap: 1,
      attemptsPerChunk: 5,
    };
    const world = new FlatFavorableWorld();

    const spawned = runSpawnCycleForChunk(
      m, registry, world, PLAINS, 0, 0, surfaceHeightAt, nearestPlayerDistance, OVERWORLD, 1, [config],
    );

    expect(spawned).toBe(0);
    expect(countLiveByCategory(m, registry, 'MONSTER')).toBe(1);
  });

  it('stops attempts as soon as the cap is reached mid-cycle', () => {
    const m = manager();
    const config: SpawnCategoryConfig = {
      category: 'MONSTER',
      typeId: ZOMBIE,
      cap: 1,
      attemptsPerChunk: 5,
    };
    const world = new FlatFavorableWorld();

    const spawned = runSpawnCycleForChunk(
      m, registry, world, PLAINS, 0, 0, surfaceHeightAt, nearestPlayerDistance, OVERWORLD, 1, [config],
    );

    expect(spawned).toBe(1);
    expect(countLiveByCategory(m, registry, 'MONSTER')).toBe(1);
  });
});

describe('runSpawnCycleForChunk — successful spawn', () => {
  it('places the spawned entity at the candidate block center', () => {
    const m = manager();
    const config: SpawnCategoryConfig = {
      category: 'MONSTER',
      typeId: ZOMBIE,
      cap: 10,
      attemptsPerChunk: 1,
    };
    const world = new FlatFavorableWorld();
    const seed = 7;

    const spawned = runSpawnCycleForChunk(
      m, registry, world, PLAINS, 2, 3, surfaceHeightAt, nearestPlayerDistance, OVERWORLD, seed, [config],
    );
    expect(spawned).toBe(1);

    const expected = selectSpawnCandidate(seed, 2, 3, 0, 0);
    const entities = m.getAll();
    expect(entities).toHaveLength(1);
    expect(entities[0]!.transform).toEqual({
      x: expected.x + 0.5,
      y: SPAWN_Y,
      z: expected.z + 0.5,
      yaw: 0,
      pitch: 0,
    });
  });
});

describe('runSpawnCycleForChunk — no eligible candidate', () => {
  it('spawns nothing without throwing when the world is entirely ineligible', () => {
    const m = manager();
    const config: SpawnCategoryConfig = {
      category: 'MONSTER',
      typeId: ZOMBIE,
      cap: 10,
      attemptsPerChunk: 5,
    };
    const world = new EmptyWorld();

    let spawned = 0;
    expect(() => {
      spawned = runSpawnCycleForChunk(
        m, registry, world, PLAINS, 0, 0, surfaceHeightAt, nearestPlayerDistance, OVERWORLD, 1, [config],
      );
    }).not.toThrow();

    expect(spawned).toBe(0);
    expect(m.size).toBe(0);
  });
});

describe('runSpawnCycleForChunk — Phase 8 limits', () => {
  const MONSTER_CONFIG: SpawnCategoryConfig = {
    category: 'MONSTER',
    typeId: ZOMBIE,
    cap: 10,
    attemptsPerChunk: 20,
  };

  function run(
    m = manager(),
    limits: Parameters<typeof runSpawnCycleForChunk>[11] | undefined = undefined,
    distance = nearestPlayerDistance,
  ): number {
    const args = [
      m, registry, new FlatFavorableWorld(), PLAINS, 0, 0,
      surfaceHeightAt, distance, OVERWORLD, 3, [MONSTER_CONFIG],
    ] as const;
    return limits === undefined
      ? runSpawnCycleForChunk(...args)
      : runSpawnCycleForChunk(...args, limits);
  }

  it('simulationDistanceBlocks gates candidates beyond the given radius', () => {
    // Favorable world and valid base distance, but outside the simulation distance.
    expect(run(undefined, { simulationDistanceBlocks: 10 })).toBe(0);
    expect(manager().size).toBe(0);

    // Same setup inside the simulation distance spawns normally.
    expect(run(undefined, { simulationDistanceBlocks: 50 })).toBeGreaterThan(0);
  });

  it('maxSpawnsPerCycle stops the cycle early across configs', () => {
    const m = manager();
    const configs: SpawnCategoryConfig[] = [
      { ...MONSTER_CONFIG, cap: 2 }, // fills first...
      { category: 'CREATURE', typeId: PIG, cap: 10, attemptsPerChunk: 20 },
    ];
    const bright = new FlatFavorableWorld();
    const brightWorld: SpawnWorld = {
      getBlockId: (x, y, z) => bright.getBlockId(x, y, z),
      getCollisionShape: (x, y, z) => bright.getCollisionShape(x, y, z),
      getSkyLight: () => 15, // favorable for CREATUREs
      getBlockLight: () => 0,
    };
    const spawned = runSpawnCycleForChunk(
      m, registry, brightWorld, PLAINS, 0, 0, surfaceHeightAt, nearestPlayerDistance,
      OVERWORLD, 5, configs, { maxSpawnsPerCycle: 3 },
    );
    expect(spawned).toBe(3); // capped despite 12 total allowed by config caps
    expect(m.size).toBe(3);
  });

  it('omitted limits keeps the default per-cycle budget', () => {
    const m = manager();
    const generous: SpawnCategoryConfig = { ...MONSTER_CONFIG, cap: 100 };
    const spawnedNoLimitsArg = run(m);
    expect(spawnedNoLimitsArg).toBe(DEFAULT_MAX_SPAWNS_PER_CYCLE);
    expect(countLiveByCategory(m, registry, 'MONSTER')).toBe(DEFAULT_MAX_SPAWNS_PER_CYCLE);

    const m2 = manager();
    const spawnedExplicitDefault = runSpawnCycleForChunk(
      m2, registry, new FlatFavorableWorld(), PLAINS, 0, 0, surfaceHeightAt,
      nearestPlayerDistance, OVERWORLD, 3, [generous], {},
    );
    expect(spawnedExplicitDefault).toBe(DEFAULT_MAX_SPAWNS_PER_CYCLE);
  });
});
