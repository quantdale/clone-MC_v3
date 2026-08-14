# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **034-indexeddb-world-metadata — VERIFIED 100%**
- Active implementation change: **034-indexeddb-world-metadata — VERIFIED (advanced)**
- Next change: **035-indexeddb-chunk-section-store — NOT YET ACTIVE (artifacts pending)**
- 034 task ledger: **5 total tasks, 5 completed**
- 034 completion: **100%**
- 034 mandatory indexeddb-world-metadata requirements: **PASS**
- 034 required-test gate: **PASS — unit 499/499, E2E 19/19**
- 034 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `c3d986705e65aa571e2c5db886b5e71dcd976ea2`
- Next exact action: **Advance to 035-indexeddb-chunk-section-store. Author proposal/design/tasks/specs/indexeddb-chunk-section-store/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, implement a chunk-sections object store on the same WORLD_DB_NAME database (bump WORLD_DB_VERSION with an onupgradeneeded step), and a typed repository for persisting/reloading ChunkColumn section block-state data, verify full gate, commit + push, advance program state.**

## What 034 implemented

Change 034 introduces the persistent-world storage foundation: a versioned IndexedDB database
and a typed repository boundary for world-level metadata, with no browser-global dependency at
construction time.

- `src/storage/WorldMetadata.ts` — `WORLD_DB_NAME = 'voxel-world-db'`, `WORLD_DB_VERSION = 1`,
  `WORLD_METADATA_STORE = 'world-metadata'` constants; the `WorldMetadata` interface
  (`schemaVersion`, `worldId`, `seed`, `dimensionId`, `minY`, `height`, `createdAt`, `updatedAt`);
  and `validateWorldMetadata(input)` which returns the narrowed record or throws a descriptive
  `Error` on any malformed field (does not coerce types).
- `src/storage/WorldMetadataRepository.ts` — `WorldMetadataRepository` with an injectable
  `IDBFactory` (`opts.factory`), `open()` that creates the `world-metadata` store (keyPath
  `worldId`) on `onupgradeneeded` and is idempotent, `putMetadata` (validates then stamps
  `updatedAt`), `getMetadata` (returns `null` for absent keys), `listMetadata`, `deleteMetadata`,
  and `close()`. `browserIdbFactory()` is the only place touching `globalThis.indexedDB`.
- `tests/unit/IdbFactoryMock.ts` — in-memory `IDBFactoryLike` mock (fires `onupgradeneeded`
  before `onsuccess`, shares data across transactions).
- `tests/unit/WorldMetadataRepository.test.ts` — 14 tests covering validation rejection, store
  creation, put/get round-trip, null-on-absent, list, delete, invalid-write rollback, and
  idempotent open.

## Validation evidence (034)

- typecheck: PASS
- lint: PASS
- unit: PASS 499/499 (prior 485 + 14 new WorldMetadataRepository tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 034 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, full unit
suite (499/499), production build, and the required E2E suite (19/19). No advancement
exception was needed. The repository boundary is dependency-free and unit-tested against an
injectable mock, leaving the browser `indexedDB` only in the `browserIdbFactory` adapter.

## Next change: 035 (pending artifacts)

`035-indexeddb-chunk-section-store` is named in `CHANGE_SEQUENCE.md` with scope "Persist/reload
chunk columns and section block-state data." It builds on 034 by adding a `chunk-sections` store
to the same `voxel-world-db` database and bumping `WORLD_DB_VERSION` with a new `onupgradeneeded`
step. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block.
Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 034
verification. Change 035 is the next change; its artifacts must be authored and validated
before implementation begins.
