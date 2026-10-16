# Proposal: 234-server-world-persistence

## Problem

The persistent storage layer (034-043) is complete and unit-tested but is **not owned by any runtime**. The five IndexedDB repositories (`WorldMetadataRepository`, `ChunkSectionRepository`, `BlockEntityRepository`, `EntityRepository`, `PlayerStateRepository`), the dirty-save queue (`DirtySaveQueue` + `SaveSink` + `RepositorySaveSink`), the autosave policy (`AutosaveCoordinator`), the data-version migration chains (`DataMigrationChain`), the world archiver (`WorldArchiver`), and the storage-health monitor (`StorageHealthMonitor`) are all standalone, injectable, headless modules. `main.ts` wires none of them, and `WorldTickProcess` (224) has no save system registered.

Meanwhile the shared simulation codecs already exist per system: `ChunkColumn.serialize`/`deserialize` (035), `EntityManager.serializeChunk`/`deserializeChunk` (131) onto the 037 `SerializedEntity` envelope, `BlockEntityManager.serializeChunk`/`deserializeChunk` (036), plus the `WorldMetadata` (034) and `PlayerStateRecord` (040) records and the shared validators and `DataMigrationChain` (041). These are the *shared persistent codecs* the save layer is meant to reuse.

What is missing is the **server-owned save lifecycle**: a headless, deterministic owner that (a) loads a world from the shared repositories into server-authoritative state, (b) tracks dirty world units and drains them through the shared save pipeline with bounded, no-loss, retry semantics, (c) drives autosave as a `WorldTickProcess` `TickSystem`, (d) performs a graceful drain-to-empty on server stop, and (e) gates writes on storage health (043). Change 234 builds that lifecycle and the explicit persistent-codec seam it consumes.

## Goals

- A pure headless `ServerSaveLifecycle` state machine: `unloaded → loading → running → flushing → closed`, driven as a `TickSystem` by `WorldTickProcess` (224).
- Server-owned dirty tracking: mark world units dirty (chunk sections, block entities, entities, world metadata, player state) and drain them through the shared persistence pipeline with FIFO ordering, de-duplication by key, bounded work per drain, and no-loss retry.
- A graceful save-on-stop (`flush`/`saveAndClose`) that drains to empty with a zero-progress guard.
- An explicit **shared persistent codec** seam (`WorldSaveCodec`) that serializes in-memory server units into the existing persisted record shapes (035-040), applies data-version migration (041) on decode, and validates every payload against the shared validators — so the same records written by the client save path load on the server and vice versa.
- Storage-health gating (043): when `canWrite()` is false the lifecycle stops attempting writes, keeps units pending, and records a classified failure.
- Deterministic, injectable, headless-safe module in `src/simulation/` following the 222-233 patterns (`Module: <detail>` throws, strict validation, bounded limits).

## Non-goals

- No new network/wire protocol or save/load messages over the 223 codecs; persistence is local to the server through the shared record codecs.
- No per-client save profiles or multi-player player-state registry; 234 persists the world-level player-state record (040). Per-connection profiles and reconnect resynchronization belong to 235 `reconnect-state-recovery`.
- No client-side resync, prediction, or rollback on load; the client reads server-chunk snapshots via 226 streaming, not the persistence repositories.
- No change to the persisted record shapes, IndexedDB schema (`WORLD_DB_VERSION`), or migration chains; 234 consumes them as-is. New schema/shape work would be its own change.
- No export/import UI, quota-recovery UI, or archiver changes (042/043 are consumed, not modified).
- No full-world scan or validation beyond the shared validators/migrations (240 `save-recovery-stress` and 249 audit own deep recovery/adversarial matrices).

## Preconditions

- 224 `dedicated-server-tick-loop` VERIFIED (`WorldTickProcess` + `TickSystem` available).
- 034-043 persistent storage layer VERIFIED (repositories, dirty queue, autosave, migrations, archiver, health).
- 131 `entity-persistence-runtime` VERIFIED (`EntityManager.serializeChunk`/`deserializeChunk`).
- 036 block-entity persistence and 052 block-entity framework available (`BlockEntityManager.serializeChunk`/`deserializeChunk`).
- 223 network-protocol-codecs VERIFIED (establishes the shared-codec discipline; not reused for persistence in this change).

