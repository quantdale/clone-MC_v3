/**
 * Typed IndexedDB repository boundary for chunk-column section block-state data (035). The
 * `IDBFactory` is injectable so the repository is fully unit-testable in Node without a browser
 * global; production code passes the browser adapter (`browserIdbFactory`). The chunk-sections
 * store lives in the same `voxel-world-db` database as the 034 world-metadata store; the shared
 * `ensureWorldStores` upgrade routine (in `WorldMetadataRepository`) creates both object stores, so
 * opening this repository at the current `WORLD_DB_VERSION` migrates a v1 database forward.
 *
 * The repository stores *plain* `SerializedChunkColumn` data and is deliberately decoupled from the
 * `BlockStateRegistry`; callers own registry-dependent deserialization (`ChunkColumn.deserialize`).
 */
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_CHUNK_SECTION_STORE,
} from './WorldMetadata';
import {
  browserIdbFactory,
  ensureWorldStores,
  type IdbDatabaseLike,
  type IdbFactoryLike,
  type IdbObjectStoreLike,
  type IdbOpenRequestLike,
  type IdbRequestLike,
  type IdbTransactionLike,
} from './WorldMetadataRepository';
import type { SerializedChunkColumn } from '../world/ChunkColumn';
import type { SerializedPalettedContainer } from '../data/PalettedContainer';

/** Composite object-store key: `${worldId}|${chunkX}|${chunkZ}`. */
function chunkKey(worldId: string, chunkX: number, chunkZ: number): string {
  return `${worldId}|${chunkX}|${chunkZ}`;
}

/** A `SerializedChunkColumn` persisted under the composite `key`, with its owning `worldId` surfaced. */
export interface ChunkColumnRecord extends SerializedChunkColumn {
  /** `${worldId}|${chunkX}|${chunkZ}`. */
  key: string;
  /** Owning world identifier (also encoded in `key`). */
  worldId: string;
}

/** A `SerializedChunkColumn` with only its persisted payload fields (key/worldId stripped). */
type ColumnPayload = SerializedChunkColumn;

function isFiniteInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

/**
 * Validate an unknown value as a `SerializedChunkColumn`. Returns the same value (narrowed) on
 * success; throws a descriptive `Error` on any invalid field. Does not coerce types; section
 * payloads are validated lazily by `ChunkColumn.deserialize`/`PalettedContainer.deserialize`.
 */
export function validateSerializedChunkColumn(input: unknown): SerializedChunkColumn {
  if (typeof input !== 'object' || input === null) {
    throw new Error('SerializedChunkColumn: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (!isFiniteInteger(r.version)) {
    throw new Error('SerializedChunkColumn: version must be an integer');
  }
  if (!isFiniteInteger(r.chunkX)) {
    throw new Error('SerializedChunkColumn: chunkX must be an integer');
  }
  if (!isFiniteInteger(r.chunkZ)) {
    throw new Error('SerializedChunkColumn: chunkZ must be an integer');
  }
  if (!isFiniteInteger(r.sectionCount) || (r.sectionCount as number) < 1) {
    throw new Error('SerializedChunkColumn: sectionCount must be a positive integer');
  }
  if (!isFiniteInteger(r.minSectionY)) {
    throw new Error('SerializedChunkColumn: minSectionY must be an integer');
  }
  if (typeof r.sections !== 'object' || r.sections === null || Array.isArray(r.sections)) {
    throw new Error('SerializedChunkColumn: sections must be a non-null object');
  }

  return {
    version: r.version as number,
    chunkX: r.chunkX as number,
    chunkZ: r.chunkZ as number,
    sectionCount: r.sectionCount as number,
    minSectionY: r.minSectionY as number,
    sections: r.sections as Record<number, SerializedPalettedContainer>,
  };
}

/** Promise wrapper around an IndexedDB request's success/error events. */
function promisifyRequest(req: IdbRequestLike): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error instanceof Error ? req.error : new Error('IndexedDB request failed'));
  });
}

/** Strip the `key`/`worldId` surface fields, returning a plain `SerializedChunkColumn`. */
function toPayload(record: ChunkColumnRecord): SerializedChunkColumn {
  return {
    version: record.version,
    chunkX: record.chunkX,
    chunkZ: record.chunkZ,
    sectionCount: record.sectionCount,
    minSectionY: record.minSectionY,
    sections: record.sections,
  };
}

/**
 * Typed boundary for persisting and reloading chunk-column section block-state data. The factory is
 * injectable; production uses {@link browserIdbFactory}.
 */
export class ChunkSectionRepository {
  private db: IdbDatabaseLike | null = null;
  private readonly factory: IdbFactoryLike;
  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly store = WORLD_CHUNK_SECTION_STORE;

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
      throw new Error('ChunkSectionRepository: open() must be called before use');
    }
    return this.db;
  }

  private storeHandle(): IdbObjectStoreLike {
    return this.requireDb().transaction(this.store, 'readwrite').objectStore(this.store);
  }

  private storeHandleReadOnly(): IdbObjectStoreLike {
    return this.requireDb().transaction(this.store, 'readonly').objectStore(this.store);
  }

  /** Validate and persist a serialized column under its composite key. */
  async putColumn(worldId: string, column: SerializedChunkColumn): Promise<void> {
    const valid = validateSerializedChunkColumn(column);
    const key = chunkKey(worldId, valid.chunkX, valid.chunkZ);
    const record: ChunkColumnRecord = { ...valid, key, worldId };
    await promisifyRequest(this.storeHandle().put(record));
  }

  /** Return the serialized column for `(worldId, chunkX, chunkZ)`, or `null` if absent. */
  async getColumn(worldId: string, chunkX: number, chunkZ: number): Promise<ColumnPayload | null> {
    const key = chunkKey(worldId, chunkX, chunkZ);
    const result = await promisifyRequest(this.storeHandleReadOnly().get(key));
    if (result === undefined || result === null) return null;
    return toPayload(result as ChunkColumnRecord);
  }

  /** Return all serialized columns belonging to `worldId` (empty array when none). */
  async listColumns(worldId: string): Promise<ColumnPayload[]> {
    const result = await promisifyRequest(this.storeHandleReadOnly().getAll());
    const all = (result as ChunkColumnRecord[]) ?? [];
    return all.filter((r) => r.worldId === worldId).map(toPayload);
  }

  /** Delete the serialized column for `(worldId, chunkX, chunkZ)`. */
  async deleteColumn(worldId: string, chunkX: number, chunkZ: number): Promise<void> {
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

/** Re-export the open-request surface for consumers/tests that mock the factory directly. */
export type { IdbOpenRequestLike, IdbTransactionLike };
