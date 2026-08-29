/**
 * Production composition test (249-DL-001 / 249-DL-005): proves the SHIPPED
 * wiring end-to-end at component level — the real `GamePersistence` facade over
 * an in-memory IndexedDB mock, a real `World` wired with
 * `editDurability: persistence`, legacy migration of a ≥4096-cell edit,
 * zero-loss reload through a second facade instance, and quota fault injection
 * with verified recovery. No DOM/Game construction (Renderer needs WebGL).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GamePersistence,
  type GamePersistenceFlushResult,
} from '../../src/storage/GamePersistence';
import { LEGACY_EDIT_STORAGE_PREFIX, LEGACY_STATE_STORAGE_PREFIX } from '../../src/storage/LegacyLocalStorageMigrator';
import type { IdbFactoryLike, IdbObjectStoreLike, IdbOpenRequestLike, IdbRequestLike } from '../../src/storage/WorldMetadataRepository';
import type { TimerLike } from '../../src/storage/AutosaveCoordinator';
import { createIdbFactoryMock } from './IdbFactoryMock';
import { World } from '../../src/world/World';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { CONFIG } from '../../src/config';

// -----------------------------------------------------------------------------------------
// Test doubles (mirrors tests/unit/GamePersistence.test.ts)
// -----------------------------------------------------------------------------------------

/** Map-backed StorageLike pre-seeded with legacy payloads. */
function makeLegacyStorage(entries: Record<string, string>): { getItem(key: string): string | null } {
  const map = new Map(Object.entries(entries));
  return { getItem: (key: string) => map.get(key) ?? null };
}

/** Timer double that never fires (keeps the coordinator/recovery probe inert). */
const inertTimer: TimerLike = {
  setInterval(): unknown {
    return 0;
  },
  clearInterval(): void {
    // no-op
  },
};

function namedError(name: string): Error {
  const e = new Error(`${name} injected`);
  e.name = name;
  return e;
}

function rejectingRequest(error: Error): IdbRequestLike {
  const req: IdbRequestLike = { onsuccess: null, onerror: null, result: undefined, error };
  queueMicrotask(() => req.onerror?.({}));
  return req;
}

/**
 * Fault-injecting factory wrapper: arms per-store put rejections so chunk-edit
 * writes can be made to fail and later heal.
 */
class FaultIdbFactory implements IdbFactoryLike {
  private readonly inner = createIdbFactoryMock();
  private faultStore: string | null = null;
  private faultError: Error | null = null;

  arm(store: string, errorName: string): void {
    this.faultStore = store;
    this.faultError = namedError(errorName);
  }

  disarm(): void {
    this.faultStore = null;
    this.faultError = null;
  }

  open(name: string, version?: number): IdbOpenRequestLike {
    const req = this.inner.open(name, version);
    const db = req.result;
    req.result = {
      objectStoreNames: db.objectStoreNames,
      createObjectStore: (n: string, o?: { keyPath: string }) => db.createObjectStore(n, o),
      transaction: (store: string, mode?: 'readonly' | 'readwrite') => ({
        objectStore: (): IdbObjectStoreLike => this.wrapStore(store, db.transaction(store, mode).objectStore(store)),
      }),
      close: (): void => db.close(),
    };
    return req;
  }

  private wrapStore(store: string, inner: IdbObjectStoreLike): IdbObjectStoreLike {
    return {
      put: (value: unknown) => {
        if (this.faultStore === store && this.faultError) {
          return rejectingRequest(this.faultError);
        }
        return inner.put(value);
      },
      get: (key: unknown) => inner.get(key),
      getAll: () => inner.getAll(),
      delete: (key: unknown) => inner.delete(key),
    };
  }
}

// -----------------------------------------------------------------------------------------
// Fixtures + harness
// -----------------------------------------------------------------------------------------

const SEED = 424242;
/** Legacy edit at local index ≥ 4096 (the historical silent-truncation cell). */
const LEGACY_CHUNK: [number, number, number] = [1, 0, 2];
const LEGACY_INDEX = 4200; // lx=8, lz=6, ly=16 — above the old 16³ section cap
const LEGACY_ID = 3;
const POST_BOOT_EDITS = 600;
/** localIndex(lx=3, ly=5, lz=4) = lx + lz*16 + ly*256. */
const EDIT_LOCAL_INDEX = 3 + 4 * 16 + 5 * 256;

