# Verification: 308-reset-save-integrity

Status: ACTIVE — NOT VERIFIED
Completion: 5/7 (71.428571%)
Advancement allowed: false
Starting change head: `f1f1cac2506dffa7573fa67a7b2f95fa989ba85e` (local and remote main equal; clean tree before failing-first test). Session start head: `350b557a090b01c2d5d5574fb7ae9aa1e6fc52c3`.

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| R1 | Real `GamePersistence` + IDB test: dirty chunk edit vanished after failed reset before fix; after fix delete/snapshot failure preserves pending overlays and subsequent flush persists them. | FOCUSED PASS |
| R2 | Failing-first delayed queued chunk write recreated `[[1,3]]` after reset success; queue barrier now waits, successful reset prevents recreation, new queued work is discarded only on successful reset, concurrent resets coalesce. | FOCUSED PASS |
| R3 | Real queue probe/test: clear then in-flight failure requeued key before fix; after fix old failure is suppressed and a newer post-clear mark still persists. | FOCUSED PASS |
| R4 | Failing-first delayed raw game-mode write recreated `{mode:'creative'}` after reset; all 14 direct raw save paths now track, snapshot, order, fence and defer writes. Tests cover every kind, late completion, failure retry, newest save/deletion and caller mutation. Full gate remains. | FOCUSED PASS |
| R5 | Failing-first real facade test showed a second flush returned success early and pruned an in-flight overlay; a persistent-failure overlap exposed a second false-success path. Barrier plus outstanding in-flight accounting preserves the overlay and reports unresolved writes; focused tests pass. | FOCUSED PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run tests/unit/RecoveryBackupAndAtomicReset.test.ts -t 'preserves unsaved edits when reset fails'` | FAIL before fix | Reset returned failure; pending edit lookup expected `3` and returned `undefined`. |
| Real `DirtySaveQueue` gated-write Node probe | DEFECT REPRODUCED | After `clear()` then failed in-flight write: `keys=['k']`, `size=1`. |
| `vitest run tests/unit/DirtySaveQueue.test.ts -t 'after clear|after clear when'` | BEFORE: 1 FAIL / 1 PASS | Old in-flight failure requeued after clear; newer post-clear mark was preserved. |
| `vitest run tests/unit/RecoveryBackupAndAtomicReset.test.ts -t 'preserves unsaved edits|keeps existing and newly|waits for an in-flight'` | BEFORE: 4 FAIL | Failed delete and snapshot lose old dirty edit; reset reports success while queued and raw writes are in flight. Additional rerun shows actual durable chunk-edit and raw game-mode record resurrection after reset. |
| Real `DirtySaveQueue` 10,000 distinct-key Node probe | SEPARATE FINDING | After all writes succeeded: pending `0`, retained epoch keys `10000`. Separate future work; no fix claimed in 308. |
| `npm run verify:all` | PASS, prior change | At `ce68d6e75c233ffa4efbc33a5238ee3ba3024fcc`: 13 gates, 5852 unit + 1 skipped, 145 browser, coverage 91.93/88.66/94.90/93.28. Predates 308. |
| `npm run test:perf:multiplayer` | PASS, prior change | 836.5 TPS / 1434.5 ms, isolated; predates 308. |
| `npm run validate-state`, `npm run verify:file-audit` | PASS | Spec-first activation coherent; reviewed manifest has 3102 rows. |
| Additional gated raw/reset fixtures | BEFORE: 3 FAIL | Raw saves were written during both failing and successful resets, and two concurrent reset requests performed two destructive transactions. |
| `vitest run tests/unit/DirtySaveQueue.test.ts tests/unit/RecoveryBackupAndAtomicReset.test.ts tests/unit/AutosaveCoordinator.test.ts tests/unit/SaveRecoveryMatrix.test.ts` | AFTER: 49/49 PASS | Queue barrier, clear cancellation, raw-write fencing/defer/retry, and existing storage cases; `npm run typecheck` and `npm run lint` PASS. |
| `npm run verify:deps && npm test` | PASS | 171 locked packages, 486 files / 5863 passed + 1 skipped at an earlier 308 checkpoint; later tests and implementation changes require a final rerun. Negative-fixture diagnostics are expected. |
| Deferred raw snapshot / out-of-order raw save fixtures | FAIL before their fixes | Mutating a deferred input changed the persisted value; an older delayed raw save overwrote a newer save. Snapshot and per-key serialization now pass focused tests. |
| Concurrent facade flush fixtures | FAIL before their fixes | Second flush reported success and pruned overlay while first write was blocked; later persistent-failure overlap also produced a false success. The queue now counts in-flight work and flush joins prior drains. |
| Four focused storage suites, latest run | PASS | 58/58 tests across `DirtySaveQueue`, `RecoveryBackupAndAtomicReset`, `AutosaveCoordinator`, `SaveRecoveryMatrix`; typecheck, lint, validate-state and file audit pass. |
| `npm run verify:deps`; `PW_SWIFT=1 playwright test tests/e2e/persistence.spec.ts tests/e2e/void-world-recovery.spec.ts --output=<session-artifacts>/change308-focused` | PASS | 171 locked packages; 16/16 real Chromium/IndexedDB journeys including atomic failed reset, successful reset, quota recovery and 150-chunk reload. Headless software WebGL is not 258 hardware certification. |

## Edge/adversarial validation

Dirty edit loss, queue clear resurrection, queued chunk record resurrection and raw game-mode record resurrection reproduced independently. Additional failing-first tests exposed deferred-payload mutation, out-of-order raw saves and concurrent-flush false success/overlay pruning. Gated tests now cover failure, success, all 14 raw save entry points, deferred raid deletion, failed raw retry, concurrent reset coalescing, newer queued marks and overlapping flushes.

## Migration/compatibility validation

No database or serialized save format change; queued and raw saves are fenced around reset. Full regression and browser gates remain pending.

## Performance/resource validation

Existing epoch-map retention is measured above; no claim it is fixed. Reset and queue change performance not yet verified.

## Regressions

One implementation attempt also suppressed committed-key reporting for a successful in-flight write after clear; an existing queue test caught it. The suppression was removed while retaining failure-cancellation. An initial flush barrier alone was insufficient for overlapping persistent failures; outstanding in-flight accounting was added and focused suites pass. Mandatory full 308 gates have not run.

## Incomplete tasks

T6–T7 remain open; no advancement.

## Advancement Exception

Not applicable.

## Final decision

ACTIVE, not verified. Goal mode is inactive. If work is resumed, run the full mandatory gate and isolated multiplayer performance, then review and publish the verified state. 258 remains BLOCKED; no GPU evidence claimed.
