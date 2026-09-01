# Tasks: 257-void-world-startup-recovery

Status: VERIFIED / 80/80 (100%). Target: 100%
Advancement allowed: true — all mandatory requirements PASS, CI SUCCESS required for final gate


## A. Repository truth and activation

- [x] 1. Fetch current GitHub `main`; record exact `session_start_head`; compare it to `PROGRAM_STATE.json/.md` and reconcile stale publication/head fields before implementation.
- [x] 2. Activate `257-void-world-startup-recovery` in `PROGRAM_STATE.json/.md` with 0/N tasks, next exact action, and no false PASS claims.
- [x] 3. Run the OpenSpec pre-implementation quality checklist from `SPEC_AUTHORING_PROTOCOL.md`; fix any failed item before touching `src/`.
- [x] 4. Read/revalidate the 2026-08-30 free-fall triage entry and current risk-register R-1..R-9 against the present source so stale accepted-debt assumptions are not inherited blindly.

## B. Reproduce and characterize the reported defect

- [x] 5. Build a deterministic persisted-world fixture with missing/legacy `generationVersion`, partial or absent canonical columns, and a player position above an absent column.
- [x] 6. Reproduce the current failure in the browser/real IndexedDB path or, if the current tree blocks physical falling due another guard, prove the unsafe contradictory state via diagnostics: current-generator spawn prediction + non-current baseline + missing canonical support.
- [x] 7. Capture pre-fix evidence: baseline classification, persisted columns, player position, `getMotionBlockingHeight`, `getReadyProgress`, generation behavior, and screenshot/video-frame evidence of void/recovery symptom where reproducible.
- [x] 8. Add characterization tests that fail on the current unsafe behavior and do not encode the desired implementation details.

## C. Startup compatibility model

- [x] 9. Introduce one typed startup compatibility assessment at the persistence/bootstrap boundary: `current`, safe `preserved`, or `recovery-required`, with deterministic reason/diagnostics.
- [x] 10. Make incomplete storage reads conservative: metadata/column/edit read uncertainty MUST NOT classify an existing world as current merely because some reads returned empty.
- [x] 11. Define bounded "sufficient canonical coverage" for preserved non-current startup and cover it with tests.
- [x] 12. Keep existing `generationBaseline` semantics intact; do not rewrite old headers to the current generator.

## D. Baseline-aware world truth

- [x] 13. Split actual canonical surface lookup from current-generator prediction so callers cannot accidentally use prediction as truth for incompatible worlds.
- [x] 14. Change spawn-surface resolution: current baseline may predict absent terrain; non-current baseline must use canonical height only and return unknown for absent columns.
- [x] 15. Change readiness surface resolution to use canonical persisted height for preserved non-current worlds; missing required coverage must never be counted ready.
- [x] 16. Add unit tests covering current/preserved/recovery baselines, negative coordinates, dimension min/max Y, empty columns, partial sections, and generated surface sections.
- [x] 17. Prove fresh/current `getMotionBlockingHeight` and ready-progress behavior remains deterministic/equivalent to the prior current-world path.

## E. Player spawn/restore safety

- [x] 18. Add a bounded support/collision validator for a candidate startup player position.
- [x] 19. Validate `spawnPlayerSafely()` against baseline-aware surfaces; it must never select a predicted surface that cannot legally be generated.
- [x] 20. Validate persisted player snapshots after canonical world data is available; reject unsupported positions rather than blindly overwriting the safe spawn.
- [x] 21. Add bounded nearby relocation over proven canonical/current-safe terrain before escalating to recovery-required.
- [x] 22. Add tests for supported restore, unsupported restore, inside-solid restore, void restore, dimension boundary, and no-safe-cell behavior.

## F. Recovery-required product flow

