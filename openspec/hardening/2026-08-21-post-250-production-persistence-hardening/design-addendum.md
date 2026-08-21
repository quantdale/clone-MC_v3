# Design Addendum: Production Composition Contracts

Status: **NORMATIVE for this campaign** (amends `design.md` per the remediation-matrix amendment rule).

## A. Findings that force an amendment

Implementing against the current tree revealed two defects in the existing durable representation
that make the air-filled `SerializedChunkColumn` format unsuitable as the *authoritative* live-edit
store for the browser game:

1. **Lossy diff encoding.** `buildSectionContainer` (`LegacyLocalStorageMigrator.ts`) fills untouched
   cells with air and stores only edited cells. On read-back there is no way to distinguish "player
   dug this cell out" from "cell was never touched", so semantic equivalence to the legacy sparse
   diff (`MIGRATE-1`) is unprovable through this format alone.
2. **Silent truncation of edits above local y=15.** Chunks are 16×64×16 = 16,384 cells
   (`CONFIG.chunk`), but `buildSectionContainer` defaults its capacity to `SECTION_VOLUME` = 16³ =
   4,096 and *silently skips* any change index ≥ capacity. Every legacy edit at local y ≥ 16 would be
   dropped by migration.

Therefore the authoritative durable representation of live edits is a **faithful per-chunk sparse
edit record** in a new object store, exactly mirroring the runtime overlay model
(`WorldEditSnapshot` entries). The air-filled column conversion is retained solely as archive/
tooling compatibility output; it is no longer consumed by the game.

## B. Database schema v6

- `WORLD_DB_VERSION` 5 → 6.
- New store `chunk-edits` (`WORLD_CHUNK_EDIT_STORE`), keyPath `key`, added in v6.
- `ensureWorldStores` creates it idempotently; opening any repository at v6 upgrades v1-v5 databases.

### ChunkEditRecord (`src/storage/ChunkEditRecord.ts`)

```ts
export const CHUNK_EDIT_RECORD_VERSION = 1;
export interface ChunkEditRecord {
  key: string;            // `${worldId}|${cx}|${cy}|${cz}`
  worldId: string;
  chunkX: number; chunkY: number; chunkZ: number;
  /** Sparse cell edits: `[localIndex, blockId]` pairs, localIndex over the full chunk volume. */
  changes: Array<[number, number]>;
}
export function validateChunkEditRecord(input: unknown): ChunkEditRecord; // throws on invalid
```

Validation rules: integer coords; `changes` array of `[int, int]` pairs with `0 <= index <
CHUNK_BLOCK_COUNT` (16,384) and `blockId >= 0`; at least one change. `key` defaults to the composite
of `worldId|cx|cy|cz` when absent/empty.

### ChunkEditRepository (`src/storage/ChunkEditRepository.ts`)

Same pattern as `ChunkSectionRepository`: injectable `IdbFactoryLike`, `open()`, 
`putChunkEdits(worldId, cx, cy, cz, changes)` (validates, full replace), 
`getChunkEdits(worldId, cx, cy, cz) -> changes | null`, `listChunkEdits(worldId) -> ChunkEditRecord[]`,
`deleteChunkEdits(...)`, `close()`.

## C. Queue/sink extensions (additive)

- `SaveUnitKind` gains `'chunk-edits'` and `'player-state'`.
- `SaveUnit.payload` for `chunk-edits` = `Array<[number, number]>` (the changes array); unit carries
  `chunkX/chunkZ` plus the chunk Y in the unit key: key = `` `chunk-edits|${worldId}|${cx}|${cy}|${cz}` ``.
- `RepositorySaveSinkDeps` gains optional `chunkEdits?: ChunkEditRepository` and
  `playerStates?: PlayerStateRepository`; `write` routes the new kinds, rejecting when the repo is
  absent (queue re-queues → no loss).
- Each `chunk-edits` unit payload is a **full snapshot** of that chunk's current overlay (not a
  delta), so last-write-wins ordering is version-safe (`DIRTY-3`) under dedup-by-key.

## D. World ↔ durability bridge (`src/world/World.ts`)

```ts
export interface WorldEditDurability {
  /** Called after every committed overlay mutation for the chunk (full latest changes). */
  captureChunkEdits(cx: number, cy: number, cz: number, changes: ReadonlyMap<number, number>): void;
  /** Called just before the LRU evicts a resident overlay entry (safety handoff; idempotent). */
  retainEvictedChunkEdits(cx: number, cy: number, cz: number, changes: ReadonlyMap<number, number>): void;
  /** Synchronous pending-copy lookup used to re-materialize an evicted entry on regeneration. */
  restorePendingChunkEdits(cx: number, cy: number, cz: number): ReadonlyMap<number, number> | null;
  /** Asynchronous committed-copy lookup (IndexedDB) for chunks with no resident/pending copy. */
  loadCommittedChunkEdits(cx: number, cy: number, cz: number): Promise<Array<[number, number]> | null>;
}
```

World behavior:

- `setBlock` (live edit path only): after updating the overlay, call `captureChunkEdits`.
- `touchEditOverlay` eviction: call `retainEvictedChunkEdits` before deleting the resident entry.
  With capture-on-edit already in place this is a defensive re-capture; eviction can never destroy
  the sole authoritative copy (`DIRTY-1/2`).
- `applyEditOverlay` fallback order: resident overlay → `restorePendingChunkEdits` (re-materializes
  the overlay entry synchronously) → `loadCommittedChunkEdits` (async hydration; applies + remeshes
  when resolved; de-duplicated by a pending-hydration set so repeated generation cannot double-fire).
