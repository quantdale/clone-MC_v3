# Tasks: 282-live-raid-feedback

## A. Control plane and specification

- [x] T1. Add the exact 282 sequence row, activate the sole change from
  published 281, reserve 283, preserve 258 BLOCKED and 259–281 VERIFIED, and
  author the complete package.
- [x] T2. Pass the SPEC_AUTHORING_PROTOCOL quality gate: each MUST/SHALL has a
  scenario, invalid/duplicate/replay/stale/pause/dispose behavior is explicit,
  and no production code is changed before the package validates.

## B. Pure projection and live ownership

- [x] T3. Add the pure bounded `RaidFeedbackView` projection with active,
  terminal, null, and invalid-boundary tests.
- [x] T4. Add Game-owned ephemeral raid state and deterministic start/tick/clear/
  inspect/replay seams over `RaidStateMachine`, with one transition per fixed
  tick and no entity or persistence wiring.
- [x] T5. Add the hidden-by-default accessible DOM feedback bar and sync it from
  the projection; cover active, victory, defeat, missing/null, and dispose
  lifecycle without touching the wither bar or one-container UI.

## C. Verification and release

- [x] T6. Add focused unit integration coverage for pause freeze, bounded clear,
  terminal idempotence, invalid omen clamping, and replay replacement.
- [x] T7. Add browser journeys for start → active wave feedback → clear waves →
  victory, terminal replay, accessibility, and reload/no-resurrection.
- [x] T8. Confirm no persistence/archive/entity/schema change, update reviewed
  file-audit rows, and retain existing HUD/wither/trading/smoker regressions.
- [x] T9. Run focused tests and required gates: typecheck, lint, full unit,
  build, exact `npm run test:e2e`, file-audit, and validate-state; record exact
  outputs and non-blocking environment variance.
- [x] T10. Reconcile artifacts, mark C282 exact/VERIFIED only at 10/10, commit
  implementation and docs, publish to `origin/main`, verify local/remote tips,
  and checkpoint 283 without implementing it.
