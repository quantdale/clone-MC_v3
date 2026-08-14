import { describe, it, expect } from 'vitest';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_METADATA_STORE,
  validateWorldMetadata,
  type WorldMetadata,
} from '../../src/storage/WorldMetadata';
import { createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';

function makeMeta(overrides: Partial<WorldMetadata> = {}): WorldMetadata {
  return {
    schemaVersion: 1,
    worldId: 'world-a',
    seed: 123,
    dimensionId: 'minecraft:overworld',
    minY: -64,
    height: 384,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('WorldMetadata validation', () => {
  it('accepts a fully well-formed record', () => {
    const rec = makeMeta();
    expect(validateWorldMetadata(rec)).toEqual(rec);
  });

  it('throws on empty worldId', () => {
    expect(() => validateWorldMetadata(makeMeta({ worldId: '' }))).toThrow();
  });

  it('throws on non-positive height', () => {
    expect(() => validateWorldMetadata(makeMeta({ height: 0 }))).toThrow();
  });

  it('throws on non-positive schemaVersion', () => {
    expect(() => validateWorldMetadata(makeMeta({ schemaVersion: 0 }))).toThrow();
  });

  it('throws on non-finite seed', () => {
    expect(() => validateWorldMetadata(makeMeta({ seed: NaN }))).toThrow();
  });

  it('throws on non-object input', () => {
    expect(() => validateWorldMetadata(null)).toThrow();
    expect(() => validateWorldMetadata(42)).toThrow();
  });
});

describe('WorldMetadataRepository (in-memory mock)', () => {
  it('is constructable with an injected factory and no global indexedDB', () => {
    expect(() => new WorldMetadataRepository({ factory: createIdbFactoryMock() })).not.toThrow();
  });

  it('creates the metadata store on open', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    await repo.open();

    const db = mock.databases.get(WORLD_DB_NAME);
    expect(db).toBeDefined();
    expect(db!.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
  });

  it('round-trips a record and stamps updatedAt', async () => {
    const repo = new WorldMetadataRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    const meta = makeMeta();
    await repo.putMetadata(meta);

    const got = await repo.getMetadata('world-a');
    expect(got).not.toBeNull();
    expect(got!.worldId).toBe('world-a');
    expect(got!.seed).toBe(123);
    expect(got!.createdAt).toBe(1000);
    // updatedAt is set by the repository to the current time, which is >= createdAt.
    expect(got!.updatedAt).toBeGreaterThanOrEqual(got!.createdAt);
  });

  it('returns null for an absent worldId', async () => {
    const repo = new WorldMetadataRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    expect(await repo.getMetadata('missing')).toBeNull();
  });

  it('lists all stored records', async () => {
    const repo = new WorldMetadataRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    await repo.putMetadata(makeMeta({ worldId: 'a' }));
    await repo.putMetadata(makeMeta({ worldId: 'b', seed: 999 }));

    const all = await repo.listMetadata();
    expect(all).toHaveLength(2);
    const ids = all.map((m) => m.worldId).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('deletes a record by worldId', async () => {
    const repo = new WorldMetadataRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    await repo.putMetadata(makeMeta({ worldId: 'a' }));

    await repo.deleteMetadata('a');
    expect(await repo.getMetadata('a')).toBeNull();
  });

  it('rejects invalid metadata and writes nothing', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    await repo.open();

    await expect(repo.putMetadata(makeMeta({ worldId: '' }))).rejects.toThrow();

    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
    expect(await repo.listMetadata()).toHaveLength(0);
  });

  it('open() is idempotent', async () => {
    const repo = new WorldMetadataRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    await repo.open();

    await repo.putMetadata(makeMeta({ worldId: 'x' }));
    expect(await repo.getMetadata('x')).not.toBeNull();
  });
});
