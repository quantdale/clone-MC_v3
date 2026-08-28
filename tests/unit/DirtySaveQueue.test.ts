import { describe, it, expect } from 'vitest';
import { DirtySaveQueue, type SaveUnit, type SaveSink } from '../../src/storage/DirtySaveQueue';
import { RepositorySaveSink } from '../../src/storage/RepositorySaveSink';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_METADATA_STORE,
  WORLD_CHUNK_SECTION_STORE,
  WORLD_BLOCK_ENTITY_STORE,
  WORLD_ENTITY_STORE,
  type WorldMetadata,
} from '../../src/storage/WorldMetadata';
import { createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';

function unit(overrides: Partial<SaveUnit> = {}): SaveUnit {
  return {
    key: 'k',
    kind: 'world-metadata',
    worldId: 'a',
    chunkX: 0,
    chunkZ: 0,
    payload: { hello: 'world' },
    ...overrides,
  };
}

class RecordingSink implements SaveSink {
  calls: SaveUnit[] = [];
  failKeys = new Set<string>();
  async write(u: SaveUnit): Promise<void> {
    this.calls.push(u);
    if (this.failKeys.has(u.key)) throw new Error(`forced failure: ${u.key}`);
  }
}

describe('DirtySaveQueue (generic)', () => {
  it('drains in FIFO order up to the limit', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit({ key: 'a', payload: 1 }));
    q.markDirty(unit({ key: 'b', payload: 2 }));
    q.markDirty(unit({ key: 'c', payload: 3 }));

    const sink = new RecordingSink();
    const written = await q.drain(sink, 2);

    expect(written).toBe(2);
    expect(sink.calls.map((u) => u.key)).toEqual(['a', 'b']);
    expect(q.has('a')).toBe(false);
    expect(q.has('b')).toBe(false);
    expect(q.has('c')).toBe(true);
  });

  it('de-duplicates by key, keeping the original position and updated payload', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit({ key: 'a', payload: 1 }));
    q.markDirty(unit({ key: 'b', payload: 2 }));
    q.markDirty(unit({ key: 'a', payload: 99 })); // re-mark with new payload

    expect(q.size).toBe(2);
    expect(q.keys()).toEqual(['a', 'b']);
    const sink = new RecordingSink();
    await q.drain(sink, 10);
    const a = sink.calls.find((u) => u.key === 'a')!;
    expect(a.payload).toBe(99);
  });

  it('re-queues a failing unit and retries it next drain', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit({ key: 'a', payload: 1 }));
    q.markDirty(unit({ key: 'b', payload: 2 }));

    const sink = new RecordingSink();
    sink.failKeys.add('b');
    const first = await q.drain(sink, 10);
    expect(first).toBe(1); // only 'a' succeeded
    expect(q.has('a')).toBe(false);
    expect(q.has('b')).toBe(true);

    sink.failKeys.clear();
    const second = await q.drain(sink, 10);
    expect(second).toBe(1);
    expect(q.size).toBe(0);
    // 'a' written once; 'b' attempted on the failed first drain and again on the successful retry.
    expect(sink.calls.filter((u) => u.key === 'a')).toHaveLength(1);
    expect(sink.calls.filter((u) => u.key === 'b')).toHaveLength(2);
  });

  it('exposes size/has/keys and supports clear', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit({ key: 'a' }));
    q.markDirty(unit({ key: 'b' }));
    expect(q.size).toBe(2);
    expect(q.has('a')).toBe(true);
    expect(q.keys()).toEqual(['a', 'b']);
    q.clear();
    expect(q.size).toBe(0);
    expect(q.has('a')).toBe(false);
  });

  it('drains nothing when limit <= 0', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit({ key: 'a' }));
    const sink = new RecordingSink();
    expect(await q.drain(sink, 0)).toBe(0);
    expect(await q.drain(sink, -1)).toBe(0);
    expect(sink.calls).toHaveLength(0);
    expect(q.size).toBe(1);
  });

  it('de-duplicates chunk-edits units by a key that includes chunkY', async () => {
    const q = new DirtySaveQueue();
    const key = (cy: number) => `chunk-edits|a|1|${cy}|2`;
    q.markDirty(unit({ key: key(0), kind: 'chunk-edits', worldId: 'a', chunkX: 1, chunkY: 0, chunkZ: 2, payload: [[0, 1]] }));
    q.markDirty(unit({ key: key(1), kind: 'chunk-edits', worldId: 'a', chunkX: 1, chunkY: 1, chunkZ: 2, payload: [[3, 4]] }));
    // Re-marking the same chunk (same chunkY) updates the payload but keeps one pending unit.
    q.markDirty(unit({ key: key(0), kind: 'chunk-edits', worldId: 'a', chunkX: 1, chunkY: 0, chunkZ: 2, payload: [[0, 9]] }));

    expect(q.size).toBe(2);
    expect(q.keys()).toEqual([key(0), key(1)]);

    const sink = new RecordingSink();
    await q.drain(sink, 10);
    const first = sink.calls.find((u) => u.key === key(0))!;
    expect(first.chunkY).toBe(0);
    expect(first.payload).toEqual([[0, 9]]);
    expect(q.size).toBe(0);
  });

  it('re-queues a failing chunk-edits unit and retries it next drain', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(unit({
      key: 'chunk-edits|a|0|0|0',
      kind: 'chunk-edits',
      worldId: 'a',
      chunkX: 0,
      chunkY: 0,
      chunkZ: 0,
      payload: [[0, 1]],
    }));

    const sink = new RecordingSink();
    sink.failKeys.add('chunk-edits|a|0|0|0');
    expect(await q.drain(sink, 10)).toBe(0);
    expect(q.size).toBe(1);

    sink.failKeys.clear();
    expect(await q.drain(sink, 10)).toBe(1);
    expect(q.size).toBe(0);
    expect(sink.calls.filter((u) => u.key === 'chunk-edits|a|0|0|0')).toHaveLength(2);
  });
});

