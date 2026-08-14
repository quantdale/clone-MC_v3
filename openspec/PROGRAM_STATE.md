# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **040-legacy-localstorage-migration — VERIFIED 100%**
- Active implementation change: **040-legacy-localstorage-migration — VERIFIED**
- Next change: **041-save-schema-migrations — NOT YET ACTIVE (artifacts pending)**
- 040 task ledger: **7 total tasks, 7 completed**
- 040 completion: **100%**
- 040 mandatory legacy-localstorage-migration requirements: **PASS**
- 040 required-test gate: **PASS — unit 570/570, E2E 19/19**
- 040 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `8df59e8708150a7ce649a3c99324bd7b5a495e2d`
- Next exact action: **Advance to 041-save-schema-migrations. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (041 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement ordered persistent schema/data-version migrations over the 034-040 world database, verify full gate, commit + push, advance program state.**

## What 040 implemented

Change 040 adds the migration path from the legacy localStorage saves into the new persistence layer,
plus the player-state store those saves need.

- `src/storage/WorldMetadata.ts` / `WorldMetadataRepository.ts` — `WORLD_DB_VERSION` `4 → 5`;
  `WORLD_PLAYER_STATE_STORE = 'player-state'` added to the shared `ensureWorldStores`.
- `src/storage/PlayerStateRecord.ts` (NEW) — `PlayerStateRecord` (worldId-keyed position/yaw/pitch +
  opaque inventory/survival payloads) and `validatePlayerStateRecord`.
- `src/storage/PlayerStateRepository.ts` (NEW) — injectable-factory repository over `player-state`
  (`putPlayerState`/`getPlayerState`/`deletePlayerState`/`listPlayerStates`/`close`).
- `src/storage/LegacyLocalStorageMigrator.ts` (NEW) — `StorageLike`, legacy snapshot validators,
  registry-free converters (`buildSectionContainer` with palette `[0, ...ids]`, `editsToSerializedChunkColumn`,
  `toPlayerStateRecord`), and `LegacyLocalStorageMigrator.migrate(seed)` producing a
  `LegacyMigrationReport`. Non-destructive (reads only), per-artifact errors, no partial writes.
- `tests/unit/LegacyLocalStorageMigrator.test.ts` (NEW) — 11 tests: converters round-trip through
  `ChunkColumn.deserialize`, player-state repository behavior, end-to-end migration, malformed-input
  error handling, read-only legacy storage, and in-place v4→v5 migration preserving all prior stores
  and records.

## Validation evidence (040)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 570/570 (prior 559 + 11 new LegacyLocalStorageMigrator tests)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 040 is **VERIFIED** at 7/7 (100%). All gates are green: typecheck, lint, the new 040 suite
(11/11), the full unit suite (570/570), production build, and the required E2E suite (19/19). No
advancement exception was needed. The world database now carries all five stores at schema version 5
with a tested v4→v5 upgrade and a non-destructive legacy import path.

## Next change: 041 (pending artifacts)

`041-save-schema-migrations` is named in `CHANGE_SEQUENCE.md` with scope "Ordered persistent
schema/data-version migrations." It builds on 034-040 by providing an ordered migration framework over
the five-store world database and its records. Per `AGENTS.md`, a change lacking full artifacts is a
hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 040 verification.
Change 041 is the next change; its artifacts must be authored and validated before implementation
begins.
