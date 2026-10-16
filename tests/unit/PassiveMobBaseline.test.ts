import { describe, expect, it } from 'vitest';
import type { World } from '../../src/world/World';
import type { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { VoxelShape } from '../../src/world/VoxelShape';
import { createDefaultBiomeRegistry } from '../../src/data/Biome';
import { createDefaultEntityRegistry, EntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import {
  PassiveMobWorldAdapter,
  PassiveMobSystem,
  SPAWN_CAP,
  type PassiveMobWorld,
  type ChunkCoord,
} from '../../src/simulation/PassiveMobBaseline';

const OVERWORLD = createResourceId('minecraft', 'overworld');

function fakeWorld(solidAt: (x: number, y: number, z: number) => boolean, blockAt: (x: number, y: number, z: number) => number = () => 0): World {
  return { isSolid: solidAt, getBlock: blockAt } as unknown as World;
}

function fakeGenerator(
  biomeAt: (x: number, z: number) => string,
  heightAt: (x: number, z: number) => number = () => 63,
): TerrainGenerator {
  return { getBiomeAt: biomeAt, getHeightAt: heightAt } as unknown as TerrainGenerator;
}

describe('PassiveMobWorldAdapter', () => {
  it('reports a full cube for a solid block and empty for air', () => {
    const adapter = new PassiveMobWorldAdapter({
      world: fakeWorld((_x, y, _z) => y === 0),
      generator: fakeGenerator(() => 'plains'),
      biomeRegistry: createDefaultBiomeRegistry(),
    });
    expect(adapter.getCollisionShape(0, 0, 0)).toBe(VoxelShape.FULL_CUBE);
    expect(adapter.getCollisionShape(0, 5, 0)).toBe(VoxelShape.EMPTY);
  });

  it('delegates getBlockId to world.getBlock', () => {
    const adapter = new PassiveMobWorldAdapter({
      world: fakeWorld(() => false, () => 42),
      generator: fakeGenerator(() => 'plains'),
      biomeRegistry: createDefaultBiomeRegistry(),
    });
    expect(adapter.getBlockId(1, 2, 3)).toBe(42);
  });

  it('reports full sky light for an unobstructed column', () => {
    const adapter = new PassiveMobWorldAdapter({
      world: fakeWorld(() => false),
      generator: fakeGenerator(() => 'plains'),
      biomeRegistry: createDefaultBiomeRegistry(),
    });
    expect(adapter.getSkyLight(0, 10, 0)).toBe(15);
  });

  it('reports zero sky light when an overhang blocks the column', () => {
    const adapter = new PassiveMobWorldAdapter({
      world: fakeWorld((_x, y, _z) => y === 20),
      generator: fakeGenerator(() => 'plains'),
      biomeRegistry: createDefaultBiomeRegistry(),
    });
    expect(adapter.getSkyLight(0, 10, 0)).toBe(0);
  });

  it('always reports zero block light', () => {
    const adapter = new PassiveMobWorldAdapter({
      world: fakeWorld(() => false),
      generator: fakeGenerator(() => 'plains'),
      biomeRegistry: createDefaultBiomeRegistry(),
    });
    expect(adapter.getBlockLight(0, 0, 0)).toBe(0);
  });

  it('bridges every legacy biome key the generator can produce', () => {
    for (const key of ['plains', 'forest', 'desert', 'taiga']) {
      const adapter = new PassiveMobWorldAdapter({
        world: fakeWorld(() => false),
        generator: fakeGenerator(() => key),
        biomeRegistry: createDefaultBiomeRegistry(),
      });
      expect(adapter.getBiomeDefinition(0, 0).key).toBe(key);
    }
  });

  it('throws for an unrecognized biome key', () => {
    const adapter = new PassiveMobWorldAdapter({
      world: fakeWorld(() => false),
      generator: fakeGenerator(() => 'nonexistent'),
      biomeRegistry: createDefaultBiomeRegistry(),
    });
    expect(() => adapter.getBiomeDefinition(0, 0)).toThrow();
  });

  it('resolves surface height as one above the floored terrain height', () => {
    const adapter = new PassiveMobWorldAdapter({
      world: fakeWorld(() => false),
      generator: fakeGenerator(() => 'plains', () => 63.9),
      biomeRegistry: createDefaultBiomeRegistry(),
    });
    expect(adapter.getSurfaceHeightAt(0, 0)).toBe(64);
  });
});

describe('PassiveMobSystem', () => {
  it('throws if the registry has no pig definition', () => {
    const registryWithoutPig = new EntityRegistry([
      {
        id: createResourceId('minecraft', 'entity_type/zombie'),
        key: 'zombie',
        name: 'Zombie',
        category: 'MONSTER',
        health: 20,
        attackDamage: 3,
      },
    ]);
    expect(() => new PassiveMobSystem(registryWithoutPig, 1)).toThrow();
  });

  it('accepts a registry that has a pig definition', () => {
    expect(() => new PassiveMobSystem(createDefaultEntityRegistry(), 1)).not.toThrow();
  });

  function permissiveWorld(): PassiveMobWorld {
    return {
      getCollisionShape: () => VoxelShape.EMPTY,
      getBlockId: () => 0,
      getSkyLight: () => 15,
      getBlockLight: () => 0,
      getBiomeDefinition: () => createDefaultBiomeRegistry().getByKey('plains')!,
      getSurfaceHeightAt: () => 10,
    };
  }

  /** Like permissiveWorld, but with solid ground at y=9 so canStandAt (surface y=10) succeeds. */
  function spawnableWorld(): PassiveMobWorld {
    return {
      ...permissiveWorld(),
      getCollisionShape: (_x: number, y: number, _z: number) => (y < 10 ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
    };
  }

  it('never exceeds the spawn cap across repeated sweeps over many chunks', () => {
    const registry = createDefaultEntityRegistry();
    const system = new PassiveMobSystem(registry, 1);
    const world = spawnableWorld();
    const chunks: ChunkCoord[] = [];
    for (let cx = 0; cx < 10; cx++) {
      for (let cz = 0; cz < 10; cz++) chunks.push({ cx, cz });
    }
    // Far from the (fixed) player position so isValidSpawnDistance passes for every chunk.
    const nearestPlayerDistance = () => 50;

    system.spawnCycle(world, OVERWORLD, chunks, nearestPlayerDistance);
    system.spawnCycle(world, OVERWORLD, chunks, nearestPlayerDistance);

    expect(system.getActivePigs().length).toBeLessThanOrEqual(SPAWN_CAP);
    expect(system.getActivePigs().length).toBeGreaterThan(0);
  });

  it('leaves an entity outside the ticking set untouched', () => {
    const registry = createDefaultEntityRegistry();
    const system = new PassiveMobSystem(registry, 1);
    const pigTypeId = registry.getByKey('pig')!.id;
    const manager = system.getManager();
    const entity = manager.spawn(pigTypeId, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
    const before = { transform: { ...entity.transform }, velocity: { ...entity.velocity } };

    system.tick(0.05, permissiveWorld(), () => false);

    const after = manager.get(entity.id)!;
    expect(after.transform).toEqual(before.transform);
    expect(after.velocity).toEqual(before.velocity);
  });

  it('applies gravity/physics to a ticking entity over repeated ticks', () => {
    const registry = createDefaultEntityRegistry();
    const system = new PassiveMobSystem(registry, 1);
    const pigTypeId = registry.getByKey('pig')!.id;
    const manager = system.getManager();
    const entity = manager.spawn(pigTypeId, OVERWORLD, { x: 0, y: 50, z: 0, yaw: 0, pitch: 0 });
    const startY = entity.transform.y;

    for (let i = 0; i < 5; i++) {
      system.tick(0.05, permissiveWorld(), () => true);
    }

    const after = manager.get(entity.id)!;
    expect(after.transform.y).toBeLessThan(startY);
    expect(after.velocity.vy).toBeLessThan(0);
  });

  it('does not throw across many repeated ticks for the same entity', () => {
    const registry = createDefaultEntityRegistry();
    const system = new PassiveMobSystem(registry, 1);
    const pigTypeId = registry.getByKey('pig')!.id;
    const manager = system.getManager();
    manager.spawn(pigTypeId, OVERWORLD, { x: 0, y: 50, z: 0, yaw: 0, pitch: 0 });

    expect(() => {
      for (let i = 0; i < 50; i++) {
        system.tick(0.05, permissiveWorld(), () => true);
      }
    }).not.toThrow();
  });
});
