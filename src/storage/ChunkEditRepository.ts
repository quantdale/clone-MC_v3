/**
 * Typed IndexedDB repository boundary for per-chunk sparse edit records (added at schema version 6).
 * The `IDBFactory` is injectable so the repository is fully unit-testable in Node without a browser
 * global; production code passes the browser adapter (`browserIdbFactory`). The `chunk-edits` store
 * lives in the same `voxel-world-db` database as the 034-040 stores; the shared `ensureWorldStores`
 * upgrade routine (in `WorldMetadataRepository`) creates all object stores, so opening this
 * repository at the current `WORLD_DB_VERSION` migrates a v5 database forward.
 *
 * Each record is a full sparse snapshot of one chunk's edit overlay (`ChunkEditRecord.changes`);
 * writes are full replaces, so last-write-wins ordering is version-safe under dedup-by-key.
 */
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_CHUNK_EDIT_STORE,
} from './WorldMetadata';
import {
  browserIdbFactory,
  ensureWorldStores,
  type IdbDatabaseLike,
  type IdbFactoryLike,
  type IdbObjectStoreLike,
} from './WorldMetadataRepository';
import { validateChunkEditRecord, type ChunkEditRecord } from './ChunkEditRecord';

/** Composite object-store key: `${worldId}|${chunkX}|${chunkY}|${chunkZ}`. */
function chunkKey(worldId: string, chunkX: number, chunkY: number, chunkZ: number): string {
  return `${worldId}|${chunkX}|${chunkY}|${chunkZ}`;
}

/** Promise wrapper around an IndexedDB request's success/error events. */
function promisifyRequest(req: { onsuccess: ((e: unknown) => void) | null; onerror: ((e: unknown) => void) | null; result: unknown; error: unknown }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error instanceof Error ? req.error : new Error('IndexedDB request failed'));
  });
}

/**
 * Typed boundary for persisting and reloading per-chunk sparse edit records. The factory is
 * injectable; production uses {@link browserIdbFactory}.
 */
export class ChunkEditRepository {
  private db: IdbDatabaseLike | null = null;
  private readonly factory: IdbFactoryLike;
  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly store = WORLD_CHUNK_EDIT_STORE;

  constructor(opts: { factory?: IdbFactoryLike; dbName?: string; dbVersion?: number } = {}) {
    this.factory = opts.factory ?? browserIdbFactory();
    this.dbName = opts.dbName ?? WORLD_DB_NAME;
    this.dbVersion = opts.dbVersion ?? WORLD_DB_VERSION;
  }

  /** Open (and, on first run / migration, create) the database. Idempotent. */
  async open(): Promise<void> {
    if (this.db) return;
    const req = this.factory.open(this.dbName, this.dbVersion);
    await new Promise<void>((resolve, reject) => {
      req.onupgradeneeded = () => {
        ensureWorldStores(req.result);
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () =>
        reject(req.error instanceof Error ? req.error : new Error('Failed to open world database'));
    });
  }

  private requireDb(): IdbDatabaseLike {
    if (!this.db) {
      throw new Error('ChunkEditRepository: open() must be called before use');
    }
    return this.db;
  }

  private storeHandle(mode: 'readonly' | 'readwrite' = 'readwrite'): IdbObjectStoreLike {
    return this.requireDb().transaction(this.store, mode).objectStore(this.store);
  }

  /** Validate and persist a full sparse-edit snapshot for `(worldId, chunkX, chunkY, chunkZ)`. */
  async putChunkEdits(
    worldId: string,
    chunkX: number,
    chunkY: number,
    chunkZ: number,
    changes: Array<[number, number]>,
  ): Promise<void> {
    const valid = validateChunkEditRecord({ worldId, chunkX, chunkY, chunkZ, changes });
    await promisifyRequest(this.storeHandle().put(valid));
  }

  /** Return the sparse edits for `(worldId, chunkX, chunkY, chunkZ)`, or `null` if absent. */
  async getChunkEdits(
    worldId: string,
    chunkX: number,
    chunkY: number,
    chunkZ: number,
  ): Promise<Array<[number, number]> | null> {
    const key = chunkKey(worldId, chunkX, chunkY, chunkZ);
    const result = await promisifyRequest(this.storeHandle('readonly').get(key));
    if (result === undefined || result === null) return null;
    return (result as ChunkEditRecord).changes;
  }

  /** Return all stored chunk-edit records belonging to `worldId` (empty array when none). */
  async listChunkEdits(worldId: string): Promise<ChunkEditRecord[]> {
    const result = await promisifyRequest(this.storeHandle('readonly').getAll());
    const all = (result as ChunkEditRecord[]) ?? [];
    return all.filter((r) => r.worldId === worldId);
  }

  /** Delete the chunk-edit record for `(worldId, chunkX, chunkY, chunkZ)`. */
  async deleteChunkEdits(
    worldId: string,
    chunkX: number,
    chunkY: number,
    chunkZ: number,
  ): Promise<void> {
    const key = chunkKey(worldId, chunkX, chunkY, chunkZ);
    await promisifyRequest(this.storeHandle().delete(key));
  }

  /** Close the underlying database (clears the cached handle). */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/** Re-export the open-request surface for consumers/tests that mock the factory directly. */
export type { IdbOpenRequestLike, IdbTransactionLike } from './WorldMetadataRepository';
