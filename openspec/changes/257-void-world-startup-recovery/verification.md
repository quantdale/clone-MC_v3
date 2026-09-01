# Verification: 257-void-world-startup-recovery

Status: ACTIVE/CHANGES REQUIRED (REOPENED 2026-09-01)
Previous 80/80 (100%) VERIFIED at b38d55c REVOKED by independent review.
Completion: 67/92 (≈ 72.8%); mandatory requirements FAIL; required tests FAIL.
Advancement allowed: false.

## Why the prior VERIFIED decision was revoked

Independent review on 2026-09-01 found F257-A..L. The previous F257-10..16 list is
preserved as historical context but the authoritative blocker set is now F257-A..L,
each mapped to one of the new tasks 81..92 in `tasks.md`. F257-A..K are HIGH or
MEDIUM/HIGH severity; F257-L is MEDIUM. None of the F257-A..L items are fixed yet.

| ID | Requirement / claim | Current evidence | Status |
|---|---|---|---|
| F257-A | Recovery backup is fail-closed on any read failure | `WorldArchiver.exportWorld()` lines 95-101 wrap `getWitherData` in try/catch returning null. `exportWorldBackup()` propagates the result without checking. | FAIL |
| F257-B | Reset snapshot is fail-closed on any read failure | `GamePersistence.resetCurrentWorld()` line 723 wraps `getWitherData` in `.catch(() => null)`; later snapshot reads have no error guard. | FAIL |
| F257-C | Reset is one real multi-store IndexedDB transaction | `GamePersistence.resetCurrentWorld()` lines 742-767 issue 7 separate `await` calls each creating its own IDB transaction; rollback at lines 770-781 issues 7 more independent writes. | FAIL |
| F257-D | Archive import enforces ownership consistency | `WorldArchiver.importWorld()` lines 123-149 write `valid.metadata` and normalize `playerState.worldId` to the archive's `worldId` without checking. | FAIL |
| F257-E | Mandatory migrated-legacy e2e runs | `tests/e2e/persistence.spec.ts:399 test.skip`. | FAIL |
| F257-F | Mandatory abrupt-close e2e runs | `tests/e2e/persistence.spec.ts:501 test.skip`. | FAIL |
| F257-G | Risk register R-7 is either restored or has a documented resolution | `openspec/hardening/2026-08-23-exhaustive-repository-certification/risk-register.md` jumps R-6 -> R-8. | FAIL |
| F257-H | File-audit manifest reflects genuine review of affected files | Every row in `file-audit-manifest.json` (2642 rows) has `runtimeReachability=unknown`, `testEvidence=[]`, `findingIds=[]`, `gitBlob=null`, `reviewNotes="auto-reviewed for 257 repair; no findings"`. | FAIL |
| F257-I | State truthfully reflects the current HEAD | `PROGRAM_STATE.json` claimed `published_head: b38d55c` while `origin/main` was already `c9c91dc` with two `test.skip` commits. | FAIL (now corrected by this reopen) |
| F257-J | Visual clipped tolerance change is justified by evidence | `tests/e2e/visual-regression.spec.ts` clipped 0.015 -> 0.02; the only existing evidence is the §C247 maintenance-fix record (environment-day/high/1920x1080 noise ~0.0105). | PARTIAL — re-collect under canonical CI. |
| F257-K | Backup round-trip proves actual payload equality | `RecoveryBackupAndAtomicReset.test.ts` round-trip checks counts only. | FAIL |
| F257-L | Archive import is atomic (or contract is documented) | `WorldArchiver.importWorld()` writes via multiple independent repository operations. | FAIL (contract not yet documented) |

## Preserved historical evidence

The free-fall architecture repair from the original 67/67 review is preserved. The
following remain PASS:

- Baseline-aware spawn/readiness surface separation (C, D, E)
- Startup compatibility assessment (C, D)
- Player support/collision validation (E)
- Recovery-required world mutation freeze (`World.setRecoveryFrozen`) (F.73, G.73)
- Real-IDB preseed E2E (9/9 void-world-recovery cases with 4 deterministic `page.screenshot` calls)
- Recovery UX failure copy that does not claim preservation unless proven
- File-audit manifest schema (just not the per-row payload)

## Tasks 44, 60, 70, 79, 80 — explicitly unchecked per §15

- Task 44: two mandatory e2e persistence tests are still `test.skip`.
- Task 60: complete `npm run test:e2e` is not a real PASS while 44 is open.
- Task 70: reset is JS-snapshot + independent deletes, not a single multi-store IDB tx.
- Task 79: the last successful CI was at b38d55c, but the published `origin/main`
  is now c9c91dc with two `test.skip` commits; no canonical CI run exists for the
  current final candidate.
- Task 80: this re-review IS the work; until blockers close, this cannot be marked `[x]`.

## Commands required on the final repair candidate (to be run after F257-A..L close)

| Command / evidence | Expected result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS with F257-A, F257-B, F257-C, F257-D, F257-K, F257-L new tests |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS with 0 mandatory `test.skip` (no migrated-legacy or abrupt-close skip) |
| `focused Change-257 browser suite` | PASS 9+/9+ void-world-recovery |
| `node scripts/validate-state.mjs` | PASS |
| `node scripts/validate-file-audit.mjs <manifest>` | PASS reviewed at final candidate SHA with meaningful per-row payload for affected files |
| `node scripts/validate-state.mjs --ci` | PASS for the exact final candidate SHA |
| `GitHub Actions CI <run-id>` | SUCCESS (gate success, e2e success) on exact final candidate SHA |

## Advancement Exception

Not applicable. Completion 67/92 is below the absolute 90% floor, mandatory requirements
fail, and the F257-A..L defects include HIGH data-loss, HIGH cert integrity, and HIGH
data integrity. The 257 repair must reach 100% with the gate green before re-VERIFIED
can be claimed.

## Final decision (current)

REOPENED at session_start c9c91dc. F257-A..L are open. The 257 OpenSpec package
must reach 92/92 with full local gate, full e2e (no mandatory skip), full canonical
CI on the exact final candidate SHA, and re-published to `origin/main` before any
re-VERIFIED claim. Change 258 remains PLANNED/BLOCKED.
