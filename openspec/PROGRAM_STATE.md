# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **035-indexeddb-chunk-section-store — VERIFIED 100%**
- Active implementation change: **035-indexeddb-chunk-section-store — VERIFIED**
- Next change: **036-block-entity-persistence-store — NOT YET ACTIVE (artifacts pending)**
- 035 task ledger: **6 total tasks, 6 completed**
- 035 completion: **100%**
- 035 mandatory indexeddb-chunk-section-store requirements: **PASS**
- 035 required-test gate: **PASS — unit 513/513, E2E 19/19**
- 035 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `a1e15dfe28307967753f5f4f9c49a3e0b6eaa776`
- Next exact action: **Advance to 036-block-entity-persistence-store. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (036 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement a separate block-entity object store on the same voxel-world-db (bump WORLD_DB_VERSION with an onupgradeneeded step via shared ensureWorldStores), and a typed repository, verify full gate, commit + push, advance program state.**

## What 035 implemented

Change 035 persists and reloads chunk-column section block-state data in the same versioned
IndexedDB database established by 034, behind a typed, injectable-factory repository boundary.

- `src/storage/WorldMetadata.ts` — `WORLD_DB_VERSION` bumped `1 → 2`; added
  `WORLD_CHUNK_SECTION_STORE = 'chunk-sections'`.
- `src/storage/WorldMetadataRepository.ts` — added and exported `ensureWorldStores(db)` which
  idempotently creates every known store (`world-metadata`, `chunk-sections`) on `onupgradeneeded`;
  both repositories now route their upgrade path through it, so a single open creates/migrates the
  full schema and a v1→v2 migration adds the new store without disturbing `world-metadata`.
- `src/storage/ChunkSectionRepository.ts` (NEW) — `ChunkSectionRepository` (injectable `IDBFactory`,
  `open`/`close`, `putColumn`/`getColumn`/`listColumns`/`deleteColumn` over the `chunk-sections`
  store keyed by composite `worldId|chunkX|chunkZ`) and `validateSerializedChunkColumn` which
  rejects malformed records before any write. The repository stores plain `SerializedChunkColumn`
  data and stays decoupled from `BlockStateRegistry`.
- `tests/unit/IdbFactoryMock.ts` — enhanced the in-memory `IDBFactory` mock to perform in-place
  version upgrades (firing `onupgradeneeded` on the same database object, preserving existing stores
  and data) so the v1→v2 migration scenario is faithfully testable.
- `tests/unit/ChunkSectionRepository.test.ts` (NEW) — 14 tests covering store creation, put/get
  round-trip, absent-key null, list-by-world isolation, delete, validation rejection (writes
  nothing), construction without a global `indexedDB`, and in-place v1→v2 migration preserving the
  metadata store and its record.

## Validation evidence (035)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 513/513 (prior 499 + 14 new ChunkSectionRepository tests)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 035 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint, the new 035 suite
(14/14), the full unit suite (513/513), production build, and the required E2E suite (19/19). No
advancement exception was needed. The repository boundary remains injectable and dependency-free; the
only browser-global touch is inside `browserIdbFactory`, shared with 034.

## Next change: 036 (pending artifacts)

`036-block-entity-persistence-store` is named in `CHANGE_SEQUENCE.md` with scope "Separate
persistent block-entity records per chunk." It builds on 035 by adding a `block-entities` store to the
same `voxel-world-db` database and bumping `WORLD_DB_VERSION` with a new `onupgradeneeded` step routed
through the shared `ensureWorldStores`. Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 035 verification.
Change 036 is the next change; its artifacts must be authored and validated before implementation
begins.
