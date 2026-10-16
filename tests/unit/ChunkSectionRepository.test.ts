import { describe, it, expect } from 'vitest';
import {
  ChunkSectionRepository,
  validateSerializedChunkColumn,
  type ChunkColumnRecord,
} from '../../src/storage/ChunkSectionRepository';
import {
  WorldMetadataRepository,
} from '../../src/storage/WorldMetadataRepository';
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_METADATA_STORE,
  WORLD_CHUNK_SECTION_STORE,
  type WorldMetadata,
} from '../../src/storage/WorldMetadata';
import {
  MockDatabase,
  createIdbFactoryMock,
  type MockIdbFactory,
} from './IdbFactoryMock';
import type { SerializedChunkColumn } from '../../src/world/ChunkColumn';

function makeColumn(overrides: Partial<SerializedChunkColumn> = {}): SerializedChunkColumn {
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

describe('validateSerializedChunkColumn', () => {
  it('accepts a fully well-formed column', () => {
    const col = makeColumn();
    expect(validateSerializedChunkColumn(col)).toEqual(col);
  });

  it('throws when sectionCount is less than 1', () => {
    expect(() => validateSerializedChunkColumn(makeColumn({ sectionCount: 0 }))).toThrow();
  });

  it('throws when sections is not an object', () => {
    expect(() =>
      validateSerializedChunkColumn(makeColumn({ sections: [] as unknown as Record<number, never> })),
    ).toThrow();
    expect(() =>
      validateSerializedChunkColumn(makeColumn({ sections: null as unknown as Record<number, never> })),
    ).toThrow();
  });

  it('throws on non-integer coordinates', () => {
    expect(() => validateSerializedChunkColumn(makeColumn({ chunkX: 1.5 }))).toThrow();
    expect(() => validateSerializedChunkColumn(makeColumn({ chunkZ: NaN }))).toThrow();
  });

  it('throws on non-object input', () => {
    expect(() => validateSerializedChunkColumn(null)).toThrow();
    expect(() => validateSerializedChunkColumn(42)).toThrow();
  });
});

describe('ChunkSectionRepository (in-memory mock)', () => {
  it('is constructable with an injected factory and no global indexedDB', () => {
    expect(() => new ChunkSectionRepository({ factory: createIdbFactoryMock() })).not.toThrow();
  });

  it('opens the database and creates the chunk-sections store alongside metadata', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkSectionRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    const db = mock.databases.get(WORLD_DB_NAME);
    expect(db).toBeDefined();
    expect(db!.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)).toBe(true);
    // The shared ensureWorldStores routine also creates the 034 store.
    expect(db!.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
  });

  it('round-trips a column via put/get by world + chunk coordinate', async () => {
    const repo = new ChunkSectionRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    const col = makeColumn({ chunkX: 1, chunkZ: 2 });
    await repo.putColumn('a', col);

    const got = await repo.getColumn('a', 1, 2);
    expect(got).not.toBeNull();
    expect(got!.chunkX).toBe(1);
    expect(got!.chunkZ).toBe(2);
    expect(got!.sectionCount).toBe(1);
    expect(got!.sections).toEqual(col.sections);
  });

  it('returns null for an absent column key', async () => {
    const repo = new ChunkSectionRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    expect(await repo.getColumn('missing', 0, 0)).toBeNull();
  });

  it('lists only the columns belonging to the requested world', async () => {
    const repo = new ChunkSectionRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putColumn('a', makeColumn({ chunkX: 1, chunkZ: 1 }));
    await repo.putColumn('a', makeColumn({ chunkX: 2, chunkZ: 3 }));
    await repo.putColumn('b', makeColumn({ chunkX: 1, chunkZ: 1 }));

    const list = await repo.listColumns('a');
    expect(list).toHaveLength(2);
    for (const c of list) {
      expect(c.chunkX === 1 || c.chunkX === 2).toBe(true);
    }
    expect(await repo.listColumns('b')).toHaveLength(1);
  });

  it('deletes a column by world + chunk coordinate', async () => {
    const repo = new ChunkSectionRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putColumn('a', makeColumn({ chunkX: 1, chunkZ: 2 }));
    await repo.deleteColumn('a', 1, 2);
    expect(await repo.getColumn('a', 1, 2)).toBeNull();
  });

  it('rejects an invalid column and writes nothing', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkSectionRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    await expect(repo.putColumn('a', makeColumn({ sectionCount: 0 }))).rejects.toThrow();

    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)).toBe(true);
    expect(await repo.listColumns('a')).toHaveLength(0);
  });

  it('upgrades a v1 database in place, adding chunk-sections while preserving world-metadata', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    // Seed a pristine v1 database containing only the world-metadata store (as 034 shipped it).
    const v1 = new MockDatabase(1);
    v1.createObjectStore(WORLD_METADATA_STORE, { keyPath: 'worldId' });
    mock.databases.set(WORLD_DB_NAME, v1);

    // Populate a metadata record via the metadata repository (opens at v1, no upgrade fires).
    const metaRepo = new WorldMetadataRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: 1,
    });
    await metaRepo.open();
    await metaRepo.putMetadata(makeMeta({ worldId: 'a' }));

    // Opening the chunk-sections repository at v2 must migrate the SAME database forward.
    const repo = new ChunkSectionRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.version).toBe(WORLD_DB_VERSION);
    expect(db.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)).toBe(true);

    // The v1 metadata record must survive the migration.
    const meta = await metaRepo.getMetadata('a');
    expect(meta).not.toBeNull();
    expect(meta!.worldId).toBe('a');

    // And the new store is usable immediately.
    await repo.putColumn('a', makeColumn({ chunkX: 4, chunkZ: 4 }));
    expect(await repo.getColumn('a', 4, 4)).not.toBeNull();
  });

  it('stores records under the composite worldId|chunkX|chunkZ key', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkSectionRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();
    await repo.putColumn('w', makeColumn({ chunkX: -3, chunkZ: 7 }));

    const db = mock.databases.get(WORLD_DB_NAME)!;
    const req = db
      .transaction(WORLD_CHUNK_SECTION_STORE)
      .objectStore(WORLD_CHUNK_SECTION_STORE)
      .get('w|-3|7');
    expect(req.result).toBeDefined();
    const rec = req.result as ChunkColumnRecord;
    expect(rec.key).toBe('w|-3|7');
    expect(rec.worldId).toBe('w');
  });
});
