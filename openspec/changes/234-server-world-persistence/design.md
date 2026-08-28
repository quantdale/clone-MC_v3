# Design: 234-server-world-persistence

## Context/current state

The persistent storage layer (034-043) is complete, standalone, and headless-testable:

- **Repositories** (each injectable `IdbFactoryLike`, one shared `voxel-world-db`): `WorldMetadataRepository` (034), `ChunkSectionRepository` (035), `BlockEntityRepository` (036), `EntityRepository` (037), `PlayerStateRepository` (040).
- **Save pipeline**: `DirtySaveQueue` (038) keyed/FIFO/bounded/no-loss; `SaveSink`; `RepositorySaveSink` routes a `SaveUnit` (`kind` ∈ `world-metadata | chunk-sections | block-entities | entities`) to the matching repository. Note `SaveUnitKind` has **four** queue kinds; player-state is a separate store not routed through the queue.
- **Autosave**: `AutosaveCoordinator` (039) drives a queue on an interval and `pagehide`/`visibilitychange`. Wall-clock/browser-oriented.
- **Migrations**: `DataMigrationChain` + `migrateChunkColumn`/`migrateWorldMetadata` (041), currently identity.
- **Archive**: `WorldArchiver` (042) export/import over all five repositories.
- **Health**: `StorageHealthMonitor` (043) with `canWrite()`, classified failures (`quota`/`private-mode`/`unavailable`/`unknown`).

Serialization codecs already exist per system:
- `ChunkColumn.serialize()` / `deserialize` (035) → `SerializedChunkColumn`; `ChunkSectionRepository.validateSerializedChunkColumn`.
- `BlockEntityManager.serializeChunk(cx,cz)` / `deserializeChunk` (036) → `SerializedBlockEntity[]`; `BlockEntityRecord.validate*`.
- `EntityManager.serializeChunk(cx,cz)` / `deserializeChunk` (131) → `SerializedEntity[]`; `EntityRecord.validate*`.
- `WorldMetadata` (034) and `PlayerStateRecord` (040) records and validators.

The runtime does **not** currently wire these together. `main.ts` references none of the repositories/queue/archiver; `WorldTickProcess` (224) has no save `TickSystem`. `EntityReplicationManager` (229) and `ChunkStreamManager` (226) hold per-connection transient view state (observer interest, snapshots) that is **not** authoritative world state and is **not** persisted here — it is rebuilt per connection (235 owns resynchronization).

## Baseline (recorded during 234, task 1.1)

Verified against the actual codebase at session start (HEAD `c538d328094f9b180cd6775dd82c46947e883ee0`):

