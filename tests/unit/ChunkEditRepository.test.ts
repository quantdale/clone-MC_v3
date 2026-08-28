import { describe, it, expect } from 'vitest';
import {
  ChunkEditRepository,
} from '../../src/storage/ChunkEditRepository';
import { validateChunkEditRecord, CHUNK_EDIT_RECORD_VERSION } from '../../src/storage/ChunkEditRecord';
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_METADATA_STORE,
  WORLD_PLAYER_STATE_STORE,
  WORLD_CHUNK_EDIT_STORE,
  type WorldMetadata,
} from '../../src/storage/WorldMetadata';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import {
  MockDatabase,
  createIdbFactoryMock,
  type MockIdbFactory,
} from './IdbFactoryMock';

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

describe('validateChunkEditRecord', () => {
  it('accepts a well-formed record and defaults key to the composite', () => {
    const rec = validateChunkEditRecord({
      worldId: 'a',
      chunkX: -1,
      chunkY: 2,
      chunkZ: 3,
      changes: [[0, 1], [16383, 42]],
    });
    expect(rec.key).toBe('a|-1|2|3');
    expect(CHUNK_EDIT_RECORD_VERSION).toBe(1);
  });

  it('keeps an explicit non-empty key when provided', () => {
    const rec = validateChunkEditRecord({
      key: 'custom',
      worldId: 'a',
      chunkX: 0,
      chunkY: 0,
      chunkZ: 0,
      changes: [[5, 2]],
    });
    expect(rec.key).toBe('custom');
  });

  it('throws on non-object input or empty worldId', () => {
    expect(() => validateChunkEditRecord(null)).toThrow();
    expect(() => validateChunkEditRecord(7)).toThrow();
    expect(() =>
      validateChunkEditRecord({ worldId: '', chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[0, 1]] }),
    ).toThrow(/worldId/);
  });

  it('throws on non-integer coordinates', () => {
    for (const bad of [
      { chunkX: 1.5 },
      { chunkY: NaN },
      { chunkZ: Infinity },
    ]) {
      expect(() =>
        validateChunkEditRecord({ worldId: 'a', chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[0, 1]], ...bad }),
      ).toThrow();
    }
  });

  it('throws on empty changes or malformed pairs', () => {
    expect(() =>
      validateChunkEditRecord({ worldId: 'a', chunkX: 0, chunkY: 0, chunkZ: 0, changes: [] }),
    ).toThrow(/changes/);
    expect(() =>
      validateChunkEditRecord({ worldId: 'a', chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[0]] }),
    ).toThrow();
    expect(() =>
      validateChunkEditRecord({ worldId: 'a', chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[0.5, 1]] }),
    ).toThrow();
  });

  it('throws when index is out of range or blockId is negative', () => {
    expect(() =>
      validateChunkEditRecord({ worldId: 'a', chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[16384, 1]] }),
    ).toThrow(/out of range/);
    expect(() =>
      validateChunkEditRecord({ worldId: 'a', chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[-1, 1]] }),
    ).toThrow();
    expect(() =>
      validateChunkEditRecord({ worldId: 'a', chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[0, -1]] }),
    ).toThrow(/non-negative/);
  });
});

