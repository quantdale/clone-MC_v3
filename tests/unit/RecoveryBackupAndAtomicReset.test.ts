/**
 * 257 blocker A + B: backup completeness and atomic reset.
 * Proves invariant: If reset can delete a world-owned record, successful recovery backup MUST preserve it.
 * Also proves atomic reset leaves world observably equivalent after injected failures.
 */
import { describe, it, expect, vi } from 'vitest';
import { GamePersistence } from '../../src/storage/GamePersistence';
import {
  WorldMetadataRepository,
  type IdbDatabaseLike,
  type IdbFactoryLike,
  type IdbObjectStoreLike,
  type IdbOpenRequestLike,
  type IdbRequestLike,
  type IdbTransactionLike,
} from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { ChunkEditRepository } from '../../src/storage/ChunkEditRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import { WorldArchiver } from '../../src/storage/WorldArchiver';
import { validateWorldArchive, type WorldArchive } from '../../src/storage/WorldArchive';
import { createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { BlockId } from '../../src/world/BlockRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';

const SEED = 771;
const WORLD_ID = `world-${SEED}`;
const FOREIGN_ID = 'world-other';
const REG = createDefaultBlockStateRegistry();

function stoneColumn(cx: number, cz: number, surfaceY: number) {
  const col = new ChunkColumn({
    chunkX: cx,
    chunkZ: cz,
    sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
    minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
    registry: REG,
  });
  col.setBlockState(8, surfaceY, 8, REG.getDefaultState(BlockId.Stone));
  return col.serialize();
}

async function seedCoverage(factory: IdbFactoryLike, worldId: string) {
  const s = new ChunkSectionRepository({ factory });
  await s.open();
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) await s.putColumn(worldId, stoneColumn(dx, dz, 63));
  s.close();
}

async function seedMetadata(factory: IdbFactoryLike, worldId: string) {
  const m = new WorldMetadataRepository({ factory });
  await m.open();
  await m.putMetadata({
    schemaVersion: 1,
    worldId,
    seed: SEED,
    dimensionId: 'minecraft:overworld',
    minY: -64,
    height: 384,
    createdAt: 1000,
    updatedAt: 2000,
    generationVersion: 'test-v1',
  });
  m.close();
}

async function seedPlayer(factory: IdbFactoryLike, worldId: string) {
  const p = new PlayerStateRepository({ factory });
  await p.open();
  await p.putPlayerState({ key: worldId, worldId, seed: SEED, position: [8.5, 65, 8.5], yaw: 0, pitch: 0, inventory: { slots: [] }, survival: { hunger: 20 }, experience: { level: 0 } });
  p.close();
}

async function seedBlockEntities(factory: IdbFactoryLike, worldId: string) {
  const b = new BlockEntityRepository({ factory });
  await b.open();
  await b.putChunkEntities(worldId, 0, 0, [{ schemaVersion: 1, typeKey: 'minecraft:chest', x: 0, y: 64, z: 0, data: { items: [] } }]);
  b.close();
}

async function seedEntities(factory: IdbFactoryLike, worldId: string) {
  const e = new EntityRepository({ factory });
  await e.open();
  await e.putChunkEntities(worldId, 0, 0, [{ schemaVersion: 1, typeKey: 'minecraft:zombie', x: 1, y: 64, z: 1, data: { health: 20 } }]);
  e.close();
}

async function seedChunkEdits(factory: IdbFactoryLike, worldId: string) {
  const c = new ChunkEditRepository({ factory });
  await c.open();
  await c.putChunkEdits(worldId, 0, 0, 0, [[0, 2], [1, 3]]);
  await c.putChunkEdits(worldId, 1, 0, 0, [[5, 1]]);
  c.close();
}

async function seedWither(factory: IdbFactoryLike, worldId: string) {
  const m = new WorldMetadataRepository({ factory });
  await m.open();
  await m.putWitherData(worldId, [{ id: 'w1', x: 10, y: 65, z: 10, health: 300 }]);
  m.close();
}

