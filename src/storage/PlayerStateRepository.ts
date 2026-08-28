/**
 * Typed IndexedDB repository boundary for player state (040). The `IDBFactory` is injectable so the
 * repository is fully unit-testable in Node without a browser global; production code passes the
 * browser adapter (`browserIdbFactory`). The `player-state` store lives in the same `voxel-world-db`
 * database as the 034-039 stores; the shared `ensureWorldStores` upgrade routine (in
 * `WorldMetadataRepository`) creates all object stores, so opening this repository at the current
 * `WORLD_DB_VERSION` migrates a v4 database forward. Payloads are opaque; the game runtime restores
 * and validates them.
 */
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_PLAYER_STATE_STORE,
} from './WorldMetadata';
import {
  browserIdbFactory,
  ensureWorldStores,
  type IdbDatabaseLike,
  type IdbFactoryLike,
  type IdbObjectStoreLike,
} from './WorldMetadataRepository';
import {
  validatePlayerStateRecord,
  type PlayerStateRecord,
} from './PlayerStateRecord';

/** Promise wrapper around an IndexedDB request's success/error events. */
function promisifyRequest(req: { onsuccess: ((e: unknown) => void) | null; onerror: ((e: unknown) => void) | null; result: unknown; error: unknown }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error instanceof Error ? req.error : new Error('IndexedDB request failed'));
  });
}

/**
 * Typed boundary for player state, persisted in the world IndexedDB database. The factory is
 * injectable; production uses {@link browserIdbFactory}.
 */
export class PlayerStateRepository {
  private db: IdbDatabaseLike | null = null;
  private readonly factory: IdbFactoryLike;
  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly store = WORLD_PLAYER_STATE_STORE;

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
      throw new Error('PlayerStateRepository: open() must be called before use');
    }
    return this.db;
  }

  private storeHandle(mode: 'readonly' | 'readwrite' = 'readwrite'): IdbObjectStoreLike {
    return this.requireDb().transaction(this.store, mode).objectStore(this.store);
  }

  /** Validate and persist a player-state record (keyed by `worldId`). */
  async putPlayerState(record: PlayerStateRecord): Promise<void> {
    const valid = validatePlayerStateRecord(record);
    await promisifyRequest(this.storeHandle().put(valid));
  }

  /** Return the player state for `worldId`, or `null` if absent. */
  async getPlayerState(worldId: string): Promise<PlayerStateRecord | null> {
    const result = await promisifyRequest(this.storeHandle('readonly').get(worldId));
    if (result === undefined || result === null) return null;
    return result as PlayerStateRecord;
  }

  /** Return all stored player-state records (empty array when none). */
  async listPlayerStates(): Promise<PlayerStateRecord[]> {
    const result = await promisifyRequest(this.storeHandle('readonly').getAll());
    return (result as PlayerStateRecord[]) ?? [];
  }

  /** Delete the player state for `worldId`. */
  async deletePlayerState(worldId: string): Promise<void> {
    await promisifyRequest(this.storeHandle().delete(worldId));
  }

  /** Close the underlying database (clears the cached handle). */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
