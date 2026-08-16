import { describe, expect, it } from 'vitest';
import {
  ClientEntityStore,
  EntityReplicationManager,
  type EntitySpawnDescriptor,
} from '../../src/simulation/EntityReplication';

describe('EntityReplication', () => {
  describe('Options and Construction', () => {
    it('creates manager with default options', () => {
      const manager = new EntityReplicationManager();
      expect(manager.center).toBeNull();
      expect(manager.authoritativeCount).toBe(0);
      expect(manager.trackedCount).toBe(0);
    });

    it('creates manager with custom options', () => {
      const manager = new EntityReplicationManager({
        trackingRange: 32,
        maxTracked: 50,
      });
      expect(manager.center).toBeNull();
    });

    it('rejects invalid trackingRange', () => {
      expect(() => new EntityReplicationManager({ trackingRange: 0 })).toThrow(
        'EntityReplication: trackingRange must be a positive finite number',
      );
      expect(() => new EntityReplicationManager({ trackingRange: -10 })).toThrow(
        'EntityReplication: trackingRange must be a positive finite number',
      );
      expect(() => new EntityReplicationManager({ trackingRange: NaN })).toThrow(
        'EntityReplication: trackingRange must be a positive finite number',
      );
    });

    it('rejects invalid maxTracked', () => {
      expect(() => new EntityReplicationManager({ maxTracked: 0 })).toThrow(
        'EntityReplication: maxTracked must be a positive integer',
      );
      expect(() => new EntityReplicationManager({ maxTracked: -5 })).toThrow(
        'EntityReplication: maxTracked must be a positive integer',
      );
      expect(() => new EntityReplicationManager({ maxTracked: 1.5 })).toThrow(
        'EntityReplication: maxTracked must be a positive integer',
      );
    });
  });

  describe('Observer Center and Range Tracking', () => {
    it('sets and retrieves observer center', () => {
      const manager = new EntityReplicationManager({ trackingRange: 10 });
      manager.setCenter(10, 20, 30);
      expect(manager.center).toEqual({ x: 10, y: 20, z: 30 });

      // Defensive copy check
      const c = manager.center!;
      (c as { x: number }).x = 999;
      expect(manager.center).toEqual({ x: 10, y: 20, z: 30 });
    });

    it('rejects non-finite center coordinates', () => {
      const manager = new EntityReplicationManager();
      expect(() => manager.setCenter(NaN, 0, 0)).toThrow(
        'EntityReplication: coordinates must be finite numbers',
      );
      expect(() => manager.setCenter(0, Infinity, 0)).toThrow(
        'EntityReplication: coordinates must be finite numbers',
      );
      expect(() => manager.setCenter(0, 0, -Infinity)).toThrow(
        'EntityReplication: coordinates must be finite numbers',
      );
    });

    it('replicates entities within 3D Euclidean tracking range', () => {
      const manager = new EntityReplicationManager({ trackingRange: 10 });
      // In range: distance = sqrt(6^2 + 8^2) = 10 (exact boundary)
      manager.upsertEntity({
        id: 1,
        type: 'minecraft:zombie',
        position: { x: 6, y: 0, z: 8 },
      });
      // Out of range: distance = sqrt(6^2 + 8.1^2) > 10
      manager.upsertEntity({
        id: 2,
        type: 'minecraft:skeleton',
        position: { x: 6, y: 0, z: 8.1 },
      });

      manager.setCenter(0, 0, 0);
      const batch = manager.collectUpdates(1);

      expect(batch.tick).toBe(1);
      expect(batch.spawned).toHaveLength(1);
      expect(batch.spawned[0]!.id).toBe(1);
      expect(batch.spawned[0]!.type).toBe('minecraft:zombie');
      expect(batch.despawned).toHaveLength(0);
      expect(manager.isTracking(1)).toBe(true);
      expect(manager.isTracking(2)).toBe(false);
      expect(manager.trackedCount).toBe(1);
    });

    it('emits despawn when entity moves out of range or observer moves away', () => {
      const manager = new EntityReplicationManager({ trackingRange: 10 });
      manager.upsertEntity({
        id: 1,
        type: 'minecraft:pig',
        position: { x: 0, y: 0, z: 0 },
      });

      manager.setCenter(0, 0, 0);
      const batch1 = manager.collectUpdates(1);
      expect(batch1.spawned).toHaveLength(1);
      expect(manager.isTracking(1)).toBe(true);

      // Move observer away
      manager.setCenter(50, 0, 50);
      const batch2 = manager.collectUpdates(2);
      expect(batch2.spawned).toHaveLength(0);
      expect(batch2.despawned).toEqual([1]);
      expect(manager.isTracking(1)).toBe(false);
      expect(manager.trackedCount).toBe(0);
    });

    it('emits despawn when entity is removed from server world', () => {
      const manager = new EntityReplicationManager({ trackingRange: 10 });
      manager.upsertEntity({
        id: 1,
        type: 'minecraft:cow',
        position: { x: 2, y: 0, z: 2 },
      });

      manager.setCenter(0, 0, 0);
      manager.collectUpdates(1);
      expect(manager.isTracking(1)).toBe(true);

      manager.removeEntity(1);
      expect(manager.hasEntity(1)).toBe(false);

      const batch2 = manager.collectUpdates(2);
      expect(batch2.despawned).toEqual([1]);
      expect(manager.isTracking(1)).toBe(false);
    });
  });

  describe('Transform and Tracked Data Deltas', () => {
    it('replicates transform updates for currently tracked entities', () => {
      const manager = new EntityReplicationManager({ trackingRange: 20 });
      manager.upsertEntity({
        id: 1,
        type: 'minecraft:zombie',
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
      });

      manager.setCenter(0, 0, 0);
      manager.collectUpdates(1); // Spawns entity 1

      manager.updateTransform(1, {
        position: { x: 2, y: 0, z: 3 },
        yaw: 45,
        pitch: -15,
        velocity: { vx: 0.1, vy: 0, vz: 0.2 },
      });

      const batch2 = manager.collectUpdates(2);
      expect(batch2.spawned).toHaveLength(0);
      expect(batch2.despawned).toHaveLength(0);
      expect(batch2.transforms).toHaveLength(1);
      expect(batch2.transforms[0]).toEqual({
        id: 1,
        position: { x: 2, y: 0, z: 3 },
        yaw: 45,
        pitch: -15,
        velocity: { vx: 0.1, vy: 0, vz: 0.2 },
      });

      // Subsequent update tick with no changes produces empty transforms
      const batch3 = manager.collectUpdates(3);
      expect(batch3.transforms).toHaveLength(0);
    });

    it('does not emit transform deltas for entities that are not currently tracked', () => {
      const manager = new EntityReplicationManager({ trackingRange: 10 });
      manager.upsertEntity({
        id: 1,
        type: 'minecraft:sheep',
        position: { x: 100, y: 0, z: 100 },
      });

      manager.setCenter(0, 0, 0);
      manager.collectUpdates(1);

      manager.updateTransform(1, { position: { x: 105, y: 0, z: 105 } });
      const batch2 = manager.collectUpdates(2);
      expect(batch2.transforms).toHaveLength(0);
    });

    it('replicates tracked data updates for tracked entities', () => {
      const manager = new EntityReplicationManager({ trackingRange: 20 });
      manager.upsertEntity({
        id: 5,
        type: 'minecraft:player',
        position: { x: 1, y: 1, z: 1 },
        trackedData: [{ id: 0, value: 20 }], // health = 20
      });

      manager.setCenter(0, 0, 0);
      const batch1 = manager.collectUpdates(1);
      expect(batch1.spawned[0]!.trackedData).toEqual([{ id: 0, value: 20 }]);

      // Update tracked data
      manager.updateTrackedData(5, [
        { id: 0, value: 15 },
        { id: 1, value: true },
      ]);

      const batch2 = manager.collectUpdates(2);
      expect(batch2.trackedData).toHaveLength(1);
      expect(batch2.trackedData[0]).toEqual({
        id: 5,
        entries: [
          { id: 0, value: 15 },
          { id: 1, value: true },
        ],
      });

      // Cleared on consumption
      const batch3 = manager.collectUpdates(3);
      expect(batch3.trackedData).toHaveLength(0);
    });
  });

  describe('Validation and Rejection Handling', () => {
    it('rejects invalid entity IDs', () => {
      const manager = new EntityReplicationManager();
      expect(() =>
        manager.upsertEntity({
          id: -1,
          type: 'minecraft:pig',
          position: { x: 0, y: 0, z: 0 },
        }),
      ).toThrow('EntityReplication: id must be a non-negative safe integer');

      expect(() =>
        manager.upsertEntity({
          id: 1.5,
          type: 'minecraft:pig',
          position: { x: 0, y: 0, z: 0 },
        }),
      ).toThrow('EntityReplication: id must be a non-negative safe integer');
    });

    it('rejects empty entity types', () => {
      const manager = new EntityReplicationManager();
      expect(() =>
        manager.upsertEntity({
          id: 1,
          type: '',
          position: { x: 0, y: 0, z: 0 },
        }),
      ).toThrow('EntityReplication: type must be a non-empty string');
    });

    it('rejects non-finite positions, rotations, and velocities', () => {
      const manager = new EntityReplicationManager();
      expect(() =>
        manager.upsertEntity({
          id: 1,
          type: 'minecraft:cow',
          position: { x: NaN, y: 0, z: 0 },
        }),
      ).toThrow('EntityReplication: coordinates must be finite numbers');

      expect(() =>
        manager.upsertEntity({
          id: 1,
          type: 'minecraft:cow',
          position: { x: 0, y: 0, z: 0 },
          yaw: Infinity,
        }),
      ).toThrow('EntityReplication: rotation angles must be finite numbers');

      expect(() =>
        manager.upsertEntity({
          id: 1,
          type: 'minecraft:cow',
          position: { x: 0, y: 0, z: 0 },
          velocity: { vx: 0, vy: NaN, vz: 0 },
        }),
      ).toThrow('EntityReplication: velocity components must be finite numbers');
    });

    it('rejects non-existent entity on updateTransform and updateTrackedData', () => {
      const manager = new EntityReplicationManager();
      expect(() =>
        manager.updateTransform(99, { position: { x: 0, y: 0, z: 0 } }),
      ).toThrow('EntityReplication: entity 99 does not exist');

      expect(() =>
        manager.updateTrackedData(99, [{ id: 0, value: 10 }]),
      ).toThrow('EntityReplication: entity 99 does not exist');
    });

    it('enforces maxTracked limit on upsert', () => {
      const manager = new EntityReplicationManager({ maxTracked: 2 });
      manager.upsertEntity({
        id: 1,
        type: 'minecraft:zombie',
        position: { x: 0, y: 0, z: 0 },
      });
      manager.upsertEntity({
        id: 2,
        type: 'minecraft:zombie',
        position: { x: 1, y: 0, z: 0 },
      });

      // Updating existing entity within maxTracked is allowed
      manager.upsertEntity({
        id: 1,
        type: 'minecraft:zombie',
        position: { x: 5, y: 0, z: 0 },
      });

      // Adding 3rd exceeds limit
      expect(() =>
        manager.upsertEntity({
          id: 3,
          type: 'minecraft:zombie',
          position: { x: 2, y: 0, z: 0 },
        }),
      ).toThrow('EntityReplication: maxTracked limit exceeded');
    });

    it('rejects invalid ticks in collectUpdates', () => {
      const manager = new EntityReplicationManager();
      expect(() => manager.collectUpdates(-1)).toThrow(
        'EntityReplication: tick must be a non-negative safe integer',
      );
      expect(() => manager.collectUpdates(1.2)).toThrow(
        'EntityReplication: tick must be a non-negative safe integer',
      );
    });
  });

  describe('ClientEntityStore', () => {
    it('manages client-side entity replica lifecycle via applyBatch', () => {
      const store = new ClientEntityStore();
      expect(store.size).toBe(0);

      // 1. Spawn batch
      const spawnDesc: EntitySpawnDescriptor = {
        id: 10,
        type: 'minecraft:spider',
        position: { x: 10, y: 64, z: 15 },
        yaw: 90,
        pitch: 0,
        velocity: { vx: 0, vy: 0, vz: 0 },
        trackedData: [{ id: 0, value: 'angry' }],
      };

      store.applyBatch({
        tick: 1,
        spawned: [spawnDesc],
        despawned: [],
        transforms: [],
        trackedData: [],
      });

      expect(store.size).toBe(1);
      expect(store.hasEntity(10)).toBe(true);
      const e = store.getEntity(10)!;
      expect(e.id).toBe(10);
      expect(e.type).toBe('minecraft:spider');
      expect(e.position).toEqual({ x: 10, y: 64, z: 15 });
      expect(e.yaw).toBe(90);
      expect(e.trackedData.get(0)).toBe('angry');

      // 2. Transform + Tracked data update batch
      store.applyBatch({
        tick: 2,
        spawned: [],
        despawned: [],
        transforms: [
          {
            id: 10,
            position: { x: 12, y: 64, z: 15 },
            yaw: 120,
          },
        ],
        trackedData: [
          {
            id: 10,
            entries: [{ id: 0, value: 'calm' }],
          },
        ],
      });

      const updated = store.getEntity(10)!;
      expect(updated.position).toEqual({ x: 12, y: 64, z: 15 });
      expect(updated.yaw).toBe(120);
      expect(updated.pitch).toBe(0); // unchanged
      expect(updated.trackedData.get(0)).toBe('calm');

      // 3. Despawn batch
      store.applyBatch({
        tick: 3,
        spawned: [],
        despawned: [10],
        transforms: [],
        trackedData: [],
      });

      expect(store.size).toBe(0);
      expect(store.hasEntity(10)).toBe(false);
      expect(store.getEntity(10)).toBeNull();
    });

    it('returns all entities sorted by id ascending', () => {
      const store = new ClientEntityStore();
      store.applyBatch({
        tick: 1,
        spawned: [
          { id: 40, type: 'a', position: { x: 0, y: 0, z: 0 } },
          { id: 10, type: 'b', position: { x: 0, y: 0, z: 0 } },
          { id: 25, type: 'c', position: { x: 0, y: 0, z: 0 } },
        ],
        despawned: [],
        transforms: [],
        trackedData: [],
      });

      const all = store.getAll();
      expect(all.map((e) => e.id)).toEqual([10, 25, 40]);
    });

    it('resets client store completely', () => {
      const store = new ClientEntityStore();
      store.applyBatch({
        tick: 1,
        spawned: [{ id: 1, type: 'a', position: { x: 0, y: 0, z: 0 } }],
        despawned: [],
        transforms: [],
        trackedData: [],
      });
      expect(store.size).toBe(1);
      store.reset();
      expect(store.size).toBe(0);
      expect(store.hasEntity(1)).toBe(false);
    });
  });

  describe('End-to-End Replication and Determinism', () => {
    it('produces deterministic output across identical schedules', () => {
      const run = () => {
        const manager = new EntityReplicationManager({ trackingRange: 50 });
        const store = new ClientEntityStore();

        manager.setCenter(0, 0, 0);
        manager.upsertEntity({
          id: 1,
          type: 'minecraft:zombie',
          position: { x: 10, y: 0, z: 10 },
          yaw: 0,
          pitch: 0,
          trackedData: [{ id: 0, value: 20 }],
        });
        manager.upsertEntity({
          id: 2,
          type: 'minecraft:skeleton',
          position: { x: 20, y: 0, z: 20 },
        });

        const b1 = manager.collectUpdates(1);
        store.applyBatch(b1);

        manager.updateTransform(1, { position: { x: 12, y: 0, z: 12 }, yaw: 45 });
        manager.updateTrackedData(1, [{ id: 0, value: 10 }]);
        manager.removeEntity(2);

        const b2 = manager.collectUpdates(2);
        store.applyBatch(b2);

        return {
          b1,
          b2,
          storeAll: store.getAll().map((e) => ({
            id: e.id,
            pos: e.position,
            yaw: e.yaw,
            data: [...e.trackedData.entries()],
          })),
        };
      };

      const result1 = run();
      const result2 = run();

      expect(result1).toEqual(result2);
    });
  });

  describe('adversarial tracked-data bounds (237)', () => {
    const desc = (trackedData: { id: number; value: unknown }[]): EntitySpawnDescriptor => ({
      id: 1,
      type: 'zombie',
      position: { x: 0, y: 0, z: 0 },
      trackedData,
    });

    it('rejects an oversized trackedData array on upsert without mutating the pool', () => {
      const m = new EntityReplicationManager({ maxTrackedDataItems: 2 });
      expect(() =>
        m.upsertEntity(desc([{ id: 1, value: 1 }, { id: 2, value: 2 }, { id: 3, value: 3 }])),
      ).toThrow('EntityReplication: trackedData exceeds maxTrackedDataItems (2)');
      expect(m.authoritativeCount).toBe(0);
      expect(m.hasEntity(1)).toBe(false);
    });

    it('rejects an oversized trackedData update on an existing entity', () => {
      const m = new EntityReplicationManager({ maxTrackedDataItems: 2 });
      m.upsertEntity(desc([]));
      expect(() =>
        m.updateTrackedData(1, [{ id: 1, value: 1 }, { id: 2, value: 2 }, { id: 3, value: 3 }]),
      ).toThrow('EntityReplication: trackedData exceeds maxTrackedDataItems (2)');
    });

    it('accepts trackedData at the boundary', () => {
      const m = new EntityReplicationManager({ maxTrackedDataItems: 2 });
      m.upsertEntity(desc([{ id: 1, value: 1 }, { id: 2, value: 2 }]));
      expect(m.getEntity(1)?.trackedData?.length).toBe(2);
    });

    it('rejects an invalid maxTrackedDataItems at construction', () => {
      expect(() => new EntityReplicationManager({ maxTrackedDataItems: 0 })).toThrow(
        'EntityReplication: maxTrackedDataItems must be a positive integer',
      );
    });
  });
});