- **034 `WorldMetadata`** (`src/storage/WorldMetadata.ts`): `WorldMetadata { schemaVersion, worldId, seed, dimensionId, minY, height, createdAt, updatedAt }`; `validateWorldMetadata`. `WORLD_DB_VERSION = 5`; stores `world-metadata` (v1), `chunk-sections` (v2), `block-entities` (v3), `entities` (v4), `player-state` (v5).
- **035 `ChunkColumn`** (`src/world/ChunkColumn.ts`): `serialize(): SerializedChunkColumn { version, chunkX, chunkZ, sectionCount, minSectionY, sections: Record<number, SerializedPalettedContainer> }`; `static deserialize(data, registry, airId?)`; `CHUNK_COLUMN_VERSION = 1`. Validator `validateSerializedChunkColumn` lives in `src/storage/ChunkSectionRepository.ts`.
- **036 block entities** (`src/storage/BlockEntityRecord.ts` + `src/simulation/BlockEntityManager.ts`): `SerializedBlockEntity { schemaVersion, typeKey, x, y, z, data }`, `BlockEntityChunkRecord { key, worldId, chunkX, chunkZ, entities }`; `BlockEntityManager.serializeChunk(cx, cz): SerializedBlockEntity[]` and `deserializeChunk(cx, cz, entities): number`; validators `validateSerializedBlockEntity`/`validateBlockEntityChunkRecord`.
- **037 entities** (`src/storage/EntityRecord.ts` + `src/simulation/EntityManager.ts`): `SerializedEntity { schemaVersion, typeKey, x, y, z, data }`, `EntityChunkRecord { key, worldId, chunkX, chunkZ, entities }`; `EntityManager.serializeChunk(cx, cz): SerializedEntity[]` and `deserializeChunk(cx, cz, entities): number` (131); validators `validateSerializedEntity`/`validateEntityChunkRecord`.
- **040 `PlayerStateRecord`** (`src/storage/PlayerStateRecord.ts`): `{ key, worldId, seed, position, yaw, pitch, inventory, survival, experience }`; `validatePlayerStateRecord`.
- **038 queue** (`src/storage/DirtySaveQueue.ts`): `SaveUnitKind = 'world-metadata' | 'chunk-sections' | 'block-entities' | 'entities'` (four kinds — there is **no** `player-state` queue kind), `SaveUnit { key, kind, worldId, chunkX, chunkZ, payload }`, `SaveSink.write(unit)`, `DirtySaveQueue` (FIFO, dedupe by key, re-queue on failure). `RepositorySaveSink` (038) routes the four kinds to their repositories and rejects unknown kinds. Player state is a separate store (040) and is deliberately **not** routed through the queue.
- **041 migrations** (`src/storage/DataMigration.ts`): `DataMigrationChain<T>` with `baseVersion`/`register`/`migrate` (GAP/DUPLICATE/DOWNGRADE/UNKNOWN_VERSION); `WORLD_METADATA_MIGRATIONS` (base 1) + `migrateWorldMetadata`, `CHUNK_COLUMN_MIGRATIONS` (base 1) + `migrateChunkColumn` — both currently identity (no registered steps).
- **043 health** (`src/storage/StorageHealth.ts`): `StorageHealthMonitor.canWrite()`, pure `classifyStorageError` → `quota`/`private-mode`/`unavailable`/`unknown`.
- Repositories: `WorldMetadataRepository` (`putMetadata`/`getMetadata`/`listMetadata`/`deleteMetadata`), `ChunkSectionRepository` (`putColumn(worldId, column)`/`getColumn`/`listColumns(worldId)`), `BlockEntityRepository`/`EntityRepository` (`putChunkEntities(worldId, cx, cz, entities)`/`listChunks(worldId)`), `PlayerStateRepository` (`putPlayerState`/`getPlayerState`/`listPlayerStates`).
- **224 `WorldTickProcess`** (`src/simulation/WorldTickProcess.ts`): `TickSystem { tick(tick: number): void }`, 1-based monotonic ticks, `step(times)` for deterministic headless stepping.
- **No server-owned save wiring exists**: `src/main.ts` imports no storage module, no `DirtySaveQueue`/`AutosaveCoordinator`/`WorldArchiver`/`StorageHealthMonitor`, and no `WorldTickProcess` (grep at session start); `WorldTickProcess` has no save system registered.
- Baseline regression gate before any change (task 1.1 evidence, recorded in `verification.md`): typecheck PASS, lint PASS, unit 3191/3191 PASS, build PASS, e2e 22/22 PASS.

## Reconciliation notes (234)

Final implementation decisions, reconciled against the pre-authored artifacts and the actual code:

- **Codec value semantics.** `ServerWorldUnit.value` is the in-memory server value: for `chunk-sections` a `ChunkColumn` (structural `{ serialize() }`), for `block-entities`/`entities` the `SerializedBlockEntity[]`/`SerializedEntity[]` group, for `world-metadata`/`player-state` the record object. `encode` produces the shared persisted payload (`SerializedChunkColumn` / `BlockEntityChunkRecord` / `EntityChunkRecord` / `WorldMetadata` / `PlayerStateRecord`), each passing its shared validator. `decode` produces a restore-ready unit: `ChunkColumn` deserialized through the injected `BlockStateRegistry` for `chunk-sections`, the validated entity arrays for the group kinds, or the validated record objects. Round-trip value equivalence (PWC REQ-3) is therefore per kind: for group kinds `decode(encode(unit)).value` deep-equals `encode(unit).entities`; for `chunk-sections` `decode(encode(unit)).value.serialize()` deep-equals `encode(unit)`; for metadata/player-state the value deep-equals the record.
- **Migration seams are injectable.** The real 041 chains are module-level and currently identity, so `createWorldSaveCodec` accepts `migrateColumn`/`migrateMetadata` functions (defaults: `migrateChunkColumn`/`migrateWorldMetadata`). Tests inject a stub migration to exercise migrate-then-validate (PWC REQ-2) and use the real chain for `DOWNGRADE`/`UNKNOWN_VERSION` rejection.
- **`tick` is synchronous, drains are asynchronous.** Autosave drains are serialized on an internal promise chain so drains never interleave out of FIFO order across ticks. `idle(): Promise<void>` awaits all scheduled drains — an added API beyond the pre-authored sketch, needed by hosts/tests to observe drain completion deterministically.
- **Remove-only-on-success with an identity check.** A pending entry is removed only when `pending.get(key) === unit`; a unit re-marked while its write is in flight stays pending with the newer value (no stale write, no drop, position preserved). Failed writes/encodes re-queue the pending value at the end (038 semantics).
- **`lastFailures` is bounded** at 32 entries (oldest dropped) so a persistently failing storage cannot grow memory without bound.
- **Load determinism.** Snapshot records are sorted by key per kind before decode/restore; duplicate keys within one kind reject the load before any restore.
- **Singleton kinds** (`world-metadata`, `player-state`) require `chunkX = chunkZ = 0`; enforced by the shared `validatePersistentUnit`/`validateWorldCodecMeta` helpers used by both modules (codec and lifecycle).
- **REQ-2 re-mark scenario amended.** The pre-authored spec scenario "Re-mark replaces value and keeps FIFO position" stated the drain writes `unitB` first, then `unitA` — contradicting its own FIFO invariant, the 038 `DirtySaveQueue` semantics (`Map.set` on an existing key preserves insertion order), and the verification boundary list ("preserves FIFO position"). The scenario now states `unitA` drains first (original position kept) with the newer value, then `unitB`. The implementation relies on the pending `Map`'s set-on-existing-key behavior, which preserves FIFO position while replacing the value.