async function seedForeign(factory: IdbFactoryLike) {
  await seedMetadata(factory, FOREIGN_ID);
  await seedCoverage(factory, FOREIGN_ID);
  await seedPlayer(factory, FOREIGN_ID);
  await seedBlockEntities(factory, FOREIGN_ID);
  await seedEntities(factory, FOREIGN_ID);
  await seedChunkEdits(factory, FOREIGN_ID);
  await seedWither(factory, FOREIGN_ID);
}

class FaultFactory implements IdbFactoryLike {
  constructor(private readonly inner: MockIdbFactory, private readonly faults: Array<{ store: string; op: 'delete' }>) {}
  open(name: string, version?: number): IdbOpenRequestLike {
    const req = this.inner.open(name, version);
    const wrapped: IdbOpenRequestLike = { onupgradeneeded: null, onsuccess: null, onerror: null, result: req.result, error: null };
    queueMicrotask(() => {
      req.onupgradeneeded?.({});
      const baseDb: IdbDatabaseLike = req.result;
      const originalTransaction = baseDb.transaction.bind(baseDb);
      let injected = false;
      const wrappedDb: IdbDatabaseLike = {
        get objectStoreNames() { return baseDb.objectStoreNames; },
        createObjectStore: baseDb.createObjectStore.bind(baseDb),
        close: baseDb.close.bind(baseDb),
        version: baseDb.version,
        transaction: (store: string) => {
          const tx = originalTransaction(store);
          const origStore = tx.objectStore(store);
          const origDelete = origStore.delete.bind(origStore);
          const fakeStore: IdbObjectStoreLike = {
            get: origStore.get.bind(origStore),
            getAll: origStore.getAll.bind(origStore),
            put: origStore.put.bind(origStore),
            delete: (...args: [unknown]) => {
              const key = args[0];
              const isProbe = typeof key === 'string' && key.includes('__probe__');
              let shouldFault = false;
              for (const fault of this.faults) if (fault.store === store && fault.op === 'delete' && !injected && !isProbe) shouldFault = true;
              if (shouldFault) {
                injected = true;
                const fake: IdbRequestLike = {
                  onsuccess: null,
                  onerror: null,
                  result: undefined,
                  error: new Error(`injected delete failure on ${store}`),
                };
                queueMicrotask(() => {
                  fake.onerror?.({});
                });
                return fake;
              }
              return origDelete(...args);
            },
          };
          const origObjectStore = tx.objectStore.bind(tx);
          (tx as IdbTransactionLike).objectStore = (name: string) => (name === store ? fakeStore : origObjectStore(name));
          return tx;
        },
      };
      (wrapped as IdbOpenRequestLike).result = wrappedDb;
      wrapped.onsuccess?.({});
    });
    return wrapped;
  }
}

async function snapshotWorld(factory: IdbFactoryLike, worldId: string) {
  const m = new WorldMetadataRepository({ factory }); await m.open();
  const meta = await m.getMetadata(worldId);
  const wither = await m.getWitherData(worldId).catch(()=>null);
  m.close();
  const s = new ChunkSectionRepository({ factory }); await s.open(); const cols = await s.listColumns(worldId); s.close();
  const ce = new ChunkEditRepository({ factory }); await ce.open(); const edits = await ce.listChunkEdits(worldId); ce.close();
  const p = new PlayerStateRepository({ factory }); await p.open(); const ps = await p.getPlayerState(worldId); p.close();
  const b = new BlockEntityRepository({ factory }); await b.open(); const bes = await b.listChunks(worldId); b.close();
  const e = new EntityRepository({ factory }); await e.open(); const es = await e.listChunks(worldId); e.close();
  return { meta, wither, cols, edits, ps, bes, es };
}

