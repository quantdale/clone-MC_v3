# Tasks: 280-death-respawn-ui

## A. Control plane and specification

- [ ] T1. Add the sequential 280 row/override, activate `PROGRAM_STATE` from
  published 279, keep 258 BLOCKED and 259–279 VERIFIED, and reserve 281.
- [ ] T2. Complete the SPEC_AUTHORING_PROTOCOL package with the death-cause,
  normal/hardcore outcome, lifecycle, failure, migration, and performance
  contracts; keep 281 out of scope.

## B. Pure reason and panel seams

- [ ] T3. Add the pure death-cause/outcome mapper with closed unknown fallback;
  extend the optional `SurvivalEvent` reason without changing snapshots.
- [ ] T4. Add `DeathRespawnPanel` with stable IDs, safe text rendering,
  idempotent dismiss, and focused unit coverage.

## C. Live shell and wiring

- [ ] T5. Add the hidden death-screen DOM/CSS card and wire Game to show it
  after the existing respawn/hardcore transition with outcome/cause state.
- [ ] T6. Preserve one-container, pointer-lock, reload-hidden, and no-new-
  persistence behavior; add the read/dismiss seams and unit integration proof.

## D. Verification and publication

- [ ] T7. Add `tests/e2e/death-respawn.spec.ts` for normal cause/card/dismiss
  and hardcore spectator outcome, while retaining existing 267/274 behavior.
- [ ] T8. Run the 259–279 regression and review no unrelated behavior changed.
- [ ] T9. Run typecheck, lint, full unit, build, full E2E, file-audit, and
  validate-state; record exact warnings/flakes and visual evidence.
- [ ] T10. Reconcile C280, mark 280 VERIFIED only at 10/10, commit/publish to
  `origin/main`, verify the remote tip, and checkpoint 281 spec-first.