## Dependencies

- Shared persistent record types: `SerializedChunkColumn` (035), `SerializedBlockEntity`/`BlockEntityChunkRecord` (036), `SerializedEntity`/`EntityChunkRecord` (037), `WorldMetadata` (034), `PlayerStateRecord` (040).
- Shared validators and migration chains: `validate*` helpers and `DataMigrationChain`/`migrateChunkColumn`/`migrateWorldMetadata` (041).
- Shared save pipeline: `DirtySaveQueue`/`SaveSink` semantics (038) and `RepositorySaveSink` routing (038); `StorageHealthMonitor.canWrite()` (043).
- `WorldTickProcess.TickSystem` (224) for tick-driven autosave.

## Proposed change

Two new pure headless modules under `src/simulation/`:

1. `PersistentWorldCodecs.ts` — the shared persistent-codec seam:
   - `PersistentUnitKind = 'world-metadata' | 'chunk-sections' | 'block-entities' | 'entities' | 'player-state'`.
   - `ServerWorldUnit { kind, worldId, chunkX, chunkZ, value }` and `WorldCodecMeta`.
   - `WorldSaveCodec.encode(unit)` → a payload that passes the shared validator for `kind`.
   - `WorldSaveCodec.decode(payload, meta)` → migrates (041) then validates, returning an in-memory unit; rejects foreign/mis-versioned/malformed input with descriptive `PersistentWorldCodecs: <detail>` errors.
   - A production adapter wiring the existing per-system serialize/deserialize (035/036/131) and record constructors.

2. `ServerSaveLifecycle.ts` — the server-owned lifecycle:
   - State machine `unloaded | loading | running | flushing | closed`.
   - `load(worldId, restore)`: reads the world through a `SaveLoadBoundary` seam, decodes/migrates/validates every record, then calls `restore(unit)` per in-memory unit; all-or-nothing (any failure rolls back to `unloaded` with the server world untouched).
   - `markDirty(unit)` (running only): de-duplicated by `${kind}|${worldId}|${chunkX}|${chunkZ}`.
   - `tick(tick)`: bounded drain every `autosaveEveryTicks` ticks.
   - `flush()` / `saveAndClose()`: drain-to-empty with zero-progress guard; `closed` on success.
   - Storage-health gating via an injected `{ canWrite() }` gate; failures recorded as classified `SaveFailure` entries.

## Compatibility and migration

Pure addition. No persisted record shape, no IndexedDB schema version, and no migration chain changes. The lifecycle reads and writes the exact records 034-040 already define, so a world saved by the existing client path loads on the server and back. Decode applies the existing 041 migration chains before restore; encode writes records at current versions. No existing module import changes.

## Risks

- Stale write on re-mark before drain → pinned: encode-at-drain writes the newest in-memory value, and re-marking a key keeps its FIFO position (038 semantics).
- Partial-write/crash during a drain → pinned: a unit is removed from the pending set only after its write resolves; a rejected/failed write re-queues the unit at the end (no silent loss). IndexedDB transactional atomicity remains the repository's responsibility (039).
- Load of a corrupt/mis-versioned world leaves a half-built server world → pinned: load decodes and validates all records before any `restore`; any failure rolls back to `unloaded` and the server world is untouched.
- Storage failure (quota/private-mode) → pinned: `storageGate.canWrite()` fences writes, units stay pending, failures are classified (043 conventions).

## Rollback strategy

Delete `src/simulation/PersistentWorldCodecs.ts`, `src/simulation/ServerSaveLifecycle.ts`, and `tests/unit/PersistentWorldCodecs.test.ts` / `tests/unit/ServerSaveLifecycle.test.ts`. No schema or existing-file changes to revert.

## Definition of Done

Spec requirements for `persistent-world-codecs` and `server-save-lifecycle` verified by unit/integration tests; a small-world load→mutate→drain→reload round-trip is exercised; the baseline gate `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` all PASS; OpenSpec state updated.

## Advancement gate

100% task completion; all mandatory MUST/SHALL requirements verified; no unresolved data-loss, corruption, determinism, or compatibility blocker; regression gate green.