function makeWorld(seed: number, durability?: GamePersistence): World {
  const registry = createDefaultBlockRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    seed,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 2,
    editDurability: durability,
  });
}

/** The shipped facade composition with injectable seams and inert timers. */
function makeFacade(factory: IdbFactoryLike, legacyStorage: { getItem(key: string): string | null } | null): GamePersistence {
  return new GamePersistence({
    seed: SEED,
    factory,
    legacyStorage,
    timer: inertTimer,
    flushTarget: null,
    intervalMs: 5,
  });
}

/** Drive `count` distinct-chunk edits through the real World bridge. */
function driveEdits(world: World, count: number, startChunk = 10): void {
  for (let i = 0; i < count; i++) {
    const cx = startChunk + (i % 25);
    const cz = startChunk + Math.floor(i / 25);
    world.setBlock(cx * 16 + 3, 5, cz * 16 + 4, BlockId.Sand);
  }
}

/** Expected overlay per chunk key after the full scenario (legacy + post-boot). */
function expectedEdits(): Map<string, Map<number, number>> {
  const expected = new Map<string, Map<number, number>>();
  const legacy = new Map<number, number>([[0, 1], [LEGACY_INDEX, LEGACY_ID]]);
  expected.set(`${LEGACY_CHUNK[0]},${LEGACY_CHUNK[1]},${LEGACY_CHUNK[2]}`, legacy);
  for (let i = 0; i < POST_BOOT_EDITS; i++) {
    const cx = 10 + (i % 25);
    const cz = 10 + Math.floor(i / 25);
    const key = `${cx},0,${cz}`;
    const map = expected.get(key) ?? new Map<number, number>();
    map.set(EDIT_LOCAL_INDEX, BlockId.Sand); // localIndex(lx=3, ly=5, lz=4)
    expected.set(key, map);
  }
  return expected;
}

/** Canonical equality of a snapshot's edits against the expectation map. */
function expectCanonicalEquality(snapshot: { seed: number; edits: Array<{ chunk: [number, number, number]; changes: Array<[number, number]> }> } | null): void {
  expect(snapshot).not.toBeNull();
  expect(snapshot!.seed).toBe(SEED);
  const expected = expectedEdits();
  expect(snapshot!.edits.length).toBe(expected.size);
  for (const entry of snapshot!.edits) {
    const key = `${entry.chunk[0]},${entry.chunk[1]},${entry.chunk[2]}`;
    const want = expected.get(key);
    expect(want, `unexpected chunk ${key}`).toBeDefined();
    expect(new Map(entry.changes)).toEqual(want);
  }
}

// -----------------------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------------------

