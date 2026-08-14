/**
 * Typed IndexedDB repository boundary for world-level metadata (034). The `IDBFactory` is
 * injectable so the repository is fully unit-testable in Node without a browser global;
 * production code passes the browser adapter (`browserIdbFactory`). Later changes (035–039)
 * add object stores to the same database and autosave policies on top of this boundary.
 */
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_METADATA_STORE,
  WORLD_CHUNK_SECTION_STORE,
  validateWorldMetadata,
  type WorldMetadata,
} from './WorldMetadata';

/** Minimal IndexedDB request surface the repository depends on. */
export interface IdbRequestLike {
  onsuccess: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  result: unknown;
  error: unknown;
}

/** Minimal object-store surface (get/put/getAll/delete). */
export interface IdbObjectStoreLike {
  put(value: unknown): IdbRequestLike;
  get(key: unknown): IdbRequestLike;
  getAll(): IdbRequestLike;
  delete(key: unknown): IdbRequestLike;
}

/** Minimal transaction surface. */
export interface IdbTransactionLike {
  objectStore(name: string): IdbObjectStoreLike;
}

/** Minimal database surface (store creation, transactions, close). */
export interface IdbDatabaseLike {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, opts?: { keyPath: string }): IdbObjectStoreLike;
  transaction(store: string, mode?: 'readonly' | 'readwrite'): IdbTransactionLike;
  close(): void;
}

/** Minimal open-request surface (upgrade + success/error). */
export interface IdbOpenRequestLike {
  onupgradeneeded: ((event: unknown) => void) | null;
  onsuccess: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  result: IdbDatabaseLike;
  error: unknown;
}

/** A factory that can open an IndexedDB database. Satisfied by the browser or a mock. */
export interface IdbFactoryLike {
  open(name: string, version?: number): IdbOpenRequestLike;
}

/** Promise wrapper around an IndexedDB request's success/error events. */
function promisifyRequest(req: IdbRequestLike): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error instanceof Error ? req.error : new Error('IndexedDB request failed'));
  });
}

/**
 * Create every object store the world database is known to need, idempotently. Both repositories
 * (034 world-metadata, 035 chunk-sections, and later stores) route their `onupgradeneeded` through
 * this single routine so a single open creates/migrates the full schema rather than scattering
 * store creation across boundaries. A store is only created when missing, so re-running on an
 * already-upgraded database is a no-op.
 */
export function ensureWorldStores(db: IdbDatabaseLike): void {
  if (!db.objectStoreNames.contains(WORLD_METADATA_STORE)) {
    db.createObjectStore(WORLD_METADATA_STORE, { keyPath: 'worldId' });
  }
  if (!db.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)) {
    db.createObjectStore(WORLD_CHUNK_SECTION_STORE, { keyPath: 'key' });
  }
}

/**
 * Typed boundary for world metadata, persisted in the world IndexedDB database. The
 * factory is injectable; production uses {@link browserIdbFactory}.
 */
export class WorldMetadataRepository {
  private db: IdbDatabaseLike | null = null;
  private readonly factory: IdbFactoryLike;
  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly store = WORLD_METADATA_STORE;

  constructor(opts: { factory?: IdbFactoryLike; dbName?: string; dbVersion?: number } = {}) {
    this.factory = opts.factory ?? browserIdbFactory();
    this.dbName = opts.dbName ?? WORLD_DB_NAME;
    this.dbVersion = opts.dbVersion ?? WORLD_DB_VERSION;
  }

  /** Open (and, on first run, create) the database. Idempotent. */
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
      throw new Error('WorldMetadataRepository: open() must be called before use');
    }
    return this.db;
  }

  /** Validate and persist a metadata record (stamps `updatedAt`). */
  async putMetadata(meta: WorldMetadata): Promise<void> {
    const valid = validateWorldMetadata(meta);
    valid.updatedAt = Date.now();
    const tx = this.requireDb().transaction(this.store, 'readwrite');
    await promisifyRequest(tx.objectStore(this.store).put(valid));
  }

  /** Return the metadata for `worldId`, or `null` if absent. */
  async getMetadata(worldId: string): Promise<WorldMetadata | null> {
    const tx = this.requireDb().transaction(this.store, 'readonly');
    const result = await promisifyRequest(tx.objectStore(this.store).get(worldId));
    return (result as WorldMetadata | undefined) ?? null;
  }

  /** Return all stored metadata records (empty array when none). */
  async listMetadata(): Promise<WorldMetadata[]> {
    const tx = this.requireDb().transaction(this.store, 'readonly');
    const result = await promisifyRequest(tx.objectStore(this.store).getAll());
    return (result as WorldMetadata[]) ?? [];
  }

  /** Delete the metadata for `worldId`. */
  async deleteMetadata(worldId: string): Promise<void> {
    const tx = this.requireDb().transaction(this.store, 'readwrite');
    await promisifyRequest(tx.objectStore(this.store).delete(worldId));
  }

  /** Close the underlying database (clears the cached handle). */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/** Browser adapter exposing the global `indexedDB` through {@link IdbFactoryLike}. */
export function browserIdbFactory(): IdbFactoryLike {
  const real = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!real) {
    throw new Error('WorldMetadataRepository: no global indexedDB and no factory injected');
  }
  return {
    open(name: string, version?: number): IdbOpenRequestLike {
      return real.open(name, version) as unknown as IdbOpenRequestLike;
    },
  };
}
