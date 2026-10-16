/**
 * Typed IndexedDB repository boundary for entity records (037). The `IDBFactory` is injectable so the
 * repository is fully unit-testable in Node without a browser global; production code passes the
 * browser adapter (`browserIdbFactory`). The `entities` store lives in the same `voxel-world-db`
 * database as the 034/035/036 stores; the shared `ensureWorldStores` upgrade routine (in
 * `WorldMetadataRepository`) creates all object stores, so opening this repository at the current
 * `WORLD_DB_VERSION` migrates a v3 database forward. The repository stores plain `EntityChunkRecord`
 * data and is deliberately decoupled from any live entity framework; the `data` payload is opaque.
 */
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_ENTITY_STORE,
} from './WorldMetadata';
import {
  browserIdbFactory,
  ensureWorldStores,
  type IdbDatabaseLike,
  type IdbFactoryLike,
  type IdbObjectStoreLike,
} from './WorldMetadataRepository';
import {
  validateEntityChunkRecord,
  type EntityChunkRecord,
  type SerializedEntity,
} from './EntityRecord';

/** Composite object-store key: `${worldId}|${chunkX}|${chunkZ}`. */
function chunkKey(worldId: string, chunkX: number, chunkZ: number): string {
  return `${worldId}|${chunkX}|${chunkZ}`;
}

/** Promise wrapper around an IndexedDB request's success/error events. */
function promisifyRequest(req: { onsuccess: ((e: unknown) => void) | null; onerror: ((e: unknown) => void) | null; result: unknown; error: unknown }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error instanceof Error ? req.error : new Error('IndexedDB request failed'));
  });
}

/**
 * Typed boundary for persisting and reloading entity records per chunk. The factory is injectable;
 * production uses {@link browserIdbFactory}.
 */
export class EntityRepository {
  private db: IdbDatabaseLike | null = null;
  private readonly factory: IdbFactoryLike;
  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly store = WORLD_ENTITY_STORE;

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
      throw new Error('EntityRepository: open() must be called before use');
    }
    return this.db;
  }

  private storeHandle(): IdbObjectStoreLike {
    return this.requireDb().transaction(this.store, 'readwrite').objectStore(this.store);
  }

  private storeHandleReadOnly(): IdbObjectStoreLike {
    return this.requireDb().transaction(this.store, 'readonly').objectStore(this.store);
  }

  /** Validate and persist the entities for a chunk under its composite key. */
  async putChunkEntities(
    worldId: string,
    chunkX: number,
    chunkZ: number,
    entities: SerializedEntity[],
  ): Promise<void> {
    const valid = validateEntityChunkRecord({ worldId, chunkX, chunkZ, entities });
    const key = chunkKey(worldId, chunkX, chunkZ);
    const record: EntityChunkRecord = { ...valid, key };
    await promisifyRequest(this.storeHandle().put(record));
  }

  /** Return the entities for `(worldId, chunkX, chunkZ)`, or `null` if absent. */
  async getChunkEntities(
    worldId: string,
    chunkX: number,
    chunkZ: number,
  ): Promise<SerializedEntity[] | null> {
    const key = chunkKey(worldId, chunkX, chunkZ);
    const result = await promisifyRequest(this.storeHandleReadOnly().get(key));
    if (result === undefined || result === null) return null;
    return (result as EntityChunkRecord).entities;
  }

  /** Return all chunk records belonging to `worldId` (empty array when none). */
  async listChunks(worldId: string): Promise<EntityChunkRecord[]> {
    const result = await promisifyRequest(this.storeHandleReadOnly().getAll());
    const all = (result as EntityChunkRecord[]) ?? [];
    return all.filter((r) => r.worldId === worldId);
  }

  /** Delete the entity record for `(worldId, chunkX, chunkZ)`. */
  async deleteChunkEntities(worldId: string, chunkX: number, chunkZ: number): Promise<void> {
    const key = chunkKey(worldId, chunkX, chunkZ);
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
