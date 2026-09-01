/**
 * 257 blocker A + B: backup completeness and atomic reset.
 * Proves invariant: If reset can delete a world-owned record, successful recovery backup MUST preserve it.
 * Also proves atomic reset leaves world observably equivalent after injected failures.
 */
import { describe, it, expect } from 'vitest';
import { GamePersistence } from '../../src/storage/GamePersistence';
import { WorldMetadataRepository, type IdbFactoryLike, type IdbOpenRequestLike } from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { ChunkEditRepository } from '../../src/storage/ChunkEditRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import { WorldArchiver } from '../../src/storage/WorldArchiver';
import { validateWorldArchive } from '../../src/storage/WorldArchive';
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
      const baseDb = req.result as any;
      const originalTransaction = baseDb.transaction.bind(baseDb);
      let injected = false;
      const wrappedDb: any = {
        get objectStoreNames() { return baseDb.objectStoreNames; },
        createObjectStore: baseDb.createObjectStore.bind(baseDb),
        close: baseDb.close.bind(baseDb),
        version: baseDb.version,
        transaction: (store: string) => {
          const tx = originalTransaction(store);
          const origStore = tx.objectStore(store) as any;
          const origDelete = origStore.delete.bind(origStore);
          const fakeStore: any = {
            get: origStore.get.bind(origStore),
            getAll: origStore.getAll.bind(origStore),
            put: origStore.put.bind(origStore),
            delete: (...args: any[]) => {
              const key = args[0];
              const isProbe = typeof key === 'string' && key.includes('__probe__');
              let shouldFault = false;
              for (const fault of this.faults) if (fault.store === store && fault.op === 'delete' && !injected && !isProbe) shouldFault = true;
              if (shouldFault) {
                injected = true;
                const fake: any = { onsuccess: null as any, onerror: null as any, result: undefined, error: new Error(`injected delete failure on ${store}`) };
                queueMicrotask(() => {
                  fake.onerror?.({});
                });
                return fake;
              }
              return origDelete(...args);
            },
          };
          const origObjectStore = tx.objectStore.bind(tx);
          (tx as any).objectStore = (name: string) => (name === store ? fakeStore : origObjectStore(name));
          return tx;
        },
      };
      (wrapped as any).result = wrappedDb;
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

function normalizeMeta(m: any) {
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
    const archive: any = JSON.parse(backup.json);
    expect(archive.worldId).toBe(WORLD_ID);
    expect(archive.metadata).not.toBeNull();
    expect(archive.columns.length).toBe(25);
    expect(archive.blockEntityChunks.length).toBe(1);
    expect(archive.entityChunks.length).toBe(1);
    expect(archive.chunkEdits.length).toBe(2);
    expect(archive.witherData).not.toBeNull();
    expect(Array.isArray(archive.witherData)).toBe(true);
    expect(archive.witherData.length).toBe(1);
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
    expect((restored.wither as any[]).length).toBe(1);

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
    const archive: any = JSON.parse(backup.json);
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
      const p = new GamePersistence({ seed: SEED, factory: faultFactory as any, legacyStorage: null });
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