## Target state

Two new pure, headless, client/server-shareable modules under `src/simulation/`:

1. **`PersistentWorldCodecs.ts`** — the shared persistent-codec seam. A `WorldSaveCodec` that converts in-memory server units to/from the shared persisted record shapes (035-040), applying shared validation and 041 migration. This is the single typed contract the lifecycle uses, so it is decoupled from concrete systems and unit-testable with stub serializers.
2. **`ServerSaveLifecycle.ts`** — the server-owned save lifecycle. A `TickSystem` state machine that loads a world, tracks dirty units, drains them through a `SaveLoadBoundary` (backed in production by the repositories/`RepositorySaveSink`/`PlayerStateRepository`), autosaves on tick cadence, gates on storage health, and flushes gracefully on stop.

A production wiring assembly (constructing repositories, `RepositorySaveSink`, the `SaveLoadBoundary`, a `WorldSaveCodec` adapter over the real per-system serializers, and registering the lifecycle in a `WorldTickProcess`) may live in the app entry point, but the lifecycle and codec modules themselves must remain injectable and headless.

## Invariants

- **State ordering**: Transitions are exactly `unloaded → loading → running → flushing → closed`; `loading` failures return to `unloaded`; no operation except inspection is legal in `closed` (marking dirty after `closed` throws).
- **No silent loss**: A dirty unit leaves the pending set only after its write resolves successfully; a rejected/failed write re-queues the unit at the end (038 semantics). An encode failure likewise keeps the unit pending.
- **Key uniqueness**: A unit is identified by `unitKey = `${kind}|${worldId}|${chunkX}|${chunkZ}`; re-marking the same key replaces the pending unit but preserves its FIFO position.
- **Write latest**: Encoding happens at drain time from the current in-memory `value`, so a re-marked unit is always written with its newest state (no stale write).
- **All-or-nothing load**: `load` decodes and validates every record for the world before calling `restore` for any of them; any failure leaves the server world untouched and the lifecycle at `unloaded`.
- **Storage gating**: Writes are not attempted while `storageGate.canWrite()` is false; pending units remain pending.
- **Determinism**: Given identical injected boundaries/codec and identical `markDirty`/`tick` schedules, the lifecycle produces identical drain order, write calls, and outcomes.

## API and data model

```ts
// ---------- PersistentWorldCodecs.ts ----------
export type PersistentUnitKind =
  | 'world-metadata' | 'chunk-sections' | 'block-entities' | 'entities' | 'player-state';

export interface ServerWorldUnit {
  readonly kind: PersistentUnitKind;
  readonly worldId: string;
  readonly chunkX: number; // 0 for world-metadata and player-state
  readonly chunkZ: number; // 0 for world-metadata and player-state
  /** In-memory server value to persist (ChunkColumn, block-entity group, entity group,
   *  WorldMetadata object, or PlayerStateRecord object). */
  readonly value: unknown;
}

