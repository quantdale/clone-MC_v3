import { describe, it, expect } from 'vitest';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_METADATA_STORE,
  WORLD_CHUNK_SECTION_STORE,
  WORLD_BLOCK_ENTITY_STORE,
  type WorldMetadata,
} from '../../src/storage/WorldMetadata';
import {
  validateSerializedBlockEntity,
  validateBlockEntityChunkRecord,
  type SerializedBlockEntity,
} from '../../src/storage/BlockEntityRecord';
import { MockDatabase, createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';

function makeEntity(overrides: Partial<SerializedBlockEntity> = {}): SerializedBlockEntity {
  return {
    schemaVersion: 1,
    typeKey: 'minecraft:chest',
    x: 16,
    y: 64,
    z: 32,
    data: { items: [] },
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

describe('validateSerializedBlockEntity', () => {
  it('accepts a fully well-formed entity', () => {
    const e = makeEntity();
    expect(validateSerializedBlockEntity(e)).toEqual(e);
  });

  it('throws on empty typeKey', () => {
    expect(() => validateSerializedBlockEntity(makeEntity({ typeKey: '' }))).toThrow();
  });

  it('throws on undefined data', () => {
    expect(() => validateSerializedBlockEntity({ ...makeEntity(), data: undefined })).toThrow();
  });

  it('throws on non-integer coordinates', () => {
    expect(() => validateSerializedBlockEntity(makeEntity({ x: 1.5 }))).toThrow();
  });

  it('throws on non-positive schemaVersion', () => {
    expect(() => validateSerializedBlockEntity(makeEntity({ schemaVersion: 0 }))).toThrow();
  });
});

describe('validateBlockEntityChunkRecord', () => {
  it('accepts a well-formed record', () => {
    const rec = { worldId: 'a', chunkX: 1, chunkZ: 2, entities: [makeEntity()] };
    expect(validateBlockEntityChunkRecord(rec)).toEqual(expect.objectContaining(rec));
  });

  it('throws when entities is not an array', () => {
    expect(() =>
      validateBlockEntityChunkRecord({ worldId: 'a', chunkX: 1, chunkZ: 2, entities: {} as unknown }),
    ).toThrow();
  });

  it('throws when an entity element is malformed', () => {
    expect(() =>
      validateBlockEntityChunkRecord({
        worldId: 'a',
        chunkX: 1,
        chunkZ: 2,
        entities: [{ ...makeEntity(), typeKey: '' }],
      }),
    ).toThrow();
  });
});

describe('BlockEntityRepository (in-memory mock)', () => {
  it('is constructable with an injected factory and no global indexedDB', () => {
    expect(() => new BlockEntityRepository({ factory: createIdbFactoryMock() })).not.toThrow();
  });

  it('opens the database and creates the block-entities store alongside the others', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new BlockEntityRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    const db = mock.databases.get(WORLD_DB_NAME);
    expect(db).toBeDefined();
    expect(db!.objectStoreNames.contains(WORLD_BLOCK_ENTITY_STORE)).toBe(true);
    expect(db!.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
    expect(db!.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)).toBe(true);
  });

  it('round-trips chunk entities via put/get', async () => {
    const repo = new BlockEntityRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    const entities = [makeEntity({ typeKey: 'minecraft:furnace', x: 16, y: 65, z: 32, data: { fuel: 4 } })];
    await repo.putChunkEntities('a', 1, 2, entities);

    const got = await repo.getChunkEntities('a', 1, 2);
    expect(got).not.toBeNull();
    expect(got).toEqual([
      expect.objectContaining({ typeKey: 'minecraft:furnace', y: 65, data: { fuel: 4 } }),
    ]);
  });

  it('returns null for an absent chunk', async () => {
    const repo = new BlockEntityRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    expect(await repo.getChunkEntities('missing', 0, 0)).toBeNull();
  });

  it('lists only the chunk records belonging to the requested world', async () => {
    const repo = new BlockEntityRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putChunkEntities('a', 1, 1, [makeEntity()]);
    await repo.putChunkEntities('a', 2, 3, [makeEntity({ typeKey: 'minecraft:sign' })]);
    await repo.putChunkEntities('b', 1, 1, [makeEntity({ typeKey: 'minecraft:chest' })]);

    const list = await repo.listChunks('a');
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.worldId === 'a')).toBe(true);
    expect(await repo.listChunks('b')).toHaveLength(1);
  });

  it('deletes a chunk record by world + chunk coordinate', async () => {
    const repo = new BlockEntityRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putChunkEntities('a', 1, 2, [makeEntity()]);
    await repo.deleteChunkEntities('a', 1, 2);
    expect(await repo.getChunkEntities('a', 1, 2)).toBeNull();
  });

  it('rejects an invalid record and writes nothing', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new BlockEntityRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    await expect(
      repo.putChunkEntities('a', 1, 2, [{ ...makeEntity(), typeKey: '' } as SerializedBlockEntity]),
    ).rejects.toThrow();

    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.objectStoreNames.contains(WORLD_BLOCK_ENTITY_STORE)).toBe(true);
    expect(await repo.listChunks('a')).toHaveLength(0);
  });

  it('upgrades a v2 database in place, adding block-entities while preserving prior stores', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    // Seed a pristine v2 database containing only the 034/035 stores (as shipped at v2).
    const v2 = new MockDatabase(2);
    v2.createObjectStore(WORLD_METADATA_STORE, { keyPath: 'worldId' });
    v2.createObjectStore(WORLD_CHUNK_SECTION_STORE, { keyPath: 'key' });
    mock.databases.set(WORLD_DB_NAME, v2);

    // Populate a metadata record and a chunk-section record on the v2 database.
    const metaRepo = new WorldMetadataRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 2 });
    await metaRepo.open();
    await metaRepo.putMetadata(makeMeta({ worldId: 'a' }));

    const chunkRepo = new ChunkSectionRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 2 });
    await chunkRepo.open();
    await chunkRepo.putColumn('a', makeColumn({ chunkX: 1, chunkZ: 2 }));

    // Opening the block-entity repository at v3 must migrate the SAME database forward.
    const repo = new BlockEntityRepository({
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

    // The v2 records must survive the migration.
    expect(await metaRepo.getMetadata('a')).not.toBeNull();
    expect(await chunkRepo.getColumn('a', 1, 2)).not.toBeNull();

    // And the new store is usable immediately.
    await repo.putChunkEntities('a', 4, 4, [makeEntity()]);
    expect(await repo.getChunkEntities('a', 4, 4)).not.toBeNull();
  });
});
