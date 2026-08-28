# Tasks: 234-server-world-persistence

## 1. Baseline / characterization

- [x] 1.1 Record the current persistence + codec entry points and exact shared-record shapes into `design.md` (`ChunkColumn.serialize`/`deserialize` (035), `EntityManager.serializeChunk`/`deserializeChunk` (131), `BlockEntityManager.serializeChunk`/`deserializeChunk` (036), `WorldMetadata` (034), `PlayerStateRecord` (040), the shared `validate*` functions, `DataMigrationChain` (041), `SaveUnit`/`SaveSink`/`RepositorySaveSink` (038), `StorageHealthMonitor.canWrite` (043)); confirm no server-owned save wiring exists in `main.ts` or `WorldTickProcess`, and capture the baseline regression gate as pre-implementation evidence.

## 2. Persistent codec seam (`src/simulation/PersistentWorldCodecs.ts`)

- [x] 2.1 Define `PersistentUnitKind`, `ServerWorldUnit`, `WorldCodecMeta`, `WorldSaveCodec`, `unitKey`, and strict validation helpers (unknown kind, non-integer chunk coords, missing `value`, foreign/mis-versioned rejection) with `PersistentWorldCodecs: <detail>` errors.
- [x] 2.2 Implement `encode` and `decode` for all five kinds: encode output passes the shared validator for the kind; decode applies the 041 migration chain then validates before returning a unit; `DOWNGRADE`/`UNKNOWN_VERSION` and malformed payloads are rejected.
- [x] 2.3 Implement the production `WorldSaveCodec` adapter wiring the existing per-system serializers/deserializers (`ChunkColumn.serialize`/`deserialize`, `EntityManager.serializeChunk`/`deserializeChunk`, `BlockEntityManager.serializeChunk`/`deserializeChunk`, `WorldMetadata`, `PlayerStateRecord`).

## 3. Server save lifecycle (`src/simulation/ServerSaveLifecycle.ts`)

- [x] 3.1 Define `ServerSaveState`, `SaveLoadBoundary`, `PersistedWorldSnapshot`, `SaveFailureKind`, `SaveFailure`, `ServerSaveLifecycleOptions`, `LoadResult`, and the `ServerSaveLifecycle` skeleton with option/state validation (`ServerSaveLifecycle: <detail>` throws for invalid options and out-of-state operations).
- [x] 3.2 Implement `load(worldId, restore)`: `readWorld` + decode all records, all-or-nothing rollback to `unloaded` on any failure, `created`/`loaded` result, deterministic restore order.
- [x] 3.3 Implement `markDirty` (running-only, keyed de-duplication, FIFO preserved) and bounded drain with encode-at-drain, remove-only-on-success, re-queue/retry, and encode-failure no-loss semantics.
- [x] 3.4 Implement tick-driven autosave (`TickSystem` cadence `tick % autosaveEveryTicks === 0`), `flush`/`saveAndClose` with a zero-progress guard and `closed` transition, storage-health gating (`storageGate.canWrite()` false → no writes, units pending), and classified `SaveFailure` recording.

## 4. Validation & tests / integration / gate

- [x] 4.1 Unit tests for `PersistentWorldCodecs`: round-trip fidelity, validator-passing encode, migrate-then-validate decode, foreign/mis-versioned rejection, determinism, unknown kind/malformed payload.
- [x] 4.2 Unit tests for `ServerSaveLifecycle` state machine and load: `unloaded→loading→running`, `created`/`loaded` outcomes, all-or-nothing load rollback, stale `load`/`markDirty` rejection.
- [x] 4.3 Unit tests for drain semantics: FIFO order, de-duplicate/re-mark, bounded `limitPerDrain`, retry/no-loss on write failure, encode-failure keeps pending, storage-gate fencing and recovery.
- [x] 4.4 Unit tests for autosave cadence and flush/save-and-close: on-cadence drain, off-cadence no-op, empty-queue zero drain, drain-to-empty, zero-progress guard, `closed` terminal state.
- [x] 4.5 Integration test: a `WorldTickProcess`-hosted lifecycle round-trips a small world (load → mutate → drain on cadence → `saveAndClose` → reload) deterministically using a test `SaveLoadBoundary` and the production codec adapter.
- [x] 4.6 Run baseline regression gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`).
- [x] 4.7 Update `verification.md`, `PROGRAM_STATE.json`, and `PROGRAM_STATE.md` with complete evidence and advance change to VERIFIED.