- Overlay cap stays 10,000 (`DIRTY-4`); the durability layer owns everything evicted.
- `importEdits` keeps existing semantics (bulk boot-time import of committed edits; those edits are
  already durable and MUST NOT be re-captured into the queue).

## E. GamePersistence facade (`src/storage/GamePersistence.ts`)

Single production composition boundary. Constructor-injected seams (no release-bundle test hooks):

```ts
export interface GamePersistenceOptions {
  seed: number;
  factory?: IdbFactoryLike;                    // default browserIdbFactory()
  legacyStorage?: StorageLike;                 // default window.localStorage reader
  timer?: TimerLike;                           // default globalThis
  flushTarget?: EventTargetLike | null;        // default window
  intervalMs?: number;                         // default 5000
  worldIdForSeed?: (seed: number) => string;   // default `world-${seed}`
}
```

Static `createProductionGamePersistence(seed)` builds the default composition (all six repositories,
DirtySaveQueue, monitoring SaveSink wrapper, RepositorySaveSink, AutosaveCoordinator,
StorageHealthMonitor over `createWorldStorageProbe`, LegacyLocalStorageMigrator).

API (semantics per `design.md` facade list):

- `open(): Promise<GamePersistenceOpenResult>` — opens repos, runs copy-then-verify legacy migration
  (idempotent via a `migrated-seeds` marker record in `world-metadata` store keyed
  `__migration__:${worldId}`, written only after read-back verification passes), bulk-loads committed
  chunk-edit records + player state, writes/refreshes world metadata. Result:
  `{ status: 'ok'|'degraded'|'failed', initialEdits: WorldEditSnapshot | null,
     initialPlayerState: PlayerStateRecord | null, migrationReport, errors: string[] }`.
- `get initialEdits()` / `get initialPlayerState()` — loaded at open; Game applies them at boot.
- `captureChunkEdits(...)` / `restorePendingChunkEdits(...)` / `loadCommittedChunkEdits(...)` —
  implements `WorldEditDurability`.
- `savePlayerState(snapshot: GamePlayerSnapshot): void` — enqueues a `player-state` unit (dedup).
- `async flush(): Promise<GamePersistenceFlushResult>` — coordinator flush; structured result
  `{ committed: number, failed: number, health: StorageStatus }`. Never reports success unless the
  sink accepted every drained unit (`SAVE-FAIL-5`).
- `get health(): StorageStatus`; `onHealthChange(cb): () => void` — bounded listener set.
- `markResidentEditsDirty(overlay: Iterable<[key, Map]>)` — not needed; capture-on-edit suffices.
- `async dispose(): Promise<void>` — final flush, stop coordinator, close repos.
- Failure handling: the monitoring sink classifies every write rejection
  (`classifyStorageError`), records it, triggers `StorageHealthMonitor.check()` (probe), and emits
  status changes. After any successful write while unhealthy, re-check to clear the warning only on
  verified recovery (`SAVE-FAIL-3`). Bookkeeping is counters + fixed-size sets only (`SAVE-FAIL-4`).
- When `canWrite()` is false the coordinator stops draining but the queue retains units (bounded by
  distinct dirty keys); retry resumes automatically on recovery.

## F. Game/bootstrap integration

- `main.ts` composes `createProductionGamePersistence(seed)`… seed resolution moves behind a small
  helper so main.ts can open persistence before constructing `Game`; `await persistence.open()`
  (top-level await, es2022) then `new Game(canvas, seed, quality, { persistence })`.
- `Game` constructor gains optional 4th param `bootstrap?: { persistence: GamePersistence }`.
  When omitted, Game composes the production default itself and gates `start()`'s loop start on
  `open()` completion (loading indicator already covers the wait).
- `loadSavedEdits()` → apply `persistence.initialEdits` via `world.importEdits`;
  `loadPlayerState()` → apply `persistence.initialPlayerState`. Corrupt/failed loads surface through
  the save-status UI (never silent).
- Save triggers: pagehide + dispose (existing) enqueue player state then `flush()`; plus a periodic
  5 s player-state enqueue aligned with the coordinator tick (abrupt-close durability). Edit data is
  captured continuously on every `setBlock`.
- The old localStorage write path (`saveEdits`/`savePlayerState` `setItem` calls) is deleted;
  localStorage remains a read-only migration source.
- New persistent save-health UI: `#save-status` element in `index.html` inside `#ui-root` +
  `src/ui/SaveStatusIndicator.ts` (pattern follows existing UI classes). States: hidden (ok),
  "Save delayed — retrying" (degraded), "Saves failing — progress at risk" (failed). Clears only on
  verified recovery.

## G. E2E fault injection policy

No production test hooks. Playwright `addInitScript` stubs the storage environment before app
scripts run: quota-equivalent (IDB requests rejecting with `QuotaExceededError`), private-mode
equivalent (`indexedDB.open` throwing `SecurityError`), transaction abort (one-shot aborting fake),
and legacy-save seeding via real `localStorage`. E2E boots the real production bundle
(`VITE_E2E=true` build). SEC-001 closure: a release-bundle assertion script proves a plain
(`npm run build`) artifact contains no `__voxelGame` hook.

## H. Out of scope / unchanged

- `stateOverlay` (block states) persistence — unchanged pre-existing scope limit (125).
- Server lifecycle (`ServerSaveLifecycle`), archives, recovery-matrix harnesses — reused as-is.
- Settings/keybindings/accessibility localStorage reads — unchanged (non-authoritative prefs).