function normalizeMeta<T extends { updatedAt?: unknown; createdAt?: unknown } | null | undefined>(m: T) {
  if (!m) return m;
  const { updatedAt, createdAt, ...rest } = m;
  void updatedAt; void createdAt;
  return rest;
}
function worldEqual(a: Awaited<ReturnType<typeof snapshotWorld>>, b: Awaited<ReturnType<typeof snapshotWorld>>): boolean {
  // Compare ignoring updatedAt timestamps which are refreshed on putMetadata
  const an = { ...a, meta: normalizeMeta(a.meta) };
  const bn = { ...b, meta: normalizeMeta(b.meta) };
  // Also normalize chunkEdits ordering? Already deterministic
  return JSON.stringify(an) === JSON.stringify(bn);
}

describe('257 blocker A: complete backup', () => {
  it('export backup preserves every world-owned record and excludes foreign world', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    await seedPlayer(factory, WORLD_ID);
    await seedBlockEntities(factory, WORLD_ID);
    await seedEntities(factory, WORLD_ID);
    await seedChunkEdits(factory, WORLD_ID);
    await seedWither(factory, WORLD_ID);
    await seedForeign(factory);

    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const backup = await p.exportWorldBackup();
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;
    // SAFETY: `backup.json` is the archive this test just produced, so the parsed
    // value is a WorldArchive; validateWorldArchive covers the rejection cases.
    const archive = JSON.parse(backup.json) as WorldArchive;
    expect(archive.worldId).toBe(WORLD_ID);
    expect(archive.metadata).not.toBeNull();
    expect(archive.columns.length).toBe(25);
    expect(archive.blockEntityChunks.length).toBe(1);
    expect(archive.entityChunks.length).toBe(1);
    expect(archive.chunkEdits.length).toBe(2);
    expect(archive.witherData).not.toBeNull();
    expect(Array.isArray(archive.witherData)).toBe(true);
    // Narrow through the array check rather than asserting on a possibly-null value.
    const witherRows = archive.witherData as unknown[];
    expect(witherRows.length).toBe(1);
    // No foreign data leaked
    expect(JSON.stringify(archive).includes(FOREIGN_ID)).toBe(false);
    validateWorldArchive(archive);

    // Reset original world
    const reset = await p.resetCurrentWorld();
    expect(reset.ok).toBe(true);

    // Foreign still intact after reset
    const foreignAfter = await snapshotWorld(factory, FOREIGN_ID);
    expect(foreignAfter.meta).not.toBeNull();
    expect(foreignAfter.cols.length).toBe(25);

    // Original world now empty
    const afterReset = await snapshotWorld(factory, WORLD_ID);
    expect(afterReset.meta).toBeNull();
    expect(afterReset.cols.length).toBe(0);
    expect(afterReset.edits.length).toBe(0);

    // Import restores semantic equivalence
    const archiver = new WorldArchiver({
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
      chunkEdits: new ChunkEditRepository({ factory }),
    });
    void archiver;
    const importer = new WorldArchiver({
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
      chunkEdits: new ChunkEditRepository({ factory }),
    });
    await importer.importWorld(archive);
    const restored = await snapshotWorld(factory, WORLD_ID);
    // Check counts match original snapshot taken before reset (we saved via archive, not via snapshot, but we can compare to expected counts)
    expect(restored.meta?.worldId).toBe(WORLD_ID);
    expect(restored.cols.length).toBe(25);
    expect(restored.edits.length).toBe(2);
    expect(restored.bes.length).toBe(1);
    expect(restored.es.length).toBe(1);
    expect(restored.ps).not.toBeNull();
    expect(restored.wither).not.toBeNull();
    expect((restored.wither as unknown[]).length).toBe(1);

    // Foreign still untouched after import
    const foreignAfterImport = await snapshotWorld(factory, FOREIGN_ID);
    expect(foreignAfterImport.meta?.worldId).toBe(FOREIGN_ID);
    expect(foreignAfterImport.cols.length).toBe(25);

    await p.dispose();
  });

  it('malformed archive validation fails before partial writes', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const backup = await p.exportWorldBackup();
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;
    // SAFETY: `backup.json` is the archive this test just produced, so the parsed
    // value is a WorldArchive; validateWorldArchive covers the rejection cases.
    const archive = JSON.parse(backup.json) as WorldArchive;
    // Tamper with chunkEdits to be malformed
    archive.chunkEdits = [{ chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[999999, 1]] }]; // out of range index
    const freshFactory = createIdbFactoryMock();
    const freshArchiver = new WorldArchiver({
      metadata: new WorldMetadataRepository({ factory: freshFactory }),
      chunkSections: new ChunkSectionRepository({ factory: freshFactory }),
      blockEntities: new BlockEntityRepository({ factory: freshFactory }),
      entities: new EntityRepository({ factory: freshFactory }),
      playerStates: new PlayerStateRepository({ factory: freshFactory }),
      chunkEdits: new ChunkEditRepository({ factory: freshFactory }),
    });
    await expect(freshArchiver.importWorld(archive)).rejects.toThrow();
    // Fresh world remains empty (no partial writes)
    const after = await snapshotWorld(freshFactory, WORLD_ID);
    expect(after.meta).toBeNull();
    expect(after.cols.length).toBe(0);
    expect(after.edits.length).toBe(0);
    await p.dispose();
  });
});

