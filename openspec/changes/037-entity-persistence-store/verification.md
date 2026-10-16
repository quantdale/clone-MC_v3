# Verification: 037-entity-persistence-store

Status: VERIFIED
Completion: 100% (7/7 tasks)
Advancement allowed: true

037 started only after 036 was VERIFIED (822c62c / 63cb7be), implemented once 036's artifacts and the
validated 036 baseline (529 unit / 19 e2e) were confirmed. The 037 OpenSpec package was authored from
scratch per `SPEC_AUTHORING_PROTOCOL.md` (no prior 037 artifacts existed) because the entity
persistence store is the next change in `CHANGE_SEQUENCE.md`.

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Versioned database with entities store | `WORLD_DB_VERSION` bumped 3→4; `WORLD_ENTITY_STORE='entities'` added; `ensureWorldStores` creates all four stores; test asserts `entities` + the three prior stores exist after open; v3→v4 migration test asserts all three prior stores and their records survive. | PASS |
| Typed serialized chunk record | `validateEntityChunkRecord` accepts a well-formed record (test `accepts a well-formed record`). | PASS |
| Validation rejects invalid records | Tests: empty `typeKey` throws; `undefined` `data` throws; non-integer coords throw; non-positive `schemaVersion` throws; non-array `entities` throws; malformed entity element throws; `putChunkEntities` with bad entity rejects and writes nothing. | PASS |
| put/get/list/delete chunk records | Tests: round-trip `putChunkEntities`→`getChunkEntities`; absent chunk returns `null`; `listChunks` returns only the requested world; `deleteChunkEntities` removes the record. | PASS |
| Injectable factory, no global dependence | Tests: `new EntityRepository({ factory: mock })`; open works against mock; migration test opens at v3 then v4 with injected factory. | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean. |
| `npm run lint` | PASS | `eslint .` clean. |
| `npx vitest run tests/unit/EntityRepository.test.ts` | PASS | 16/16 new tests. |
| `npm test` | PASS | 545/545 (prior 529 + 16 new). |
| `npm run build` | PASS | `tsc --noEmit && vite build` clean. |
| `npm run test:e2e` | PASS | 19/19. |

## Edge / adversarial validation

- `getChunkEntities` resolves `null` for absent keys (no throw).
- `putChunkEntities` validates and rejects malformed records (bad `typeKey`, `undefined` `data`,
  non-array `entities`, malformed element); the rejected write leaves the store empty.
- Repository is constructable without a global `indexedDB` (factory injected).
- `data` payload is stored as opaque `unknown`, forward-compatible with the future entity framework.

## Migration / compatibility validation

- `WORLD_DB_VERSION` is the single migration pivot. The v3→v4 migration test seeds a pristine v3
  database (only `world-metadata` + `chunk-sections` + `block-entities`), opens the metadata/chunk/
  block-entity repositories at v3 (records persisted), then opens the entity repository at v4: the mock
  fires `onupgradeneeded` on the same database object, `ensureWorldStores` adds `entities` while the
  three prior stores and their records survive. Additive, reversible during development.

## Performance / resource validation

- A chunk record holds only the entities within that chunk (sparse). `listChunks` filters in memory by
  `worldId`, bounded by chunks saved per world. No per-frame work.

## Regressions

- Prior 036 suite (16 tests), 035 suite (14), and 034 suite (14) still green; full unit suite 529→545.
  Production build unchanged in footprint; E2E unchanged at 19/19.

## Incomplete tasks

- None.

## Advancement Exception

Not applicable; completion is 100%.

## Final decision

Change 037 is **VERIFIED** at 7/7 (100%). All gates green: typecheck, lint, new 037 suite (16/16),
full unit suite (545/545), production build, and E2E (19/19). No advancement exception required.
Advancement to 038-dirty-save-queue (next change in `CHANGE_SEQUENCE.md`) authorized.
