import { describe, expect, it } from 'vitest';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import { BlockEntityInstance, BlockEntityManager } from '../../src/simulation/BlockEntityManager';
import { activateChunk, deactivateChunk } from '../../src/simulation/EntityChunkTracking';
import { EntityManager } from '../../src/simulation/EntityManager';
import type { EntityTransform } from '../../src/world/Entity';

const entityRegistry = createDefaultEntityRegistry();
const ZOMBIE = entityRegistry.getByKey('zombie')!.id;
const PIG = entityRegistry.getByKey('pig')!.id;
const OVERWORLD = createResourceId('minecraft', 'overworld');

const COLUMN = { cx: -2, cz: -1 };
const ENTITY_TRANSFORM: EntityTransform = {
  x: -17.25,
  y: -63.5,
  z: -1.75,
  yaw: 37,
  pitch: -12,
};
const BLOCK_ENTITY = {
  typeKey: 'furnace',
  x: -17,
  y: -64,
  z: -1,
  data: { input: 'minecraft:iron_ore', count: 3, burnTime: 7 },
};

describe('canonical column entity lifecycle', () => {
  it('preserves identity/state across unload and reload without duplicates or resurrection', () => {
    const entities = new EntityManager(entityRegistry);
    const original = entities.spawn(ZOMBIE, OVERWORLD, ENTITY_TRANSFORM, {
      id: 41,
      velocity: { vx: 0.25, vy: -0.5, vz: 1.5 },
    });
    entities.spawn(PIG, OVERWORLD, { ...ENTITY_TRANSFORM, x: -1 });

    const entityRecords = deactivateChunk(entities, COLUMN.cx, COLUMN.cz);
    expect(entityRecords).toHaveLength(1);
    expect(entities.get(original.id)).toBeUndefined();
    expect(entities.size).toBe(1); // the neighboring column remains resident

    const reloadedEntities = new EntityManager(entityRegistry);
    expect(activateChunk(reloadedEntities, COLUMN.cx, COLUMN.cz, entityRecords)).toBe(1);
    const restored = reloadedEntities.get(original.id);
    expect(restored).toBeDefined();
    expect(restored).toMatchObject({
      id: 41,
      typeId: ZOMBIE,
      dimension: OVERWORLD,
      state: 'ACTIVE',
      transform: ENTITY_TRANSFORM,
      velocity: { vx: 0.25, vy: -0.5, vz: 1.5 },
    });
    expect(() => activateChunk(reloadedEntities, COLUMN.cx, COLUMN.cz, entityRecords)).toThrow(/duplicate entity id/);
    expect(reloadedEntities.size).toBe(1);

    const blockEntities = new BlockEntityManager();
    expect(blockEntities.add(new BlockEntityInstance(BLOCK_ENTITY))).toBe(true);
    const blockRecords = blockEntities.serializeChunk(COLUMN.cx, COLUMN.cz);
    expect(blockRecords).toHaveLength(1);
    expect(blockEntities.removeChunk(COLUMN.cx, COLUMN.cz)).toBe(1);
    expect(blockEntities.size).toBe(0);

    const reloadedBlockEntities = new BlockEntityManager();
    expect(reloadedBlockEntities.deserializeChunk(COLUMN.cx, COLUMN.cz, blockRecords)).toBe(1);
    expect(reloadedBlockEntities.get(BLOCK_ENTITY.x, BLOCK_ENTITY.y, BLOCK_ENTITY.z)).toMatchObject(BLOCK_ENTITY);
    expect(() => reloadedBlockEntities.deserializeChunk(COLUMN.cx, COLUMN.cz, blockRecords)).toThrow(/duplicate block-entity position/);
    expect(reloadedBlockEntities.size).toBe(1);

    // A removed entity is not serialized, so a later column activation cannot resurrect it.
    const removed = new EntityManager(entityRegistry);
    const removedEntity = removed.spawn(PIG, OVERWORLD, ENTITY_TRANSFORM, { id: 77 });
    expect(removed.remove(removedEntity.id)).toBe(true);
    const removedRecords = deactivateChunk(removed, COLUMN.cx, COLUMN.cz);
    expect(removedRecords).toEqual([]);
    const fresh = new EntityManager(entityRegistry);
    expect(activateChunk(fresh, COLUMN.cx, COLUMN.cz, removedRecords)).toBe(0);
    expect(fresh.get(removedEntity.id)).toBeUndefined();
  });
});