export interface WorldCodecMeta {
  readonly kind: PersistentUnitKind;
  readonly worldId: string;
  readonly chunkX: number; // 0 for world-metadata and player-state
  readonly chunkZ: number; // 0 for world-metadata and player-state
}

export interface WorldSaveCodec {
  /** Serialize an in-memory unit into the shared persisted payload for `kind`.
   *  The returned payload MUST pass the shared validator for `kind`. */
  encode(unit: ServerWorldUnit): unknown;
  /** Migrate (041), then validate, then produce the in-memory unit ready for restore.
   *  Throws `PersistentWorldCodecs: <detail>` on invalid/mis-versioned/foreign input. */
  decode(payload: unknown, meta: WorldCodecMeta): ServerWorldUnit;
}

/** Strict unit/meta validation shared by codec and lifecycle; throws `PersistentWorldCodecs: <detail>`. */
export function validatePersistentUnit(input: unknown): ServerWorldUnit;
export function validateWorldCodecMeta(input: unknown): WorldCodecMeta;

/** Production adapter wiring 035/036/131 serializers + 034/040 records and validators. */
export interface WorldSaveCodecDeps {
  readonly registry: BlockStateRegistry; // for ChunkColumn.deserialize on decode
  readonly migrateColumn?: (record: SerializedChunkColumn) => SerializedChunkColumn; // default migrateChunkColumn
  readonly migrateMetadata?: (record: WorldMetadata) => WorldMetadata; // default migrateWorldMetadata
}
export function createWorldSaveCodec(deps: WorldSaveCodecDeps): WorldSaveCodec;

/** Unit key shared by codec and lifecycle; matches 038 keying convention. */
export function unitKey(unit: { kind: PersistentUnitKind; worldId: string; chunkX: number; chunkZ: number }): string;

// ---------- ServerSaveLifecycle.ts ----------
export type ServerSaveState = 'unloaded' | 'loading' | 'running' | 'flushing' | 'closed';

/** Persisted records for one world, as returned by the boundary (de-duplicated by key). */
export interface PersistedWorldSnapshot {
  metadata: WorldMetadata | null;
  playerState: PlayerStateRecord | null;
  columns: readonly SerializedChunkColumn[];        // de-duplicated by (chunkX,chunkZ)
  blockEntityChunks: readonly BlockEntityChunkRecord[];
  entityChunks: readonly EntityChunkRecord[];
}

export interface SaveLoadBoundary {
  /** Read all persisted records for `worldId`, or null when the world has none. */
  readWorld(worldId: string): Promise<PersistedWorldSnapshot | null>;
  /** Persist one encoded queue-kind unit (world-metadata | chunk-sections | block-entities | entities). */
  write(unit: SaveUnit): Promise<void>;
  /** Persist the world's player-state record. */
  writePlayerState(record: PlayerStateRecord): Promise<void>;
}

export type SaveFailureKind = 'storage' | 'encode' | 'quota' | 'private-mode' | 'unavailable' | 'unknown';

export interface SaveFailure {
  readonly kind: SaveFailureKind;
  readonly message: string;
  readonly at: number;
  readonly unitKey: string | null; // failing unit, or null for lifecycle-level failures
}

export interface ServerSaveLifecycleOptions {
  readonly codec: WorldSaveCodec;
  readonly boundary: SaveLoadBoundary;
  readonly storageGate: { canWrite(): boolean };
  /** Drain one batch every N ticks (default 100 = 5s at 20 TPS). */
  readonly autosaveEveryTicks?: number;
  /** Bounded writes per drain (default 64). */
  readonly limitPerDrain?: number;
  /** Zero-progress runs that end a `flush` (default 3). */
  readonly flushZeroProgressLimit?: number;
}

export interface LoadResult {
  readonly worldId: string;
  readonly outcome: 'loaded' | 'created';
  readonly columns: number;
  readonly blockEntityChunks: number;
  readonly entityChunks: number;
  readonly metadata: boolean;
  readonly playerState: boolean;
}

