/**
 * In-memory IndexedDB factory mock for unit testing the world-metadata repository (034)
 * without a browser global. It satisfies the minimal `IdbFactoryLike` surface that
 * `WorldMetadataRepository` depends on and faithfully fires `onupgradeneeded` (when the
 * database is newly created / version-bumped) before `onsuccess`, mirroring real
 * IndexedDB open ordering. Underlying data is shared across transactions so round-trip,
 * list, and delete behavior can be asserted.
 */
import type {
  IdbDatabaseLike,
  IdbFactoryLike,
  IdbObjectStoreLike,
  IdbOpenRequestLike,
  IdbRequestLike,
  IdbTransactionLike,
} from '../../src/storage/WorldMetadataRepository';

/** A request whose completion is scheduled on a microtask (as real IDB requests are). */
function makeRequest(result: unknown): IdbRequestLike {
  const req: IdbRequestLike = { onsuccess: null, onerror: null, result, error: null };
  queueMicrotask(() => req.onsuccess?.({}));
  return req;
}

/** One object store, backed by an in-memory Map keyed by the configured keyPath. */
export class MockStore implements IdbObjectStoreLike {
  private readonly data = new Map<string, unknown>();

  constructor(private readonly keyPath: string) {}

  put(value: unknown): IdbRequestLike {
    const rec = value as Record<string, unknown>;
    const key = String(rec[this.keyPath]);
    this.data.set(key, value);
    return makeRequest(value);
  }

  get(key: unknown): IdbRequestLike {
    const found = this.data.get(String(key));
    return makeRequest(found === undefined ? undefined : found);
  }

  getAll(): IdbRequestLike {
    return makeRequest(Array.from(this.data.values()));
  }

  delete(key: unknown): IdbRequestLike {
    this.data.delete(String(key));
    return makeRequest(undefined);
  }
}

/** A single in-memory IndexedDB database. */
export class MockDatabase implements IdbDatabaseLike {
  version: number;
  private readonly stores = new Map<string, MockStore>();

  constructor(version: number) {
    this.version = version;
  }

  get objectStoreNames(): { contains(name: string): boolean } {
    return { contains: (name: string) => this.stores.has(name) };
  }

  createObjectStore(name: string, opts?: { keyPath: string }): IdbObjectStoreLike {
    const store = new MockStore(opts?.keyPath ?? 'worldId');
    this.stores.set(name, store);
    return store;
  }

  transaction(stores: string | string[], _mode?: 'readonly' | 'readwrite'): IdbTransactionLike {
    const list = typeof stores === 'string' ? [stores] : stores;
    const resolved: MockStore[] = [];
    for (const s of list) {
      const found = this.stores.get(s);
      if (!found) throw new Error(`MockDatabase: object store "${s}" does not exist`);
      resolved.push(found);
    }
    const byName = new Map<string, MockStore>();
    list.forEach((s, i) => { byName.set(s, resolved[i] as MockStore); });
    const raw: { abort(): void; readonly error: unknown; oncomplete?: (() => void) | null; onerror?: (() => void) | null; onabort?: (() => void) | null } = {
      abort: () => { /* no-op: mock commits every request on a microtask before body awaits */ },
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
    };
    // The mock commits each request synchronously on a microtask. The real IDB API
    // fires `oncomplete` after the caller's microtask drain following body settlement;
    // `runInMultiStoreTransaction` schedules `raw.oncomplete` on the microtask after the
    // body promise resolves, so this tx needs no timer of its own. The mock never
    // errors unless a `put` / `delete` override is installed by the test (see
    // FaultFactory in RecoveryBackupAndAtomicReset); in that case the request's
    // onerror fires before the body awaits, the body throws, the
    // runInMultiStoreTransaction catch calls raw.abort() (no-op), and the body's
    // thrown error propagates.
    const tx: IdbTransactionLike = {
      objectStore: (name: string) => {
        const s = byName.get(name);
        if (!s) throw new Error(`MockDatabase: object store "${name}" not in transaction scope`);
        return s;
      },
      raw,
    };
    return tx;
  }

  close(): void {
    /* no-op for the in-memory mock */
  }
}

/** A factory mock exposing created databases for inspection. */
export interface MockIdbFactory extends IdbFactoryLike {
  readonly databases: Map<string, MockDatabase>;
}

/**
 * Create an in-memory `IdbFactoryLike`. The returned object also carries a `databases`
 * map so tests can assert store creation directly.
 */
export function createIdbFactoryMock(): MockIdbFactory {
  const databases = new Map<string, MockDatabase>();

  const factory: MockIdbFactory = {
    databases,
    open(name: string, version?: number): IdbOpenRequestLike {
      const v = version ?? 1;
      const existing = databases.get(name);
      const upgrade = !existing || v > existing.version;

      let db = existing;
      if (upgrade) {
        if (!db) {
          db = new MockDatabase(v);
          databases.set(name, db);
        } else {
          // Real IndexedDB fires onupgradeneeded on the SAME database object during an
          // in-place version upgrade, preserving existing object stores and data while the
          // handler adds new stores. Mirror that: keep the existing object and only bump
          // its version so a v1->v2 migration test can assert world-metadata survives.
          db.version = v;
        }
      }

      const request: IdbOpenRequestLike = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: db as IdbDatabaseLike,
        error: null,
      };

      // Real IndexedDB fires onupgradeneeded (if any) before onsuccess on open.
      queueMicrotask(() => {
        if (upgrade) request.onupgradeneeded?.({});
        request.onsuccess?.({});
      });

      return request;
    },
  };

  return factory;
}
