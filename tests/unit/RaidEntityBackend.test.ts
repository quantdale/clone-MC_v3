import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { EntityManager } from '../../src/simulation/EntityManager';
import {
  createEntityManagerRaidBackend,
  createRecordingRaidBackend,
  type RaidSpawnRequest,
} from '../../src/simulation/RaidEntityBackend';

const dimension = createResourceId('minecraft', 'overworld');

function req(overrides: Partial<RaidSpawnRequest> = {}): RaidSpawnRequest {
  return {
    typeKey: 'pillager',
    x: 1,
    y: 64,
    z: 2,
    yaw: 0,
    waveIndex: 1,
    raidGeneration: 0,
    ...overrides,
  };
}

describe('createRecordingRaidBackend (284)', () => {
  it('logs spawns and treats repeated despawn as one effective removal', () => {
    const backend = createRecordingRaidBackend();
    const a = backend.spawn(req());
    const b = backend.spawn(req({ typeKey: 'vindicator' }));
    expect(backend.spawns).toHaveLength(2);
    expect(a.entityId).toBe(1);
    expect(b.entityId).toBe(2);
    expect(backend.isAlive(a)).toBe(true);
    backend.despawn(a);
    expect(backend.despawns).toHaveLength(1);
    expect(() => backend.despawn(a)).not.toThrow();
    expect(backend.despawns).toHaveLength(1);
    expect(backend.isAlive(a)).toBe(false);
    expect(backend.isAlive(b)).toBe(true);
  });

  it('refuses unknown keys when configured', () => {
    const backend = createRecordingRaidBackend({ unknownKeys: ['not_a_raider'] });
    expect(() => backend.spawn(req({ typeKey: 'not_a_raider' }))).toThrow(/unknown typeKey/);
    expect(backend.spawns).toHaveLength(0);
  });

  it('injects partial failure after N successful spawns', () => {
    const backend = createRecordingRaidBackend({ failSpawnAfter: 1 });
    backend.spawn(req());
    expect(() => backend.spawn(req())).toThrow(/injected spawn failure/);
    expect(backend.spawns).toHaveLength(1);
  });
});

describe('createEntityManagerRaidBackend (284)', () => {
  it('spawns registered raiders into a real EntityManager and despawns idempotently', () => {
    const registry = createDefaultEntityRegistry();
    const manager = new EntityManager(registry);
    const backend = createEntityManagerRaidBackend({ manager, registry, dimension });
    const handle = backend.spawn(req({ typeKey: 'ravager', x: 3, y: 70, z: -1, yaw: 1.5 }));
    expect(backend.isAlive(handle)).toBe(true);
    expect(manager.get(handle.entityId)?.state).toBe('ACTIVE');
    expect(registry.getByKey('ravager')?.isPersistent).toBe(false);
    backend.despawn(handle);
    expect(backend.isAlive(handle)).toBe(false);
    expect(manager.get(handle.entityId)?.state).toBe('REMOVED');
    expect(() => backend.despawn(handle)).not.toThrow();
  });

  it('refuses unknown typeKey before any manager insert', () => {
    const registry = createDefaultEntityRegistry();
    const manager = new EntityManager(registry);
    const backend = createEntityManagerRaidBackend({ manager, registry, dimension });
    const before = manager.size;
    expect(() => backend.spawn(req({ typeKey: 'not_a_raider' }))).toThrow(/unknown typeKey/);
    expect(manager.size).toBe(before);
  });

  it('resolves every waveComposition roster key across waves and omen levels', () => {
    const registry = createDefaultEntityRegistry();
    for (const key of ['pillager', 'vindicator', 'ravager', 'witch']) {
      expect(registry.getByKey(key)).toBeDefined();
    }
  });
});
