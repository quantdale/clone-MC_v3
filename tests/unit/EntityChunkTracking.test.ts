import { describe, it, expect } from 'vitest';
import { EntityManager } from '../../src/simulation/EntityManager';
import {
  selectTickingEntities,
  deactivateChunk,
  activateChunk,
} from '../../src/simulation/EntityChunkTracking';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import type { EntityTransform } from '../../src/world/Entity';

const registry = createDefaultEntityRegistry();
const ZOMBIE = registry.getByKey('zombie')!.id; // isPersistent: true
const BAT = registry.getByKey('bat')!.id; // isPersistent: false
const OVERWORLD = createResourceId('minecraft', 'overworld');

const IN_CHUNK_00: EntityTransform = { x: 5, y: 2, z: 5, yaw: 0, pitch: 0 };
const IN_CHUNK_55: EntityTransform = { x: 85, y: 2, z: 85, yaw: 0, pitch: 0 };

function manager(): EntityManager {
  return new EntityManager(registry);
}

describe('selectTickingEntities', () => {
  it('returns only entities whose chunk satisfies the predicate', () => {
    const m = manager();
    const near = m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_55);

    const onlyChunk00 = (cx: number, cz: number) => cx === 0 && cz === 0;
    const result = selectTickingEntities(m, onlyChunk00);

    expect(result).toEqual([near]);
  });

  it('does not mutate the manager', () => {
    const m = manager();
    m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    selectTickingEntities(m, () => true);
    expect(m.size).toBe(1);
  });

  it('propagates a throwing predicate', () => {
    const m = manager();
    m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    expect(() =>
      selectTickingEntities(m, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });
});

describe('deactivateChunk', () => {
  it('returns the persistent records and forgets every entity (persistent or not) in the chunk', () => {
    const m = manager();
    const persistent = m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    const nonPersistent = m.spawn(BAT, OVERWORLD, { ...IN_CHUNK_00, x: 6 });

    const records = deactivateChunk(m, 0, 0);

    expect(records).toHaveLength(1);
    expect((records[0]!.data as { id: number }).id).toBe(persistent.id);
    expect(m.get(persistent.id)).toBeUndefined();
    expect(m.get(nonPersistent.id)).toBeUndefined();
    expect(m.getAll()).toEqual([]);
  });

  it('leaves entities in other chunks untouched', () => {
    const m = manager();
    const elsewhere = m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_55);
    m.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);

    deactivateChunk(m, 0, 0);

    expect(m.get(elsewhere.id)).toEqual(elsewhere);
  });
});

describe('activateChunk', () => {
  it('matches deserializeChunk: restores entities from valid records', () => {
    const source = manager();
    source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    const records = source.serializeChunk(0, 0);

    const target = manager();
    const count = activateChunk(target, 0, 0, records);

    expect(count).toBe(1);
    expect(target.size).toBe(1);
  });

  it('matches deserializeChunk: throws atomically on an invalid batch', () => {
    const source = manager();
    source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_00);
    source.spawn(ZOMBIE, OVERWORLD, IN_CHUNK_55);
    const combined = [...source.serializeChunk(0, 0), ...source.serializeChunk(5, 5)];

    const target = manager();
    expect(() => activateChunk(target, 0, 0, combined)).toThrow();
    expect(target.size).toBe(0);
  });

  it('round-trips deactivateChunk output through activateChunk exactly', () => {
    const m = manager();
    const transform: EntityTransform = { x: 5, y: 2.5, z: 6, yaw: 45, pitch: 10 };
    const velocity = { vx: 1, vy: 0, vz: -1 };
    const original = m.spawn(ZOMBIE, OVERWORLD, transform, { velocity });

    const records = deactivateChunk(m, 0, 0);
    expect(m.get(original.id)).toBeUndefined();

    const count = activateChunk(m, 0, 0, records);
    expect(count).toBe(1);
    const restored = m.get(original.id)!;
    expect(restored.typeId).toEqual(ZOMBIE);
    expect(restored.dimension).toEqual(OVERWORLD);
    expect(restored.transform).toEqual(transform);
    expect(restored.velocity).toEqual(velocity);
  });
});
