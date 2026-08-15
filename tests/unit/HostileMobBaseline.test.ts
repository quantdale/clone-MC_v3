import { describe, expect, it } from 'vitest';
import { VoxelShape } from '../../src/world/VoxelShape';
import { createDefaultBiomeRegistry } from '../../src/data/Biome';
import { createDefaultEntityRegistry, EntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import {
  HostileMobSystem,
  HOSTILE_SPAWN_CAP,
  HOSTILE_DETECTION_RADIUS,
  type HostileMobWorld,
  type ChunkCoord,
  type PlayerTarget,
} from '../../src/simulation/HostileMobBaseline';

const OVERWORLD = createResourceId('minecraft', 'overworld');

function permissiveWorld(): HostileMobWorld {
  return {
    getCollisionShape: () => VoxelShape.EMPTY,
    getBlockId: () => 0,
    getSkyLight: () => 0,
    getBlockLight: () => 0,
    getBiomeDefinition: () => createDefaultBiomeRegistry().getByKey('plains')!,
    getSurfaceHeightAt: () => 10,
  };
}

/** Like permissiveWorld, but with solid ground at y=9 so canStandAt (surface y=10) succeeds. */
function spawnableWorld(): HostileMobWorld {
  return {
    ...permissiveWorld(),
    getCollisionShape: (_x: number, y: number, _z: number) => (y < 10 ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
  };
}

describe('HostileMobSystem', () => {
  it('throws if the registry has no zombie definition', () => {
    const registryWithoutZombie = new EntityRegistry([
      {
        id: createResourceId('minecraft', 'entity_type/pig'),
        key: 'pig',
        name: 'Pig',
        category: 'CREATURE',
        health: 10,
      },
    ]);
    expect(() => new HostileMobSystem(registryWithoutZombie, 1)).toThrow();
  });

  it('accepts a registry that has a zombie definition', () => {
    expect(() => new HostileMobSystem(createDefaultEntityRegistry(), 1)).not.toThrow();
  });

  it('never exceeds the spawn cap across repeated sweeps over many chunks', () => {
    const registry = createDefaultEntityRegistry();
    const system = new HostileMobSystem(registry, 1);
    const world = spawnableWorld();
    const chunks: ChunkCoord[] = [];
    for (let cx = 0; cx < 10; cx++) {
      for (let cz = 0; cz < 10; cz++) chunks.push({ cx, cz });
    }
    // Far from the (fixed) player position so isValidSpawnDistance passes for every chunk.
    const nearestPlayerDistance = () => 50;

    system.spawnCycle(world, OVERWORLD, chunks, nearestPlayerDistance);
    system.spawnCycle(world, OVERWORLD, chunks, nearestPlayerDistance);

    expect(system.getActiveZombies().length).toBeLessThanOrEqual(HOSTILE_SPAWN_CAP);
    expect(system.getActiveZombies().length).toBeGreaterThan(0);
  });

  it('leaves an entity outside the ticking set untouched', () => {
    const registry = createDefaultEntityRegistry();
    const system = new HostileMobSystem(registry, 1);
    const zombieTypeId = registry.getByKey('zombie')!.id;
    const manager = system.getManager();
    const entity = manager.spawn(zombieTypeId, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
    const before = { transform: { ...entity.transform }, velocity: { ...entity.velocity } };

    system.tick(
      0.05,
      permissiveWorld(),
      () => false,
      () => null,
      () => {
        throw new Error('should not be called');
      },
    );

    const after = manager.get(entity.id)!;
    expect(after.transform).toEqual(before.transform);
    expect(after.velocity).toEqual(before.velocity);
  });

  it('assigns a goal bundle and applies gravity/physics to a ticking entity with no player target', () => {
    const registry = createDefaultEntityRegistry();
    const system = new HostileMobSystem(registry, 1);
    const zombieTypeId = registry.getByKey('zombie')!.id;
    const manager = system.getManager();
    const entity = manager.spawn(zombieTypeId, OVERWORLD, { x: 0, y: 50, z: 0, yaw: 0, pitch: 0 });
    const startY = entity.transform.y;
    let damaged = 0;

    for (let i = 0; i < 5; i++) {
      system.tick(0.05, permissiveWorld(), () => true, () => null, () => damaged++);
    }

    const after = manager.get(entity.id)!;
    expect(after.transform.y).toBeLessThan(startY);
    expect(after.velocity.vy).toBeLessThan(0);
    expect(damaged).toBe(0);
  });

  it('does not throw across many repeated ticks for the same entity', () => {
    const registry = createDefaultEntityRegistry();
    const system = new HostileMobSystem(registry, 1);
    const zombieTypeId = registry.getByKey('zombie')!.id;
    const manager = system.getManager();
    manager.spawn(zombieTypeId, OVERWORLD, { x: 0, y: 50, z: 0, yaw: 0, pitch: 0 });

    expect(() => {
      for (let i = 0; i < 50; i++) {
        system.tick(0.05, permissiveWorld(), () => true, () => null, () => {});
      }
    }).not.toThrow();
  });

  describe('melee attack', () => {
    function target(x: number, y: number, z: number): PlayerTarget {
      return { x, y, z };
    }

    it('hits an in-range acquired target exactly once', () => {
      const registry = createDefaultEntityRegistry();
      const system = new HostileMobSystem(registry, 1);
      const zombieTypeId = registry.getByKey('zombie')!.id;
      const manager = system.getManager();
      // Ground at y=9 so the zombie (surface at y=10) doesn't fall; within HOSTILE_ATTACK_RANGE
      // of the player target immediately.
      manager.spawn(zombieTypeId, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
      const world = spawnableWorld();

      const damages: number[] = [];
      system.tick(0.05, world, () => true, () => target(1, 10, 0), (amount) => damages.push(amount));

      expect(damages.length).toBe(1);
      expect(damages[0]).toBeGreaterThan(0);
    });

    it('never attacks when the target is beyond detection range', () => {
      const registry = createDefaultEntityRegistry();
      const system = new HostileMobSystem(registry, 1);
      const zombieTypeId = registry.getByKey('zombie')!.id;
      const manager = system.getManager();
      manager.spawn(zombieTypeId, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
      const world = spawnableWorld();
      const farAway = HOSTILE_DETECTION_RADIUS + 50;

      let damaged = 0;
      for (let i = 0; i < 5; i++) {
        system.tick(0.05, world, () => true, () => target(farAway, 10, 0), () => damaged++);
      }

      expect(damaged).toBe(0);
    });

    it('gates repeat hits behind the shared invulnerability window', () => {
      const registry = createDefaultEntityRegistry();
      const system = new HostileMobSystem(registry, 1);
      const zombieTypeId = registry.getByKey('zombie')!.id;
      const manager = system.getManager();
      manager.spawn(zombieTypeId, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
      const world = spawnableWorld();

      let damaged = 0;
      system.tick(0.05, world, () => true, () => target(1, 10, 0), () => damaged++);
      expect(damaged).toBe(1);

      // Immediately following tick: still well inside DEFAULT_INVULNERABILITY_TICKS (10).
      system.tick(0.05, world, () => true, () => target(1, 10, 0), () => damaged++);
      expect(damaged).toBe(1);
    });

    it('lands only one hit when two zombies are in range the same tick', () => {
      const registry = createDefaultEntityRegistry();
      const system = new HostileMobSystem(registry, 1);
      const zombieTypeId = registry.getByKey('zombie')!.id;
      const manager = system.getManager();
      manager.spawn(zombieTypeId, OVERWORLD, { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 });
      manager.spawn(zombieTypeId, OVERWORLD, { x: 0, y: 10, z: 1, yaw: 0, pitch: 0 });
      const world = spawnableWorld();

      let damaged = 0;
      system.tick(0.05, world, () => true, () => target(1, 10, 0), () => damaged++);

      expect(damaged).toBe(1);
    });
  });
});
