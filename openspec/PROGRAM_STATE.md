# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **037-entity-persistence-store — VERIFIED 100%**
- Active implementation change: **037-entity-persistence-store — VERIFIED**
- Next change: **038-dirty-save-queue — NOT YET ACTIVE (artifacts pending)**
- 037 task ledger: **7 total tasks, 7 completed**
- 037 completion: **100%**
- 037 mandatory entity-persistence-store requirements: **PASS**
- 037 required-test gate: **PASS — unit 545/545, E2E 19/19**
- 037 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `46b15f0653e65bd5d8dce208506c047599cb03b1`
- Next exact action: **Advance to 038-dirty-save-queue. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (038 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement an incremental dirty-unit save queue with bounded work over the 034-037 repositories, verify full gate, commit + push, advance program state.**

## What 037 implemented

Change 037 persists and reloads entity records in the same versioned IndexedDB database established by
034/035/036, behind a typed, injectable-factory repository boundary. A live entity instance/behavior
does not yet exist (017 only defines the `EntityTypeRegistry`), so 037 defines a decoupled,
forward-compatible persistence envelope and groups entities per chunk.

- `src/storage/WorldMetadata.ts` — `WORLD_DB_VERSION` bumped `3 → 4`; added `WORLD_ENTITY_STORE = 'entities'`.
- `src/storage/WorldMetadataRepository.ts` — added an `entities` branch (keyPath `key`) inside the
  shared `ensureWorldStores(db)` routine; a v3→v4 open adds the new store while preserving the three
  prior stores.
- `src/storage/EntityRecord.ts` (NEW) — `SerializedEntity` (`schemaVersion`, `typeKey`, `x`/`y`/`z`,
  `data`) and `EntityChunkRecord` (`key`, `worldId`, `chunkX`, `chunkZ`, `entities`), plus
  `validateSerializedEntity` and `validateEntityChunkRecord` (reject malformed records before any write).
- `src/storage/EntityRepository.ts` (NEW) — `EntityRepository` (injectable `IDBFactory`, `open`/`close`,
  `putChunkEntities`/`getChunkEntities`/`listChunks`/`deleteChunkEntities` over the `entities` store
  keyed `worldId|chunkX|chunkZ`). The repository is decoupled from any live entity framework; the `data`
  payload is opaque.
- `tests/unit/EntityRepository.test.ts` (NEW) — 16 tests covering store creation (all four stores),
  put/get round-trip, absent-chunk null, list-by-world isolation, delete, validation rejection (writes
  nothing), construction without a global `indexedDB`, and in-place v3→v4 migration preserving the three
  prior stores and their records.

## Validation evidence (037)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 545/545 (prior 529 + 16 new EntityRepository tests)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 037 is **VERIFIED** at 7/7 (100%). All gates are green: typecheck, lint, the new 037 suite
(16/16), the full unit suite (545/545), production build, and the required E2E suite (19/19). No
advancement exception was needed. The repository boundary remains injectable and dependency-free; the
only browser-global touch is inside `browserIdbFactory`, shared with 034/035/036.

## Next change: 038 (pending artifacts)

`038-dirty-save-queue` is named in `CHANGE_SEQUENCE.md` with scope "Incremental dirty-unit save queue
with bounded work." It builds on 034-037 by draining dirty world units (metadata, chunk sections,
block entities, entities) through the existing repositories with bounded per-tick work. Per
`AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate
those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 037 verification.
Change 038 is the next change; its artifacts must be authored and validated before implementation
begins.
