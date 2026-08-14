# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **036-block-entity-persistence-store — VERIFIED 100%**
- Active implementation change: **036-block-entity-persistence-store — VERIFIED**
- Next change: **037-entity-persistence-store — NOT YET ACTIVE (artifacts pending)**
- 036 task ledger: **7 total tasks, 7 completed**
- 036 completion: **100%**
- 036 mandatory block-entity-persistence-store requirements: **PASS**
- 036 required-test gate: **PASS — unit 529/529, E2E 19/19**
- 036 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `822c62c7dab6d7ff7c80967ba40ad96117dc5e2f`
- Next exact action: **Advance to 037-entity-persistence-store. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (037 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement a separate entity object store on the same voxel-world-db (bump WORLD_DB_VERSION with an onupgradeneeded step via shared ensureWorldStores), and a typed repository, verify full gate, commit + push, advance program state.**

## What 036 implemented

Change 036 persists and reloads block-entity records in the same versioned IndexedDB database
established by 034/035, behind a typed, injectable-factory repository boundary. A live block-entity
instance/behavior does not yet exist (018 only defines the `BlockEntityTypeRegistry`), so 036 defines a
decoupled, forward-compatible persistence envelope and groups entities per chunk.

- `src/storage/WorldMetadata.ts` — `WORLD_DB_VERSION` bumped `2 → 3`; added
  `WORLD_BLOCK_ENTITY_STORE = 'block-entities'`.
- `src/storage/WorldMetadataRepository.ts` — added a `block-entities` branch (keyPath `key`) inside the
  shared `ensureWorldStores(db)` routine; a v2→v3 open adds the new store while preserving
  `world-metadata` and `chunk-sections`.
- `src/storage/BlockEntityRecord.ts` (NEW) — `SerializedBlockEntity` (`schemaVersion`, `typeKey`,
  `x`/`y`/`z`, `data`) and `BlockEntityChunkRecord` (`key`, `worldId`, `chunkX`, `chunkZ`, `entities`),
  plus `validateSerializedBlockEntity` and `validateBlockEntityChunkRecord` (reject malformed records
  before any write).
- `src/storage/BlockEntityRepository.ts` (NEW) — `BlockEntityRepository` (injectable `IDBFactory`,
  `open`/`close`, `putChunkEntities`/`getChunkEntities`/`listChunks`/`deleteChunkEntities` over the
  `block-entities` store keyed `worldId|chunkX|chunkZ`). The repository is decoupled from any live
  block-entity framework; the `data` payload is opaque.
- `tests/unit/BlockEntityRepository.test.ts` (NEW) — 16 tests covering store creation (all three
  stores), put/get round-trip, absent-chunk null, list-by-world isolation, delete, validation
  rejection (writes nothing), construction without a global `indexedDB`, and in-place v2→v3 migration
  preserving the prior stores and their records.

## Validation evidence (036)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 529/529 (prior 513 + 16 new BlockEntityRepository tests)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 036 is **VERIFIED** at 7/7 (100%). All gates are green: typecheck, lint, the new 036 suite
(16/16), the full unit suite (529/529), production build, and the required E2E suite (19/19). No
advancement exception was needed. The repository boundary remains injectable and dependency-free; the
only browser-global touch is inside `browserIdbFactory`, shared with 034/035.

## Next change: 037 (pending artifacts)

`037-entity-persistence-store` is named in `CHANGE_SEQUENCE.md` with scope "Separate persistent entity
records per chunk/dimension." It builds on 036 by adding an `entities` store to the same `voxel-world-db`
database and bumping `WORLD_DB_VERSION` with a new `onupgradeneeded` step routed through the shared
`ensureWorldStores`. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation
block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 036 verification.
Change 037 is the next change; its artifacts must be authored and validated before implementation
begins.
