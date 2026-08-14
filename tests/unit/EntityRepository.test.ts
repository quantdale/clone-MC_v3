import { describe, it, expect } from 'vitest';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_METADATA_STORE,
  WORLD_CHUNK_SECTION_STORE,
  WORLD_BLOCK_ENTITY_STORE,
  WORLD_ENTITY_STORE,
  type WorldMetadata,
} from '../../src/storage/WorldMetadata';
import {
  validateSerializedEntity,
  validateEntityChunkRecord,
  type SerializedEntity,
} from '../../src/storage/EntityRecord';
import { MockDatabase, createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';

function makeEntity(overrides: Partial<SerializedEntity> = {}): SerializedEntity {
  return {
    schemaVersion: 1,
    typeKey: 'minecraft:zombie',
    x: 16,
    y: 64,
    z: 32,
    data: { health: 20 },
    ...overrides,
  };
}

function makeMeta(overrides: Partial<WorldMetadata> = {}): WorldMetadata {
  return {
    schemaVersion: 1,
    worldId: 'a',
    seed: 123,
    dimensionId: 'minecraft:overworld',
    minY: -64,
    height: 384,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeColumn(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    chunkX: 1,
    chunkZ: 2,
    sectionCount: 1,
    minSectionY: 0,
    sections: { 0: { version: 1, capacity: 4096, bitsPerEntry: 4, palette: [0], storage: [0] } },
    ...overrides,
  };
}

function makeBlockEntities(overrides: Record<string, unknown> = {}) {
  return [
    {
      schemaVersion: 1,
      typeKey: 'minecraft:chest',
      x: 16,
      y: 64,
      z: 32,
      data: { items: [] },
      ...overrides,
    },
  ];
}

describe('validateSerializedEntity', () => {
  it('accepts a fully well-formed entity', () => {
    const e = makeEntity();
    expect(validateSerializedEntity(e)).toEqual(e);
  });

  it('throws on empty typeKey', () => {
    expect(() => validateSerializedEntity(makeEntity({ typeKey: '' }))).toThrow();
  });

  it('throws on undefined data', () => {
    expect(() => validateSerializedEntity({ ...makeEntity(), data: undefined })).toThrow();
  });

  it('throws on non-integer coordinates', () => {
    expect(() => validateSerializedEntity(makeEntity({ x: 1.5 }))).toThrow();
  });

  it('throws on non-positive schemaVersion', () => {
    expect(() => validateSerializedEntity(makeEntity({ schemaVersion: 0 }))).toThrow();
  });
});

describe('validateEntityChunkRecord', () => {
  it('accepts a well-formed record', () => {
    const rec = { worldId: 'a', chunkX: 1, chunkZ: 2, entities: [makeEntity()] };
    expect(validateEntityChunkRecord(rec)).toEqual(expect.objectContaining(rec));
  });

  it('throws when entities is not an array', () => {
    expect(() =>
      validateEntityChunkRecord({ worldId: 'a', chunkX: 1, chunkZ: 2, entities: {} as unknown }),
    ).toThrow();
  });

  it('throws when an entity element is malformed', () => {
    expect(() =>
      validateEntityChunkRecord({
        worldId: 'a',
        chunkX: 1,
        chunkZ: 2,
        entities: [{ ...makeEntity(), typeKey: '' }],
      }),
    ).toThrow();
  });
});

describe('EntityRepository (in-memory mock)', () => {
  it('is constructable with an injected factory and no global indexedDB', () => {
    expect(() => new EntityRepository({ factory: createIdbFactoryMock() })).not.toThrow();
  });

  it('opens the database and creates the entities store alongside the others', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new EntityRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    const db = mock.databases.get(WORLD_DB_NAME);
    expect(db).toBeDefined();
    expect(db!.objectStoreNames.contains(WORLD_ENTITY_STORE)).toBe(true);
    expect(db!.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
    expect(db!.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)).toBe(true);
    expect(db!.objectStoreNames.contains(WORLD_BLOCK_ENTITY_STORE)).toBe(true);
  });

  it('round-trips chunk entities via put/get', async () => {
    const repo = new EntityRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    const entities = [makeEntity({ typeKey: 'minecraft:item', x: 16, y: 65, z: 32, data: { count: 3 } })];
    await repo.putChunkEntities('a', 1, 2, entities);

    const got = await repo.getChunkEntities('a', 1, 2);
    expect(got).not.toBeNull();
    expect(got).toEqual([
      expect.objectContaining({ typeKey: 'minecraft:item', y: 65, data: { count: 3 } }),
    ]);
  });

  it('returns null for an absent chunk', async () => {
    const repo = new EntityRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    expect(await repo.getChunkEntities('missing', 0, 0)).toBeNull();
  });

  it('lists only the chunk records belonging to the requested world', async () => {
    const repo = new EntityRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putChunkEntities('a', 1, 1, [makeEntity()]);
    await repo.putChunkEntities('a', 2, 3, [makeEntity({ typeKey: 'minecraft:sheep' })]);
    await repo.putChunkEntities('b', 1, 1, [makeEntity({ typeKey: 'minecraft:cow' })]);

    const list = await repo.listChunks('a');
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.worldId === 'a')).toBe(true);
    expect(await repo.listChunks('b')).toHaveLength(1);
  });

  it('deletes a chunk record by world + chunk coordinate', async () => {
    const repo = new EntityRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putChunkEntities('a', 1, 2, [makeEntity()]);
    await repo.deleteChunkEntities('a', 1, 2);
    expect(await repo.getChunkEntities('a', 1, 2)).toBeNull();
  });

  it('rejects an invalid record and writes nothing', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new EntityRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    await expect(
      repo.putChunkEntities('a', 1, 2, [{ ...makeEntity(), typeKey: '' } as SerializedEntity]),
    ).rejects.toThrow();

    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.objectStoreNames.contains(WORLD_ENTITY_STORE)).toBe(true);
    expect(await repo.listChunks('a')).toHaveLength(0);
  });

  it('upgrades a v3 database in place, adding entities while preserving prior stores', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    // Seed a pristine v3 database containing only the 034/035/036 stores (as shipped at v3).
    const v3 = new MockDatabase(3);
    v3.createObjectStore(WORLD_METADATA_STORE, { keyPath: 'worldId' });
    v3.createObjectStore(WORLD_CHUNK_SECTION_STORE, { keyPath: 'key' });
    v3.createObjectStore(WORLD_BLOCK_ENTITY_STORE, { keyPath: 'key' });
    mock.databases.set(WORLD_DB_NAME, v3);

    // Populate a record on each prior store.
    const metaRepo = new WorldMetadataRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 3 });
    await metaRepo.open();
    await metaRepo.putMetadata(makeMeta({ worldId: 'a' }));

    const chunkRepo = new ChunkSectionRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 3 });
    await chunkRepo.open();
    await chunkRepo.putColumn('a', makeColumn({ chunkX: 1, chunkZ: 2 }));

    const blockRepo = new BlockEntityRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 3 });
    await blockRepo.open();
    await blockRepo.putChunkEntities('a', 1, 2, makeBlockEntities());

    // Opening the entity repository at v4 must migrate the SAME database forward.
    const repo = new EntityRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.version).toBe(WORLD_DB_VERSION);
    expect(db.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_BLOCK_ENTITY_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_ENTITY_STORE)).toBe(true);

    // The v3 records must survive the migration.
    expect(await metaRepo.getMetadata('a')).not.toBeNull();
    expect(await chunkRepo.getColumn('a', 1, 2)).not.toBeNull();
    expect(await blockRepo.getChunkEntities('a', 1, 2)).not.toBeNull();

    // And the new store is usable immediately.
    await repo.putChunkEntities('a', 4, 4, [makeEntity()]);
    expect(await repo.getChunkEntities('a', 4, 4)).not.toBeNull();
  });
});