describe('ChunkEditRepository (in-memory mock)', () => {
  it('is constructable with an injected factory and no global indexedDB', () => {
    expect(() => new ChunkEditRepository({ factory: createIdbFactoryMock() })).not.toThrow();
  });

  it('opens the database and creates the chunk-edits store alongside metadata', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkEditRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    const db = mock.databases.get(WORLD_DB_NAME);
    expect(db).toBeDefined();
    expect(db!.objectStoreNames.contains(WORLD_CHUNK_EDIT_STORE)).toBe(true);
    // The shared ensureWorldStores routine also creates the earlier stores.
    expect(db!.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
    expect(db!.objectStoreNames.contains(WORLD_PLAYER_STATE_STORE)).toBe(true);
  });

  it('round-trips edits via put/get by world + chunk coordinate', async () => {
    const repo = new ChunkEditRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putChunkEdits('a', 1, 2, 3, [[0, 1], [16383, 9]]);
    const got = await repo.getChunkEdits('a', 1, 2, 3);
    expect(got).toEqual([[0, 1], [16383, 9]]);
  });

  it('returns null for an absent key', async () => {
    const repo = new ChunkEditRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    expect(await repo.getChunkEdits('missing', 0, 0, 0)).toBeNull();
  });

  it('lists only the records belonging to the requested world', async () => {
    const repo = new ChunkEditRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putChunkEdits('a', 0, 0, 0, [[0, 1]]);
    await repo.putChunkEdits('a', 1, 0, 0, [[2, 3]]);
    await repo.putChunkEdits('b', 0, 0, 0, [[4, 5]]);

    const list = await repo.listChunkEdits('a');
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.worldId === 'a')).toBe(true);
    expect(await repo.listChunkEdits('b')).toHaveLength(1);
  });

  it('deletes a record by world + chunk coordinate', async () => {
    const repo = new ChunkEditRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    await repo.putChunkEdits('a', 1, 2, 3, [[0, 1]]);
    await repo.deleteChunkEdits('a', 1, 2, 3);
    expect(await repo.getChunkEdits('a', 1, 2, 3)).toBeNull();
  });

  it('rejects invalid edits and writes nothing', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkEditRepository({ factory: mock });
    await repo.open();

    await expect(repo.putChunkEdits('a', 0, 0, 0, [[16384, 1]])).rejects.toThrow();
    await expect(repo.putChunkEdits('a', 0, 0, 0, [])).rejects.toThrow();
    expect(await repo.listChunkEdits('a')).toHaveLength(0);
  });

  it('persists data across close/reopen on the same database', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkEditRepository({ factory: mock });
    await repo.open();
    await repo.putChunkEdits('a', 4, 5, 6, [[10, 20]]);
    repo.close();

    const reopened = new ChunkEditRepository({ factory: mock });
    await reopened.open();
    expect(await reopened.getChunkEdits('a', 4, 5, 6)).toEqual([[10, 20]]);
  });

  it('upgrades a v5-ladder database in place to v6 without data loss', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    // Seed a pristine v5 database (034-040 store ladder) with one metadata record.
    const v5 = new MockDatabase(5);
    v5.createObjectStore(WORLD_METADATA_STORE, { keyPath: 'worldId' });
    v5.createObjectStore(WORLD_PLAYER_STATE_STORE, { keyPath: 'key' });
    mock.databases.set(WORLD_DB_NAME, v5);

    const metaRepo = new WorldMetadataRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: 5,
    });
    await metaRepo.open();
    await metaRepo.putMetadata(makeMeta({ worldId: 'a' }));

    // Opening the chunk-edits repository at v6 must migrate the SAME database forward.
    const repo = new ChunkEditRepository({
      factory: mock,
      dbName: WORLD_DB_NAME,
      dbVersion: WORLD_DB_VERSION,
    });
    await repo.open();

    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.version).toBe(WORLD_DB_VERSION);
    expect(db.objectStoreNames.contains(WORLD_CHUNK_EDIT_STORE)).toBe(true);

    // The v5 metadata record must survive the migration.
    const meta = await metaRepo.getMetadata('a');
    expect(meta).not.toBeNull();
    expect(meta!.worldId).toBe('a');

    // And the new store is usable immediately.
    await repo.putChunkEdits('a', 0, 0, 0, [[1, 2]]);
    expect(await repo.getChunkEdits('a', 0, 0, 0)).toEqual([[1, 2]]);
  });

  it('stores records under the composite worldId|chunkX|chunkY|chunkZ key', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkEditRepository({ factory: mock });
    await repo.open();
    await repo.putChunkEdits('w', -3, 1, 7, [[0, 1]]);

    const req = mock
      .databases.get(WORLD_DB_NAME)!
      .transaction(WORLD_CHUNK_EDIT_STORE)
      .objectStore(WORLD_CHUNK_EDIT_STORE)
      .get('w|-3|1|7');
    expect(req.result).toBeDefined();
    expect((req.result as { key: string }).key).toBe('w|-3|1|7');
  });
});