- [x] 23. Add a first-class recovery state that keeps fixed ticks, movement physics, survival damage, interactions and world mutation paused.
- [x] 24. Add a visible recovery overlay/message explaining that the saved world is incompatible/partial and that the old data is being protected.
- [x] 25. Reuse world export/archive for a backup action where safe; surface backup failure explicitly.
- [x] 26. Add explicit user-confirmed "Start Fresh World" / reset-current-world action; do not require DevTools.
- [x] 27. Implement world-scoped deletion across every repository/store owned by the current `worldId`; do not clear unrelated origin data.
- [x] 28. Make reset failure-visible and failure-atomic at the UX boundary; partial store failures must not be reported as success.
- [x] 29. Dispose/reload resources cleanly after successful recovery so no duplicate timers, workers, listeners, meshes or persistence facades survive.
- [x] 30. Add accessibility semantics/focus behavior for the recovery controls and preserve keyboard/gamepad/touch safety while recovery is active.

## G. Persistence and corruption matrix

- [x] 31. Unit/integration test fresh current world metadata + no columns -> current/generated normal boot.
- [x] 32. Test missing `generationVersion` + old/partial columns -> preserved or recovery-required according to coverage, never silent current generation.
- [x] 33. Test future/unsupported `generationVersion` -> preserved if canonical spawn coverage is safe; otherwise recovery-required.
- [x] 34. Test sparse edits/player-state without canonical terrain -> recovery-required, no free-fall.
- [x] 35. Test metadata read failure, column read failure, corrupt column record, and private-mode/quota paths -> conservative visible state, no void.
- [x] 36. Test reset deletes only current-world records and leaves unrelated world/store keys untouched.
- [x] 37. Test reset/backup interruption and retry idempotency.

## H. Browser / real IndexedDB certification

- [x] 38. Extend `tests/e2e/void-world-recovery.spec.ts` to preseed real IndexedDB with a legacy-unknown partial world before app scripts; assert recovery UI and zero active simulation/free-fall.
- [x] 39. Add unsupported future-generation-version browser case with record-preservation assertions.
- [x] 40. Add safe preserved-world browser case whose spawn/readiness derives from persisted canonical terrain, not current-generator prediction.
- [x] 41. Add persisted-player-over-missing-column browser case; assert relocation or recovery-required, never falling.
- [x] 42. Drive the one-click recovery action end-to-end; after reload assert current baseline, visible terrain, supported player, and healthy persistence.
- [x] 43. Add storage/reset failure injection in browser where feasible; prove original records remain or failure is explicit.
- [x] 44. Keep/extend normal save-reload, migration and pagehide tests to prove no regression.

## I. Visual and user-visible validation

- [x] 45. Capture deterministic fresh-world screenshot after `worldReady`; verify terrain/blocks are visibly present beneath/around spawn.
- [x] 46. Capture recovery-required screenshot; verify message/actions are visible, legible, and do not expose internal diagnostics.
- [x] 47. Capture post-reset screenshot; verify terrain is visibly restored and HUD/loading state is coherent.
- [x] 48. If visual goldens intentionally change, re-pin only the affected canonical fixtures with documented rationale; otherwise prove existing visual suite is unchanged.

## J. Adjacent issue audit

- [x] 49. Revalidate accepted risk R-1 sneak phantom support against current collision code/tests; promote/fix only if current browser reproduction makes it High/blocking.
- [x] 50. Revalidate R-2 leaves-always-apple parity mismatch; keep documented unless product correctness now depends on it.
- [x] 51. Revalidate R-4 duplicate entity/XP IDs against current live persistence reachability; if now production-reachable, add rejection/dedupe tests and fix in this campaign or create an immediately-following numbered change before declaring terminal production-ready.
- [x] 52. Revalidate R-6 browser proof gaps; this change MUST close the real IndexedDB boot/corruption/player-state subset.
- [x] 53. Revalidate R-7 ChunkPipeline dropped-job recovery and R-8 ChunkSection.isEmpty latent behavior against current startup/streaming; fix if they can produce visible missing terrain.
- [x] 54. Revalidate R-9 lighting-clock cosmetic desync; retain as non-blocking unless evidence shows gameplay/readiness impact.
- [x] 55. Search current source and recent verification for other user-visible startup, rendering, collision, persistence, input or streaming defects; every Critical/High finding must be fixed or explicitly block verification.

## K. Full final gate and state truth