describe('production composition (facade + real World)', () => {
  it('migrates legacy state, captures live edits durably, and reloads with zero loss', async () => {
    const factory = createIdbFactoryMock();
    const legacyStorage = makeLegacyStorage({
      [`${LEGACY_EDIT_STORAGE_PREFIX}${SEED}`]: JSON.stringify({
        version: 1,
        seed: SEED,
        edits: [
          { chunk: LEGACY_CHUNK, changes: [[0, 1], [LEGACY_INDEX, LEGACY_ID]] },
        ],
      }),
      [`${LEGACY_STATE_STORAGE_PREFIX}${SEED}`]: JSON.stringify({
        version: 1,
        seed: SEED,
        player: { position: [1.5, 64, 2.5], yaw: 45, pitch: -30 },
        inventory: { slots: [] },
        survival: { hunger: 20 },
      }),
    });

    // Boot 1: open migrates the legacy payload into the durable stack.
    const p1 = makeFacade(factory, legacyStorage);
    const open1 = await p1.open();
    expect(open1.status).toBe('ok');
    expect(open1.errors).toEqual([]);
    expect(open1.initialEdits?.edits).toEqual([
      { chunk: LEGACY_CHUNK, changes: [[0, 1], [LEGACY_INDEX, LEGACY_ID]] },
    ]);
    expect(open1.initialPlayerState?.player.position).toEqual([1.5, 64, 2.5]);

    // A real World hands every committed edit to the facade.
    const world1 = makeWorld(SEED, p1);
    driveEdits(world1, POST_BOOT_EDITS);
    expect(p1.pendingCount).toBeGreaterThan(0);
    // Pending copy of the last-edited chunk is synchronously available.
    const lastCx = 10 + ((POST_BOOT_EDITS - 1) % 25);
    const lastCz = 10 + Math.floor((POST_BOOT_EDITS - 1) / 25);
    expect(p1.restorePendingChunkEdits(lastCx, 0, lastCz)?.get(EDIT_LOCAL_INDEX)).toBe(BlockId.Sand);

    const flush: GamePersistenceFlushResult = await p1.flush();
    expect(flush.committed).toBeGreaterThanOrEqual(1);
    expect(flush.failed).toBe(0);
    expect(flush.health).toBe('ok');
    expect(p1.pendingCount).toBe(0);
    expect(await p1.loadCommittedChunkEdits(lastCx, 0, lastCz)).toEqual([
      [EDIT_LOCAL_INDEX, BlockId.Sand],
    ]);

    // Boot 2 (reload simulation): same factory → marker present → migration
    // skipped; the fresh World re-imports the bulk-loaded committed state.
    const p2 = makeFacade(factory, legacyStorage);
    const open2 = await p2.open();
    expect(open2.status).toBe('ok');
    expect(open2.migrationReport).toBeNull(); // skipped via durable marker
    expect(open2.initialEdits?.edits.length).toBe(POST_BOOT_EDITS + 1);

    const world2 = makeWorld(SEED);
    const accepted = world2.importEdits(open2.initialEdits);
    expect(accepted).toBeGreaterThan(0);
    expectCanonicalEquality(world2.exportEdits());

    await p1.dispose();
    await p2.dispose();
  }, 20000);

  it('converts the complete legacy payload into canonical negative/high sections exactly once', async () => {
    const factory = createIdbFactoryMock();
    const legacyStorage = makeLegacyStorage({
      [`${LEGACY_EDIT_STORAGE_PREFIX}${SEED}`]: JSON.stringify({
        version: 1,
        seed: SEED,
        edits: [
          // One legacy column with edits in chunkY -1, 0, and +1. These cells
          // exercise canonical world Y -64, -1, 0, and 64 after conversion.
          { chunk: [-2, -1, -3], changes: [[0, BlockId.Stone], [16241, BlockId.Sand]] },
          { chunk: [-2, 0, -3], changes: [[0, BlockId.Bricks]] },
          { chunk: [-2, 1, -3], changes: [[0, BlockId.Glass]] },
        ],
      }),
      [`${LEGACY_STATE_STORAGE_PREFIX}${SEED}`]: JSON.stringify({
        version: 1,
        seed: SEED,
        player: { position: [-31.5, -1.25, -46.5], yaw: 135, pitch: -12 },
        inventory: { slots: [{ id: BlockId.Stone, count: 3 }] },
        survival: { hunger: 17 },
      }),
    });

    const entities = new EntityRepository({ factory });
    await entities.open();
    const itemEntity = {
      schemaVersion: 1,
      typeKey: 'minecraft:item',
      x: -31,
      y: -1,
      z: -47,
      data: { stack: { item: 'minecraft:stone', count: 3 }, pickupDelay: 7 },
    };
    await entities.putChunkEntities('world-424242', -2, -3, [itemEntity]);
    const blockEntities = new BlockEntityRepository({ factory });
    await blockEntities.open();
    const chestEntity = {
      schemaVersion: 1,
      typeKey: 'minecraft:chest',
      x: -32,
      y: -64,
      z: -48,
      data: { inventory: [{ slot: 0, item: 'minecraft:stone', count: 3 }] },
    };
    await blockEntities.putChunkEntities('world-424242', -2, -3, [chestEntity]);

    const p1 = makeFacade(factory, legacyStorage);
    const first = await p1.open();
    expect(first.status).toBe('ok');
    expect(first.errors).toEqual([]);
    expect(first.migrationReport?.importedColumns).toBe(1);
    expect(first.migrationReport?.importedEditRecords).toBe(3);
    expect(first.initialEdits?.edits).toEqual([
      { chunk: [-2, -1, -3], changes: [[0, BlockId.Stone], [16241, BlockId.Sand]] },
      { chunk: [-2, 0, -3], changes: [[0, BlockId.Bricks]] },
      { chunk: [-2, 1, -3], changes: [[0, BlockId.Glass]] },
    ]);
    expect(first.initialPlayerState?.player.position).toEqual([-31.5, -1.25, -46.5]);
    expect(await entities.listChunks('world-424242')).toEqual([
      expect.objectContaining({ worldId: 'world-424242', chunkX: -2, chunkZ: -3, entities: [itemEntity] }),
    ]);
    expect(await blockEntities.listChunks('world-424242')).toEqual([
      expect.objectContaining({ worldId: 'world-424242', chunkX: -2, chunkZ: -3, entities: [chestEntity] }),
    ]);

    const column = await p1.loadChunkColumn(-2, -3);
    expect(column).not.toBeNull();
    expect(column?.minSectionY).toBe(-4);
    expect(column?.sectionCount).toBe(24);
    const restored = ChunkColumn.deserialize(column!, createDefaultBlockStateRegistry());
    expect(restored.getBlockState(0, -64, 0).blockId).toBe(BlockId.Stone);
    expect(restored.getBlockState(1, -1, 7).blockId).toBe(BlockId.Sand);
    expect(restored.getBlockState(0, 0, 0).blockId).toBe(BlockId.Bricks);
    expect(restored.getBlockState(0, 64, 0).blockId).toBe(BlockId.Glass);
    expect(legacyStorage.getItem(`${LEGACY_EDIT_STORAGE_PREFIX}${SEED}`)).not.toBeNull();
    expect(legacyStorage.getItem(`${LEGACY_STATE_STORAGE_PREFIX}${SEED}`)).not.toBeNull();

    const secondFacade = makeFacade(factory, legacyStorage);
    const second = await secondFacade.open();
    expect(second.status).toBe('ok');
    expect(second.migrationReport).toBeNull();
    expect(second.initialEdits).toEqual(first.initialEdits);
    expect(second.initialPlayerState).toEqual(first.initialPlayerState);
    expect(second.initialColumns).toEqual(first.initialColumns);
    expect(await secondFacade.loadChunkColumn(-2, -3)).toEqual(column);
    expect(await entities.listChunks('world-424242')).toHaveLength(1);
    expect(await entities.getChunkEntities('world-424242', -2, -3)).toEqual([itemEntity]);
    expect(await blockEntities.listChunks('world-424242')).toHaveLength(1);
    expect(await blockEntities.getChunkEntities('world-424242', -2, -3)).toEqual([chestEntity]);

    await p1.dispose();
    await secondFacade.dispose();
    entities.close();
    blockEntities.close();
  }, 20_000);
  it('quota faults retain dirty edits, surface degraded/failed health, and recover verifiably', async () => {
    const factory = new FaultIdbFactory();
    const p = makeFacade(factory, null);
    const open = await p.open();
    expect(open.status).toBe('ok');

    const world = makeWorld(SEED, p);
    driveEdits(world, 1, 100);

    // First quota failure on a chunk-edits put: one probe failure → degraded.
    factory.arm('chunk-edits', 'QuotaExceededError');
    const pendingBeforeFault = p.pendingCount;
    const f1 = await p.flush();
    expect(f1.failed).toBeGreaterThan(0);
    expect(f1.health).toBe('degraded');
    expect(p.lastFailureKind).toBe('quota');

    // Edits made during the fault are retained alongside the failed unit.
    driveEdits(world, 7, 101);
    const pendingDuringFault = p.pendingCount;
    expect(pendingDuringFault).toBeGreaterThan(pendingBeforeFault);

    // Repeated failure: second consecutive probe failure → failed; still no loss.
    const f2 = await p.flush();
    expect(f2.health).toBe('failed');
    expect(p.pendingCount).toBe(pendingDuringFault);

    // Heal: verified recovery clears health, then the retained units commit.
    factory.disarm();
    const f3 = await p.flush();
    expect(f3.health).toBe('ok'); // verified recovery (SAVE-FAIL-3)
    const f4 = await p.flush();
    expect(f4.committed).toBe(pendingDuringFault);
    expect(f4.failed).toBe(0);
    expect(p.health).toBe('ok');
    expect(p.pendingCount).toBe(0);

    // Every fault-round-tripped edit is durably committed and readable back.
    for (let i = 0; i < 7; i++) {
      const cx = 101 + (i % 25);
      const cz = 101 + Math.floor(i / 25);
      expect(await p.loadCommittedChunkEdits(cx, 0, cz)).toEqual([
        [EDIT_LOCAL_INDEX, BlockId.Sand],
      ]);
    }

    await p.dispose();
  }, 20000);
});
