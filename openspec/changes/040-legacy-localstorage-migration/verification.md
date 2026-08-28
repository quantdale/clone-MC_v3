# Verification: 040-legacy-localstorage-migration

Status: VERIFIED
Completion: 100% (7/7 tasks)
Advancement allowed: true

040 started only after 039 was VERIFIED (9c5df3f / 94ad626), implemented once 039's artifacts and the
validated 039 baseline (559 unit / 19 e2e) were confirmed. The 040 OpenSpec package was authored from
scratch per `SPEC_AUTHORING_PROTOCOL.md` (no prior 040 artifacts existed) because the legacy
localStorage migration is the next change in `CHANGE_SEQUENCE.md`.

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Player-state store and repository | `WORLD_DB_VERSION` bumped 4→5; `WORLD_PLAYER_STATE_STORE='player-state'` added; `PlayerStateRepository` put/get/absent-null/delete/list tests pass. | PASS |
| Player-state validation | Tests: wrong-arity position, non-integer seed, missing survival reject; `putPlayerState` writes nothing on rejection. | PASS |
| Edit-overlay conversion | `buildSectionContainer` palette/bits/storage round-trip; `editsToSerializedChunkColumn` round-trips through `ChunkColumn.deserialize` (edited cells correct, untouched cells air). | PASS |
| Migration imports both artifacts | End-to-end `migrate(7)` imports 1 column + 3 edits + player state; report truthful. | PASS |
| Errors reported, no partial writes | Malformed state JSON → error entry, `playerStateImported` false, player-state store empty; edits still import. | PASS |
| v4→v5 migration preserves prior stores | Seeded v4 DB upgraded at v5 keeps all five stores and all prior records. | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean. |
| `npm run lint` | PASS | `eslint .` clean. |
| `npx vitest run tests/unit/LegacyLocalStorageMigrator.test.ts` | PASS | 11/11 new tests. |
| `npm test` | PASS | 570/570 (prior 559 + 11 new). |
| `npm run build` | PASS | `tsc --noEmit && vite build` clean. |
| `npm run test:e2e` | PASS | 19/19. |

## Edge / adversarial validation

- Invalid legacy cells (out-of-range index, negative id) are skipped and not written; palette holds
  only accepted ids.
- Malformed JSON in either legacy key → error entry; the other artifact still imports; no partial
  record is written.
- Missing legacy keys → empty report, zero counts, no errors (idempotent, non-destructive).
- Legacy storage is verified read-only (keys unchanged after `migrate`).
- Negative `cy` sections are supported (`minSectionY` from the minimum edited `cy`).

## Migration / compatibility validation

`WORLD_DB_VERSION` is the migration pivot; v4→v5 adds `player-state` via `ensureWorldStores`. The
v4→v5 in-place migration test proves all four prior stores and their records survive. Legacy keys are
never modified, so the import is repeatable and reversible.

## Performance / resource validation

One-time per seed; work proportional to edited cells + distinct columns; one write per migrated column
and one per player state. No per-frame work.

## Regressions

- Prior 039 suite (7), 038 (7), 037 (16), 036 (16), 035 (14), 034 (14) still green; full unit suite
  559→570. Production build unchanged in footprint; E2E unchanged at 19/19.

## Incomplete tasks

- None.

## Advancement Exception

Not applicable; completion is 100%.

## Final decision

Change 040 is **VERIFIED** at 7/7 (100%). All gates green: typecheck, lint, new 040 suite (11/11),
full unit suite (570/570), production build, and E2E (19/19). No advancement exception required.
Advancement to 041-save-schema-migrations (next change in `CHANGE_SEQUENCE.md`) authorized.