export class ServerSaveLifecycle implements TickSystem {
  readonly state: ServerSaveState;
  readonly pendingCount: number;
  readonly lastFailures: readonly SaveFailure[];
  async load(worldId: string, restore: (unit: ServerWorldUnit) => void): Promise<LoadResult>;
  /** Mark a unit dirty (running only; de-duplicated by key, FIFO preserved). */
  markDirty(unit: ServerWorldUnit): void;
  /** Bounded autosave drain when `tick % autosaveEveryTicks === 0`. */
  tick(tick: number): void;
  /** Await all autosave drains scheduled so far (host/test aid; no state change). */
  async idle(): Promise<void>;
  /** Drain-to-empty with zero-progress guard; returns units written. */
  async flush(): Promise<number>;
  /** `flush()` then transition to `closed`; returns units written. */
  async saveAndClose(): Promise<number>;
  reset(): void;
}
```

## Control/data flow

**Load** (`load(worldId, restore)`):
1. Assert state is `unloaded`; set `loading`.
2. `snapshot = await boundary.readWorld(worldId)`.
3. If `snapshot === null`: set `running`, return `{ outcome: 'created', ...zeros }` (host builds a fresh world).
4. Else decode every record (metadata, player-state, each column, each block-entity chunk, each entity chunk) through `codec.decode` (migrate + validate). Collect the resulting `ServerWorldUnit`s in a scratch list. Any decode throw aborts the load: state → `unloaded`, throw, and call `restore` for **none** of the units.
5. Only after all decodes succeed, call `restore(unit)` for each decoded unit in a deterministic order (metadata, player-state, then columns by key, then block-entity chunks by key, then entity chunks by key). Set `running`. Return the `LoadResult`.

**Mark dirty** (`markDirty(unit)`): validate the unit (kind, worldId, chunk coords, `value` present); assert state is `running` (else throw `ServerSaveLifecycle: markDirty requires state 'running'`). Store/refresh `pending[unitKey(unit)] = unit` (Map preserves FIFO position on re-set).

**Tick** (`tick(tick)`): if state is not `running`, return. If `tick % autosaveEveryTicks === 0`, call `drain(limitPerDrain)`.

**Drain** (`drain(limit)`): if `pendingCount === 0`, return 0. If `storageGate.canWrite()` is false, record a `storage`-kind failure (`unitKey: null`) and return 0 (units stay pending). Take up to `limit` pending units in FIFO order. For each:
- `payload = codec.encode(unit)`; on throw, re-queue the unit at the end and record an `encode`-kind failure (unit not lost).
- For `kind === 'player-state'`: `await boundary.writePlayerState(payload)`; else build the `SaveUnit` (`key`, `kind`, `worldId`, `chunkX`, `chunkZ`, `payload`) and `await boundary.write(saveUnit)`.
- On success, remove the unit from pending and count it written. On throw, classify the error (043 conventions → `quota`/`private-mode`/`unavailable`/`unknown`, or `storage`), re-queue the unit at the end, and record a failure.
Return the number written.

**Flush** (`flush()`): state must be `running` or `flushing`; set `flushing`. Loop draining until `pendingCount === 0` or `flushZeroProgressLimit` consecutive zero-progress runs; each zero-progress run records a failure (storage gate down or a permanently failing unit). Return total written. On success the caller then calls `saveAndClose`'s state transition, or `flush()` alone leaves state `flushing`.

**saveAndClose()**: call `flush()`; on success set state `closed` and return the total. If flush could not empty the queue (zero-progress limit reached), keep state `flushing`, record the failure, and throw; the caller may retry or force-close.

## Detailed behavior

- **Keying**: `unitKey` = `` `${kind}|${worldId}|${chunkX}|${chunkZ}` `` (0,0 for metadata/player-state), matching 038 key style.
- **Singleton kinds**: `world-metadata` and `player-state` use `chunkX = chunkZ = 0`; the lifecycle rejects non-zero chunk coords for these kinds.
- **Codec determinism**: `encode` MUST NOT inject timestamps or randomness; `WorldMetadata`/`PlayerStateRecord` timestamp fields are managed by the metadata/player-state layer, not the codec.
- **Validation guarantee**: encode output passes the shared validator for `kind`; decode runs migrate-then-validate and rejects anything that fails either step.
- **Duplicate records on load**: the boundary's `columns`/`blockEntityChunks`/`entityChunks` are de-duplicated by key; if the boundary returns a duplicate key within one kind, `load` MUST reject it (ambiguous data) and roll back.
- **Foreign records**: a decoded record whose `worldId` differs from the requested `worldId` (or whose coordinates disagree with the unit key) MUST be rejected.

## Failure modes

- `load` while not `unloaded` → throw `ServerSaveLifecycle: load requires state 'unloaded'`.
- `markDirty` while not `running` → throw `ServerSaveLifecycle: markDirty requires state 'running'`.
- `tick` with non-safe-integer/negative tick → throw `ServerSaveLifecycle: tick must be a non-negative safe integer`.
- Invalid option values (non-positive `autosaveEveryTicks`, `limitPerDrain`, `flushZeroProgressLimit`) → throw `ServerSaveLifecycle: <detail>`.
- Invalid unit (unknown kind, empty `worldId`, non-integer chunk coords, missing `value`) → throw `ServerSaveLifecycle: <detail>`.
- Persistent write/encode failure → re-queue + recorded classified `SaveFailure`; no throw (drain is resilient).
- `flush` zero-progress limit reached → recorded failure; `saveAndClose` throws; state stays `flushing`.

## Compatibility/migration

Pure addition. No `WORLD_DB_VERSION`, no record shape, no migration-chain change. Decode applies the existing 041 chains; encode writes current-version records. A world saved by the client path (034-040) loads on the server and back through the shared codecs. Downstream, 235 reconnect-state-recovery consumes a server that owns a loaded, autosaved world.

## Performance/resource constraints

- Drain is O(limit) writes per call, FIFO; encode is per-unit. Pending map bounded by distinct dirty keys.
- Autosave cadence bounded by `autosaveEveryTicks`; empty queues cost a size check only.
- No allocations beyond encode payloads and failure records; no browser APIs; fully headless.

## Testing seams

- Codec unit tests with stub serializers (no concrete systems): round-trip, validator-passing encode, migrate-then-validate decode, foreign/mis-versioned rejection, determinism, unknown kind.
- Lifecycle unit tests with a fake `SaveLoadBoundary` and a fake `storageGate`: state transitions, load success/new-world/rollback, FIFO/dedupe/re-mark, bounded drain, retry/no-loss, encode-failure, storage-gate fencing, autosave cadence, flush/saveAndClose, stale operations.
- Integration test: a tiny in-memory boundary + a real `WorldSaveCodec` adapter over `ChunkColumn.serialize`/`EntityManager.serializeChunk`/`BlockEntityManager.serializeChunk` round-trips a small world (load → mutate → drain → reload) deterministically.
- A `WorldTickProcess`-hosted integration check that the lifecycle ticks at cadence and flushes on `saveAndClose`.

## Observability/debugging

- `state`, `pendingCount`, `lastFailures` (classified, with unit keys and timestamps).
- `LoadResult` counts and outcome.
- Optionally `nextAutosaveTick`/`autosaveEveryTicks` inspectors for scheduling.

## Affected files/symbols

- `src/simulation/PersistentWorldCodecs.ts` (NEW): `PersistentUnitKind`, `ServerWorldUnit`, `WorldCodecMeta`, `WorldSaveCodec`, `unitKey`, production adapter.
- `src/simulation/ServerSaveLifecycle.ts` (NEW): `ServerSaveState`, `PersistedWorldSnapshot`, `SaveLoadBoundary`, `SaveFailureKind`, `SaveFailure`, `ServerSaveLifecycleOptions`, `LoadResult`, `ServerSaveLifecycle`.
- `tests/unit/PersistentWorldCodecs.test.ts`, `tests/unit/ServerSaveLifecycle.test.ts` (NEW).
- No existing production files modified.

## Rejected alternatives

- *Reuse `DirtySaveQueue` and encode at `markDirty` time*: encoding eagerly on every mark duplicates work and risks writing a payload that is immediately stale; encode-at-drain always writes the newest state. The lifecycle keeps the same FIFO/dedupe/no-loss semantics over pending `ServerWorldUnit`s instead.
- *Reuse `AutosaveCoordinator`'s wall-clock interval*: a dedicated server is headless and deterministic; tick-driven cadence from `WorldTickProcess` is deterministic and testable without fake timers.
- *Persist `EntityReplicationManager`/`ChunkStreamManager` state*: those are per-connection transient view state rebuilt each connection; persisting them would couple the lifecycle to 229/226 and duplicate 235's job.
- *Route player-state through the 038 queue*: `SaveUnitKind` has no `player-state` kind and `RepositorySaveSink` has no player-state routing; the lifecycle uses the existing `PlayerStateRepository` boundary via `writePlayerState` instead.

## Downstream dependencies

- 235 `reconnect-state-recovery` (server owns a loaded, autosaving world for a reconnecting client).
- 236 `multiplayer-load-tests`, 240 `save-recovery-stress`, 249 `whole-codebase-adversarial-audit`.