describe('257 blocker B: atomic reset with rollback equivalence', () => {
  it('preserves unsaved edits when reset fails', async () => {
    const inner = createIdbFactoryMock();
    await seedMetadata(inner, WORLD_ID);
    await seedCoverage(inner, WORLD_ID);
    const faultFactory = new FaultFactory(inner, [{ store: 'world-metadata', op: 'delete' }]);
    const p = new GamePersistence({ seed: SEED, factory: faultFactory as unknown as IdbFactoryLike, legacyStorage: null });
    await p.open();
    try {
      p.captureChunkEdits(3, 0, 4, new Map([[1, 3]]));
      expect(p.pendingCount).toBeGreaterThan(0);
      const result = await p.resetCurrentWorld();
      expect(result.ok).toBe(false);
      expect(p.restorePendingChunkEdits(3, 0, 4)?.get(1)).toBe(3);
      expect(p.pendingCount).toBeGreaterThan(0);
      const flushed = await p.flush();
      expect(flushed.failed).toBe(0);
      expect(await p.loadCommittedChunkEdits(3, 0, 4)).toContainEqual([1, 3]);
    } finally {
      await p.dispose();
    }
  });

  it('keeps existing and newly marked edits after a snapshot failure', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const spy = vi.spyOn(metadata, 'getMetadata').mockImplementation(async () => {
      started();
      await gate;
      throw new Error('forced snapshot failure');
    });
    try {
      p.captureChunkEdits(3, 0, 4, new Map([[1, 3]]));
      const reset = p.resetCurrentWorld();
      await reading;
      p.captureChunkEdits(5, 0, 6, new Map([[2, 4]]));
      release();
      expect((await reset).ok).toBe(false);
      expect(p.restorePendingChunkEdits(3, 0, 4)?.get(1)).toBe(3);
      expect(p.restorePendingChunkEdits(5, 0, 6)?.get(2)).toBe(4);
      spy.mockRestore();
      expect((await p.flush()).failed).toBe(0);
      expect(await p.loadCommittedChunkEdits(3, 0, 4)).toContainEqual([1, 3]);
      expect(await p.loadCommittedChunkEdits(5, 0, 6)).toContainEqual([2, 4]);
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('does not report a second flush complete or discard its overlay while a write is in flight', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const edits = (p as unknown as { chunkEdits: ChunkEditRepository }).chunkEdits;
    const put = edits.putChunkEdits.bind(edits);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { started = resolve; });
    const spy = vi.spyOn(edits, 'putChunkEdits').mockImplementation(async (...args) => {
      started();
      await gate;
      return put(...args);
    });
    try {
      p.captureChunkEdits(3, 0, 4, new Map([[1, 3]]));
      const first = p.flush();
      await writing;
      let completed = false;
      const second = p.flush().then((result) => { completed = true; return result; });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const completedBeforeRelease = completed;
      const overlayBeforeRelease = p.restorePendingChunkEdits(3, 0, 4)?.get(1);
      release();
      expect((await first).failed).toBe(0);
      expect((await second).failed).toBe(0);
      expect(await p.loadCommittedChunkEdits(3, 0, 4)).toContainEqual([1, 3]);
      expect(overlayBeforeRelease).toBe(3);
      expect(completedBeforeRelease).toBe(false);
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('keeps the overlay and reports failure when concurrent flushes encounter a persistent write failure', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const edits = (p as unknown as { chunkEdits: ChunkEditRepository }).chunkEdits;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { started = resolve; });
    let attempts = 0;
    const spy = vi.spyOn(edits, 'putChunkEdits').mockImplementation(async () => {
      attempts++;
      if (attempts === 1) { started(); await gate; }
      throw new Error('persistent write failure');
    });
    try {
      p.captureChunkEdits(3, 0, 4, new Map([[1, 3]]));
      const first = p.flush();
      await writing;
      const second = p.flush();
      release();
      const [a, b] = await Promise.all([first, second]);
      expect(a.failed).toBeGreaterThan(0);
      expect(b.failed).toBeGreaterThan(0);
      expect(p.restorePendingChunkEdits(3, 0, 4)?.get(1)).toBe(3);
      expect(p.pendingCount).toBeGreaterThan(0);
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('waits for an in-flight queued write before resetting the world', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const edits = (p as unknown as { chunkEdits: ChunkEditRepository }).chunkEdits;
    const put = edits.putChunkEdits.bind(edits);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { started = resolve; });
    const spy = vi.spyOn(edits, 'putChunkEdits').mockImplementation(async (...args) => {
      started();
      await gate;
      return put(...args);
    });
    try {
      p.captureChunkEdits(3, 0, 4, new Map([[1, 3]]));
      const flush = p.flush();
      await writing;
      let completed = false;
      const reset = p.resetCurrentWorld().then((result) => { completed = true; return result; });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const completedBeforeRelease = completed;
      release();
      await flush;
      expect((await reset).ok).toBe(true);
      const reader = new ChunkEditRepository({ factory });
      await reader.open();
      try {
        expect(await reader.getChunkEdits(WORLD_ID, 3, 0, 4)).toBeNull();
      } finally {
        reader.close();
      }
      expect(completedBeforeRelease).toBe(false);
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('waits for an in-flight raw metadata save before resetting the world', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    const put = metadata.putGameModeData.bind(metadata);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { started = resolve; });
    let finished!: () => void;
    const written = new Promise<void>((resolve) => { finished = resolve; });
    const spy = vi.spyOn(metadata, 'putGameModeData').mockImplementation(async (...args) => {
      started();
      await gate;
      try {
        return await put(...args);
      } finally {
        finished();
      }
    });
    try {
      p.saveGameMode({ mode: 'creative' });
      await writing;
      let completed = false;
      const reset = p.resetCurrentWorld().then((result) => { completed = true; return result; });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const completedBeforeRelease = completed;
      release();
      expect((await reset).ok).toBe(true);
      await written;
      expect(await metadata.getGameModeData(WORLD_ID)).toBeNull();
      expect(completedBeforeRelease).toBe(false);
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('defers raw saves during a failed reset and retries the latest value', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const spy = vi.spyOn(metadata, 'getMetadata').mockImplementation(async () => {
      started();
      await gate;
      throw new Error('forced snapshot failure');
    });
    try {
      const reset = p.resetCurrentWorld();
      await reading;
      p.saveGameMode({ mode: 'creative' });
      p.saveGameMode({ mode: 'adventure' });
      expect(await metadata.getGameModeData(WORLD_ID)).toBeNull();
      release();
      expect((await reset).ok).toBe(false);
      spy.mockRestore();
      await vi.waitFor(async () => {
        expect(await metadata.getGameModeData(WORLD_ID)).toEqual({ mode: 'adventure' });
      });
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('snapshots a deferred raw payload at the time it is saved', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const spy = vi.spyOn(metadata, 'getMetadata').mockImplementation(async () => {
      started(); await gate; throw new Error('forced snapshot failure');
    });
    try {
      const reset = p.resetCurrentWorld();
      await reading;
      const payload = { mode: 'creative' };
      p.saveGameMode(payload);
      payload.mode = 'adventure';
      release();
      expect((await reset).ok).toBe(false);
      spy.mockRestore();
      await vi.waitFor(async () => {
        expect(await metadata.getGameModeData(WORLD_ID)).toEqual({ mode: 'creative' });
      });
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('defers and retries every direct raw save kind after reset failure', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const snapshotSpy = vi.spyOn(metadata, 'getMetadata').mockImplementation(async () => {
      started();
      await gate;
      throw new Error('forced snapshot failure');
    });
    const writes = [
      vi.spyOn(metadata, 'putWitherData'), vi.spyOn(metadata, 'putItemEntityData'),
      vi.spyOn(metadata, 'putGameModeData'), vi.spyOn(metadata, 'putHardcoreData'),
      vi.spyOn(metadata, 'putDifficultyData'), vi.spyOn(metadata, 'putStatisticData'),
      vi.spyOn(metadata, 'putSleepData'), vi.spyOn(metadata, 'putWeatherData'),
      vi.spyOn(metadata, 'putTradingData'), vi.spyOn(metadata, 'putRaidData'),
      vi.spyOn(metadata, 'putXpOrbData'), vi.spyOn(metadata, 'putAdvancementData'),
      vi.spyOn(metadata, 'putRecipeBookData'), vi.spyOn(metadata, 'putGameRuleData'),
    ];
    try {
      const reset = p.resetCurrentWorld();
      await reading;
      p.saveWithers([]); p.saveItemEntities([]); p.saveGameMode({ mode: 'creative' });
      p.saveHardcore({}); p.saveDifficulty({}); p.saveStatistics({}); p.saveSleep({});
      p.saveWeather({}); p.saveTrading({}); p.saveRaid({}); p.saveXpOrbs([]);
      p.saveAdvancements({}); p.saveRecipeBook({}); p.saveGameRules({});
      for (const write of writes) expect(write).not.toHaveBeenCalled();
      release();
      expect((await reset).ok).toBe(false);
      await vi.waitFor(() => {
        for (const write of writes) expect(write).toHaveBeenCalledTimes(1);
        expect((p as unknown as { rawWrites: Map<unknown, unknown> }).rawWrites.size).toBe(0);
      });
    } finally {
      release();
      snapshotSpy.mockRestore();
      for (const write of writes) write.mockRestore();
      await p.dispose();
    }
  });

  it('keeps only the latest deferred raid save or deletion after reset failure', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const snapshotSpy = vi.spyOn(metadata, 'getMetadata').mockImplementation(async () => {
      started(); await gate; throw new Error('forced snapshot failure');
    });
    const put = vi.spyOn(metadata, 'putRaidData');
    const remove = vi.spyOn(metadata, 'deleteRaw');
    try {
      const reset = p.resetCurrentWorld();
      await reading;
      p.saveRaid({ marker: 'old' });
      p.saveRaid(null);
      expect(put).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      release();
      expect((await reset).ok).toBe(false);
      await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
      expect(put).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalledWith(`__raid__:${WORLD_ID}`);
      await vi.waitFor(() => expect((p as unknown as { rawWrites: Map<unknown, unknown> }).rawWrites.size).toBe(0));
    } finally {
      release();
      snapshotSpy.mockRestore(); put.mockRestore(); remove.mockRestore();
      await p.dispose();
    }
  });

  it('does not write deferred raw saves after a successful reset', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    const get = metadata.getMetadata.bind(metadata);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const spy = vi.spyOn(metadata, 'getMetadata').mockImplementation(async (...args) => {
      started();
      await gate;
      return get(...args);
    });
    try {
      const reset = p.resetCurrentWorld();
      await reading;
      p.saveGameMode({ mode: 'creative' });
      expect(await metadata.getGameModeData(WORLD_ID)).toBeNull();
      release();
      expect((await reset).ok).toBe(true);
      expect(await metadata.getGameModeData(WORLD_ID)).toBeNull();
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('aborts reset and retries an in-flight raw write that fails', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    const put = metadata.putGameModeData.bind(metadata);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { started = resolve; });
    let attempts = 0;
    const spy = vi.spyOn(metadata, 'putGameModeData').mockImplementation(async (...args) => {
      attempts++;
      if (attempts === 1) {
        started();
        await gate;
        throw new Error('forced raw save failure');
      }
      return put(...args);
    });
    try {
      p.saveGameMode({ mode: 'creative' });
      await writing;
      const reset = p.resetCurrentWorld();
      release();
      const result = await reset;
      expect(result.ok).toBe(false);
      expect(p.isResetCompleted).toBe(false);
      await vi.waitFor(async () => {
        expect(await metadata.getGameModeData(WORLD_ID)).toEqual({ mode: 'creative' });
      });
      expect(await metadata.getMetadata(WORLD_ID)).not.toBeNull();
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('keeps the latest raw save when an earlier write completes late', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    const put = metadata.putGameModeData.bind(metadata);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { started = resolve; });
    let attempts = 0;
    const spy = vi.spyOn(metadata, 'putGameModeData').mockImplementation(async (...args) => {
      attempts++;
      if (attempts === 1) { started(); await gate; }
      return put(...args);
    });
    try {
      p.saveGameMode({ mode: 'creative' });
      await writing;
      p.saveGameMode({ mode: 'adventure' });
      await new Promise((resolve) => setTimeout(resolve, 50));
      release();
      await vi.waitFor(() => expect((p as unknown as { rawWrites: Map<unknown, unknown> }).rawWrites.size).toBe(0));
      expect(await metadata.getGameModeData(WORLD_ID)).toEqual({ mode: 'adventure' });
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('prefers a newer deferred raw save over an older in-flight failure', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    const put = metadata.putGameModeData.bind(metadata);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { started = resolve; });
    let attempts = 0;
    const spy = vi.spyOn(metadata, 'putGameModeData').mockImplementation(async (...args) => {
      attempts++;
      if (attempts === 1) { started(); await gate; throw new Error('forced raw save failure'); }
      return put(...args);
    });
    try {
      p.saveGameMode({ mode: 'creative' });
      await writing;
      const reset = p.resetCurrentWorld();
      p.saveGameMode({ mode: 'adventure' });
      release();
      expect((await reset).ok).toBe(false);
      await vi.waitFor(async () => {
        expect(await metadata.getGameModeData(WORLD_ID)).toEqual({ mode: 'adventure' });
      });
      expect(attempts).toBe(2);
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('discards new queued edits only when the reset succeeds', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    const get = metadata.getMetadata.bind(metadata);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const spy = vi.spyOn(metadata, 'getMetadata').mockImplementation(async (...args) => {
      started();
      await gate;
      return get(...args);
    });
    try {
      p.captureChunkEdits(3, 0, 4, new Map([[1, 3]]));
      const reset = p.resetCurrentWorld();
      await reading;
      p.captureChunkEdits(5, 0, 6, new Map([[2, 4]]));
      release();
      expect((await reset).ok).toBe(true);
      expect(p.pendingCount).toBe(0);
      expect(p.restorePendingChunkEdits(3, 0, 4)).toBeNull();
      expect(p.restorePendingChunkEdits(5, 0, 6)).toBeNull();
      const reader = new ChunkEditRepository({ factory });
      await reader.open();
      try {
        expect(await reader.getChunkEdits(WORLD_ID, 3, 0, 4)).toBeNull();
        expect(await reader.getChunkEdits(WORLD_ID, 5, 0, 6)).toBeNull();
      } finally {
        reader.close();
      }
    } finally {
      release();
      spy.mockRestore();
      await p.dispose();
    }
  });

  it('coalesces concurrent reset requests into one destructive transaction', async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID);
    await seedCoverage(factory, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await p.open();
    const metadata = (p as unknown as { metadata: WorldMetadataRepository }).metadata;
    const get = metadata.getMetadata.bind(metadata);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const snapshotSpy = vi.spyOn(metadata, 'getMetadata').mockImplementation(async (...args) => {
      started();
      await gate;
      return get(...args);
    });
    const transactionSpy = vi.spyOn(metadata, 'runInTransaction');
    try {
      const first = p.resetCurrentWorld();
      await reading;
      const second = p.resetCurrentWorld();
      release();
      expect((await first).ok).toBe(true);
      expect((await second).ok).toBe(true);
      expect(transactionSpy).toHaveBeenCalledTimes(1);
    } finally {
      release();
      snapshotSpy.mockRestore();
      transactionSpy.mockRestore();
      await p.dispose();
    }
  });

  const stages: Array<{ store: string; label: string }> = [
    { store: 'world-metadata', label: 'metadata delete' },
    { store: 'chunk-sections', label: 'column delete' },
    { store: 'chunk-edits', label: 'edit delete' },
    { store: 'player-state', label: 'player delete' },
    { store: 'block-entities', label: 'blockEntity delete' },
    { store: 'entities', label: 'entity delete' },
  ];
  for (const stage of stages) {
    it(`injected failure at ${stage.label} preserves world equivalence and reports failure`, async () => {
      const inner = createIdbFactoryMock();
      await seedMetadata(inner, WORLD_ID);
      await seedCoverage(inner, WORLD_ID);
      await seedPlayer(inner, WORLD_ID);
      await seedBlockEntities(inner, WORLD_ID);
      await seedEntities(inner, WORLD_ID);
      await seedChunkEdits(inner, WORLD_ID);
      await seedWither(inner, WORLD_ID);
      await seedForeign(inner);
      const before = await snapshotWorld(inner, WORLD_ID);
      const foreignBefore = await snapshotWorld(inner, FOREIGN_ID);
      const faultFactory = new FaultFactory(inner, [{ store: stage.store, op: 'delete' }]);
      const p = new GamePersistence({
        seed: SEED,
        factory: faultFactory as unknown as IdbFactoryLike,
        legacyStorage: null,
      });
      await p.open();
      const result = await p.resetCurrentWorld();
      expect(result.ok).toBe(false);
      expect(p.isResetCompleted).toBe(false);
      const after = await snapshotWorld(inner, WORLD_ID);
      expect(worldEqual(before, after)).toBe(true);
      const foreignAfter = await snapshotWorld(inner, FOREIGN_ID);
      expect(worldEqual(foreignBefore, foreignAfter)).toBe(true);
      await p.dispose();
      // Retry without fault should succeed and preserve idempotency.
      // Re-seed a fresh clean DB with equivalent world data.
      const retryFactory = createIdbFactoryMock();
      await seedMetadata(retryFactory, WORLD_ID);
      await seedCoverage(retryFactory, WORLD_ID);
      await seedPlayer(retryFactory, WORLD_ID);
      await seedBlockEntities(retryFactory, WORLD_ID);
      await seedEntities(retryFactory, WORLD_ID);
      await seedChunkEdits(retryFactory, WORLD_ID);
      await seedWither(retryFactory, WORLD_ID);
      const p2 = new GamePersistence({ seed: SEED, factory: retryFactory, legacyStorage: null });
      await p2.open();
      const retry = await p2.resetCurrentWorld();
      expect(retry.ok).toBe(true);
      const afterRetry = await snapshotWorld(retryFactory, WORLD_ID);
      expect(afterRetry.meta).toBeNull();
      expect(afterRetry.cols.length).toBe(0);
      await p2.dispose();
    });
  }

  it('successful reset is idempotent on retry', async () => {
    const f = createIdbFactoryMock();
    await seedMetadata(f, WORLD_ID);
    await seedCoverage(f, WORLD_ID);
    const p = new GamePersistence({ seed: SEED, factory: f, legacyStorage: null });
    await p.open();
    const first = await p.resetCurrentWorld();
    expect(first.ok).toBe(true);
    const second = await p.resetCurrentWorld();
    expect(second.ok).toBe(true);
    await p.dispose();
  });
});
