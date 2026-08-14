# Design: 034-indexeddb-world-metadata

## Context / current state

Persistence is seed-scoped localStorage (`Game` save/state keys; `World.exportEdits`).
No database, version, or world metadata exists. The roadmap needs an IndexedDB store as
the durable home for worlds (034) and, later, chunk sections (035), block entities (036),
entities (037), and transactional autosave (038/039).

## Target state

A typed IndexedDB database `voxel-world-db` (version `1`) with one object store
`world-metadata` keyed by `worldId`. A `WorldMetadataRepository` provides typed
put/get/list/delete over that store, with the `IDBFactory` injected (browser global in
production; in-memory mock in tests).

## Invariants

- `WORLD_DB_NAME = 'voxel-world-db'`, `WORLD_DB_VERSION = 1`.
- `world-metadata` store keyPath is `'worldId'`; records are unique per `worldId`.
- Every persisted record MUST pass `validateWorldMetadata` before `putMetadata`; rejection
  MUST NOT write a partial record.
- `getMetadata(worldId)` returns `null` when absent (never throws for a missing key).
- The repository MUST be constructable without a global `indexedDB` (factory injected).

## API and data model

```ts
// src/storage/WorldMetadata.ts
export const WORLD_DB_NAME = 'voxel-world-db';
export const WORLD_DB_VERSION = 1;
export const WORLD_METADATA_STORE = 'world-metadata';

export interface WorldMetadata {
  schemaVersion: number;   // our record schema version (starts at 1)
  worldId: string;
  seed: number;
  dimensionId: string;     // e.g. 'minecraft:overworld'
  minY: number;
  height: number;
  createdAt: number;
  updatedAt: number;
}
export function validateWorldMetadata(input: unknown): WorldMetadata; // throws on invalid

// src/storage/WorldMetadataRepository.ts
export type IdbFactoryLike = Pick<IDBFactory, 'open'> & { open(name: string, version?: number): IDBOpenDBRequest };
export class WorldMetadataRepository {
  constructor(opts: { factory?: IdbFactoryLike; dbName?: string; dbVersion?: number });
  open(): Promise<void>;
  putMetadata(meta: WorldMetadata): Promise<void>;
  getMetadata(worldId: string): Promise<WorldMetadata | null>;
  listMetadata(): Promise<WorldMetadata[]>;
  deleteMetadata(worldId: string): Promise<void>;
  close(): void;
}
```

## Control / data flow

1. `open()` calls `factory.open(dbName, dbVersion)`; on `onupgradeneeded` it creates the
   `world-metadata` store with `keyPath: 'worldId'`. On `onsuccess` it caches the
   `IDBDatabase`. All later ops run inside `readwrite`/`readonly` transactions.
2. `putMetadata(m)` → `validateWorldMetadata(m)` (throws on bad input) → `m.updatedAt = Date.now()`
   → `store.put(m)`.
3. `getMetadata(id)` → `store.get(id)` → returns `result ?? null`.
4. `listMetadata()` → `store.getAll()` → array (may be empty).
5. `deleteMetadata(id)` → `store.delete(id)`.

## Detailed behavior

- `promisifyRequest(request)` wraps `onsuccess`/`onerror` in a Promise. Opening also
  promisifies `onupgradeneeded` (resolved after the success event) so the store exists
  before any read/write.
- `validateWorldMetadata` checks: object; `schemaVersion` is a positive integer; `worldId`
  is a non-empty string; `seed` is a finite number; `dimensionId` non-empty string; `minY`
  integer; `height` positive integer; `createdAt`/`updatedAt` finite numbers. On failure it
  throws `Error` with a descriptive message. It does NOT coerce types.
- Double `open()` is idempotent (reuses the cached db).

## Failure modes

- Missing/invalid `IDBFactory` → `open()` rejects (caught by caller).
- Invalid metadata → `putMetadata` rejects before touching the store.
- `getMetadata` of an absent key → `null` (no throw).
- Request `onerror` → rejecting Promise with the DOMException/error.

## Compatibility / migration

`WORLD_DB_VERSION` is the single migration pivot. Future bumps add `onupgradeneeded`
branches. No localStorage is read here (migration is 040).

## Performance / resource constraints

Metadata is tiny (one small record per world); `getAll` is bounded by world count. The DB
is opened once and reused. No per-frame work.

## Testing seams

- `tests/unit/WorldMetadataRepository.test.ts` injects an in-memory `IDBFactory` mock
  (no `fake-indexeddb` dependency). Covers: store creation on open; put/get round-trip;
  list; delete; validation rejection; absent-key null; idempotent open.

## Observability / debugging

The repository is self-contained; `dbName`/`dbVersion` are overridable for tests.

## Affected files / symbols

- `src/storage/WorldMetadata.ts` — NEW (types, constants, validation).
- `src/storage/WorldMetadataRepository.ts` — NEW (repository boundary).
- `tests/unit/WorldMetadataRepository.test.ts` — NEW (in-memory mock).
- `tests/unit/IdbFactoryMock.ts` — NEW helper (in-memory `IDBFactory`).

## Rejected alternatives

- *Add `fake-indexeddb` / `idb` dependency*: avoids dependency churn and keeps the change
  self-contained; an injectable factory + tiny in-memory mock is sufficient for the
  metadata boundary and matches the repo's "confirm deps before adding" discipline.
- *Persist chunk data in 034*: out of scope; 034 is metadata only. Sections follow in 035.

## Downstream dependencies

035/036/037 add object stores to the same database (bumping `WORLD_DB_VERSION`); 038/039 add
autosave over these repositories.