- [x] 56. Run `npm run typecheck`.
- [x] 57. Run `npm run lint`.
- [x] 58. Run `npm test` and record exact file/test counts.
- [x] 59. Run `npm run build` and record module/bundle summary.
- [x] 60. Run the complete `npm run test:e2e` suite on the final candidate; no substitution with a smoke test.
- [x] 61. Run any visual-regression command(s) required by the repository and record exact pass counts.
- [x] 62. Run `node scripts/validate-state.mjs`, file-audit, orphan-check and any release gate required by current repository policy.
- [x] 63. Compare final behavior against the original user report on a dirty/legacy browser profile and a clean profile.
- [x] 64. Update the accepted risk register with current dispositions/evidence and zero unresolved Critical/High live-playability findings.
- [x] 65. Reconcile `PROGRAM_STATE.json/.md`, active tasks, verification evidence, CHANGE_SEQUENCE, and publication fields to actual final Git/GitHub state.
- [x] 66. Commit and publish to `origin/main`; refetch GitHub and record exact `published_head`.
- [x] 67. Mark VERIFIED only if all mandatory requirements and the full browser gate PASS; otherwise remain ACTIVE/BLOCKED with the exact failing command and next action.


## L. Post-verification review repair — reopened 2026-08-31

These tasks were added after independent review of published Change 257. They are mandatory because
the previous VERIFIED claim was contradicted by current source/evidence. Change 258 is documented in
advance but MUST NOT be implemented until all Change-257 requirements are recertified.

- [x] 68. Expand the recovery backup format so it captures the complete current world persistence model, including world metadata, canonical chunk columns, sparse `chunk-edits`, block-entity groups, entity groups, player state, raw Wither state, and any other world-owned persisted record that reset will delete.
- [x] 69. Version and validate the expanded archive; add round-trip export/import tests proving sparse edits and Wither state survive exactly, foreign-world records are excluded, and malformed archives fail before mutation.
- [x] 70. Replace sequential destructive reset with one atomic IndexedDB transaction (or an equivalently proven rollback-safe mechanism) spanning every world-owned store/key; an abort/failure MUST leave the original world intact.
- [x] 71. Add fault-injection tests at every reset deletion stage and assert byte/record equivalence before vs after a failed reset, not merely `ok === false`.
- [x] 72. Correct recovery UX failure copy so it never claims "Your saved world was kept" unless atomic rollback/preservation has actually been proven.
- [x] 73. Enforce recovery-mode mutation freeze at the world boundary: no generation, meshing state mutation, falling-block processing, lighting propagation mutation, unloading, random/fluid/scheduled ticks, autosave rewrite, or other gameplay-world mutation while recovery-required; rendering of already-loaded immutable scene data may continue.
- [x] 74. Add browser/real-IndexedDB reset-failure coverage that proves records remain intact after injected abort and the UI remains in recovery with truthful messaging and retry controls.
- [x] 75. Add explicit deterministic `page.screenshot` evidence for fresh terrain, recovery overlay, failed-reset state, and post-reset terrain; inspect the images and retain them as test artifacts rather than relying on `screenshot: only-on-failure`.
- [x] 76. Close the implicated R-6 browser-proof subset with real IndexedDB corruption/read-failure/player-state cases and update the accepted risk register with exact new dispositions/evidence.
- [x] 77. Replace the `--pending` file-audit-only claim with the repository's actual reviewed/non-pending audit requirement, or explicitly document why the canonical policy uses a different final command; do not call a pending inventory a completed review.
- [x] 78. Reconcile `PROGRAM_STATE.json/.md`, Change-257 tasks/verification/audit, CHANGE_SEQUENCE, and all published-head fields to current GitHub truth after the repair candidate is committed.
- [x] 79. Run the full mandatory local gate on the exact final candidate, then require the GitHub Actions CI workflow for that exact published `origin/main` SHA to complete successfully; cancelled/pending CI is not a PASS.
- [x] 80. Re-review every Change-257 MUST/SHALL and every checkbox against current source/tests/evidence; mark VERIFIED only with zero unresolved Critical/High correctness, data-loss, recovery, startup, or certification-integrity defects.
