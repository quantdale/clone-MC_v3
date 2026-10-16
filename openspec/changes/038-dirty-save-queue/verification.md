# Verification: 038-dirty-save-queue

Status: VERIFIED
Completion: 100% (5/5 tasks)
Advancement allowed: true

038 started only after 037 was VERIFIED (46b15f0 / 884294d), implemented once 037's artifacts and the
validated 037 baseline (545 unit / 19 e2e) were confirmed. The 038 OpenSpec package was authored from
scratch per `SPEC_AUTHORING_PROTOCOL.md` (no prior 038 artifacts existed) because the dirty-save queue
is the next change in `CHANGE_SEQUENCE.md`.

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Bounded ordered drain | Tests: `drain(sink, 2)` writes only the first two of three FIFO units; `limit <= 0` writes nothing. | PASS |
| De-duplication by key | Test: re-`markDirty` same key keeps one entry, original FIFO position, updated payload. | PASS |
| Failure leaves the unit pending | Test: a failing unit is re-queued and retried on the next drain; successful units removed. | PASS |
| size / has / keys / clear | Test: state queries and `clear()` behave as specified. | PASS |
| Repository sink routes by kind | Integration test: one unit per kind drains into the correct 034-037 store; missing repo re-queues. | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean. |
| `npm run lint` | PASS | `eslint .` clean. |
| `npx vitest run tests/unit/DirtySaveQueue.test.ts` | PASS | 7/7 new tests. |
| `npm test` | PASS | 552/552 (prior 545 + 7 new). |
| `npm run build` | PASS | `tsc --noEmit && vite build` clean. |
| `npm run test:e2e` | PASS | 19/19. |

## Edge / adversarial validation

- `drain(sink, 0)` and `drain(sink, -1)` perform no writes and leave the queue intact.
- A persistently failing sink never drops the unit: it stays pending and is retried each drain; bounded
  `limit` keeps a failing drain from blocking.
- Concurrent `drain` calls each snapshot their own slice and delete up front, so the same unit is never
  double-written.
- `RepositorySaveSink` rejects (re-queues) when a unit's repository is absent or its `kind` is unknown.

## Migration / compatibility validation

No schema/`WORLD_DB_VERSION` change (stays `4`); 038 layers purely above 034-037. Fully compatible.

## Performance / resource validation

`drain` issues at most `limit` async writes; the caller controls `limit` as its per-tick/per-frame budget.
De-dupe by key bounds the pending set against repeated marks on the same unit.

## Regressions

- Prior 037 suite (16), 036 (16), 035 (14), 034 (14) still green; full unit suite 545→552. Production
  build unchanged in footprint; E2E unchanged at 19/19.

## Incomplete tasks

- None.

## Advancement Exception

Not applicable; completion is 100%.

## Final decision

Change 038 is **VERIFIED** at 5/5 (100%). All gates green: typecheck, lint, new 038 suite (7/7), full
unit suite (552/552), production build, and E2E (19/19). No advancement exception required. Advancement
to 039-transactional-autosave (next change in `CHANGE_SEQUENCE.md`) authorized.