describe('RepositorySaveSink integration (in-memory mocks)', () => {
  it('routes each kind of unit into its store', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const metaRepo = new WorldMetadataRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    const chunkRepo = new ChunkSectionRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    const beRepo = new BlockEntityRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    const entRepo = new EntityRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    await Promise.all([metaRepo.open(), chunkRepo.open(), beRepo.open(), entRepo.open()]);

    const sink = new RepositorySaveSink({
      metadata: metaRepo,
      chunkSections: chunkRepo,
      blockEntities: beRepo,
      entities: entRepo,
    });

    const meta: WorldMetadata = {
      schemaVersion: 1,
      worldId: 'a',
      seed: 7,
      dimensionId: 'minecraft:overworld',
      minY: -64,
      height: 384,
      createdAt: 1,
      updatedAt: 1,
    };
    const column = {
      version: 1,
      chunkX: 1,
      chunkZ: 2,
      sectionCount: 1,
      minSectionY: 0,
      sections: { 0: { version: 1, capacity: 4096, bitsPerEntry: 4, palette: [0], storage: [0] } },
    };
    const beEntities = [{ schemaVersion: 1, typeKey: 'minecraft:chest', x: 16, y: 64, z: 32, data: { items: [] } }];
    const entEntities = [{ schemaVersion: 1, typeKey: 'minecraft:zombie', x: 16, y: 65, z: 32, data: { health: 20 } }];

    const q = new DirtySaveQueue();
    q.markDirty({ key: 'meta|a', kind: 'world-metadata', worldId: 'a', chunkX: 0, chunkZ: 0, payload: meta });
    q.markDirty({ key: 'chunk|a|1|2', kind: 'chunk-sections', worldId: 'a', chunkX: 1, chunkZ: 2, payload: column });
    q.markDirty({ key: 'be|a|1|2', kind: 'block-entities', worldId: 'a', chunkX: 1, chunkZ: 2, payload: beEntities });
    q.markDirty({ key: 'ent|a|1|2', kind: 'entities', worldId: 'a', chunkX: 1, chunkZ: 2, payload: entEntities });

    const written = await q.drain(sink, 10);
    expect(written).toBe(4);
    expect(q.size).toBe(0);

    // Each unit landed in the correct store.
    expect(await metaRepo.getMetadata('a')).not.toBeNull();
    expect(await chunkRepo.getColumn('a', 1, 2)).not.toBeNull();
    expect(await beRepo.getChunkEntities('a', 1, 2)).toHaveLength(1);
    expect(await entRepo.getChunkEntities('a', 1, 2)).toHaveLength(1);

    // And all four stores exist on the shared database.
    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_BLOCK_ENTITY_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_ENTITY_STORE)).toBe(true);
  });

  it('a failed write does not clobber a newer markDirty that landed mid-write', async () => {
    const q = new DirtySaveQueue();
    q.markDirty({ key: 'k', kind: 'world-metadata', worldId: 'a', chunkX: 0, chunkZ: 0, payload: 'v1' });

    const sink: SaveSink = {
      write(u: SaveUnit): Promise<void> {
        if (u.payload === 'v1') {
          // The newer snapshot lands while the stale write is in flight.
          q.markDirty({ key: 'k', kind: 'world-metadata', worldId: 'a', chunkX: 0, chunkZ: 0, payload: 'v2' });
          return Promise.reject(new Error('forced failure'));
        }
        return Promise.resolve();
      },
    };

    const written = await q.drain(sink, 10);
    expect(written).toBe(0);
    // The pending unit must be the NEWER snapshot, not the failed stale one.
    expect(q.size).toBe(1);
    const next = await q.drain(sink, 10);
    expect(next).toBe(1);
    expect(q.size).toBe(0);
  });

  it('re-queues a unit when its repository is missing', async () => {
    const q = new DirtySaveQueue();
    q.markDirty({ key: 'meta|a', kind: 'world-metadata', worldId: 'a', chunkX: 0, chunkZ: 0, payload: {} });

    // Sink with no metadata repository -> write rejects.
    const sink = new RepositorySaveSink({});
    const written = await q.drain(sink, 10);
    expect(written).toBe(0);
    expect(q.size).toBe(1);
  });
});
