# Verification: 036-block-entity-persistence-store

Status: VERIFIED
Completion: 100% (7/7 tasks)
Advancement allowed: true

036 started only after 035 was VERIFIED (a1e15df / 5f45f3f), implemented once 035's artifacts and the
validated 035 baseline (513 unit / 19 e2e) were confirmed. The 036 OpenSpec package was authored from
scratch per `SPEC_AUTHORING_PROTOCOL.md` (no prior 036 artifacts existed) because the block-entity
persistence store is the next change in `CHANGE_SEQUENCE.md`.

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Versioned database with block-entities store | `WORLD_DB_VERSION` bumped 2→3; `WORLD_BLOCK_ENTITY_STORE='block-entities'` added; `ensureWorldStores` creates all three stores; test asserts `block-entities` + `world-metadata` + `chunk-sections` exist after open; v2→v3 migration test asserts both prior stores and their records survive. | PASS |
| Typed serialized chunk record | `validateBlockEntityChunkRecord` accepts a well-formed record (test `accepts a well-formed record`). | PASS |
| Validation rejects invalid records | Tests: empty `typeKey` throws; `undefined` `data` throws; non-integer coords throw; non-positive `schemaVersion` throws; non-array `entities` throws; malformed entity element throws; `putChunkEntities` with bad entity rejects and writes nothing. | PASS |
| put/get/list/delete chunk records | Tests: round-trip `putChunkEntities`→`getChunkEntities`; absent chunk returns `null`; `listChunks` returns only the requested world; `deleteChunkEntities` removes the record. | PASS |
| Injectable factory, no global dependence | Tests: `new BlockEntityRepository({ factory: mock })`; open works against mock; migration test opens at v2 then v3 with injected factory. | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean. |
| `npm run lint` | PASS | `eslint .` clean. |
| `npx vitest run tests/unit/BlockEntityRepository.test.ts` | PASS | 16/16 new tests. |
| `npm test` | PASS | 529/529 (prior 513 + 16 new). |
| `npm run build` | PASS | `tsc --noEmit && vite build` clean. |
| `npm run test:e2e` | PASS | 19/19. |

## Edge / adversarial validation

- `getChunkEntities` resolves `null` for absent keys (no throw).
- `putChunkEntities` validates and rejects malformed records (bad `typeKey`, `undefined` `data`,
  non-array `entities`, malformed element); the rejected write leaves the store empty.
- Repository is constructable without a global `indexedDB` (factory injected).
- `data` payload is stored as opaque `unknown`, forward-compatible with the future block-entity framework.

## Migration / compatibility validation

- `WORLD_DB_VERSION` is the single migration pivot. The v2→v3 migration test seeds a pristine v2
  database (only `world-metadata` + `chunk-sections`), opens the metadata repository at v2 and the
  chunk repository at v2 (records persisted), then opens the block repository at v3: the mock fires
  `onupgradeneeded` on the same database object, `ensureWorldStores` adds `block-entities` while
  `world-metadata` and `chunk-sections` and their records survive. Additive, reversible during development.

## Performance / resource validation

- A chunk record holds only the block entities within that chunk (sparse). `listChunks` filters in
  memory by `worldId`, bounded by chunks saved per world. No per-frame work.

## Regressions

- Prior 035 suite (14 tests) and 034 suite (14 tests) still green; full unit suite 513→529. Production
  build unchanged in footprint; E2E unchanged at 19/19.

## Incomplete tasks

- None.

## Advancement Exception

Not applicable; completion is 100%.

## Final decision

Change 036 is **VERIFIED** at 7/7 (100%). All gates green: typecheck, lint, new 036 suite (16/16),
full unit suite (529/529), production build, and E2E (19/19). No advancement exception required.
Advancement to 037-entity-persistence-store (next change in `CHANGE_SEQUENCE.md`) authorized.
