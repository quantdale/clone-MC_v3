# Tasks: 285-live-bad-omen-acquisition

## A. Control plane and specification

- [x] T1. Author the complete package (`proposal.md`, `design.md`, `tasks.md`,
  `verification.md`, `specs/live-bad-omen-acquisition/spec.md`,
  `OVERRIDE_DRAFT.md`) with change number/name matching the reserved 285 slot;
  do not edit live `CHANGE_SEQUENCE_OVERRIDES.md` or `PROGRAM_STATE*`.
- [x] T2. Pass the SPEC_AUTHORING_PROTOCOL quality gate: every MUST/SHALL has a
  scenario; invalid/duplicate/stale/pause/dispose/reload/failure behavior is
  explicit; no production code changes before the package validates.

## B. Pure rules and Game wiring

- [x] T3. Add failing/characterization unit tests for `BadOmenRules`
  (clamp/grant/clear/trigger matrix, reason precedence, invalid centers).
- [x] T4. Implement `src/simulation/BadOmenRules.ts` with total pure helpers
  matching the design API; keep it free of Game, DOM, entity, and persistence
  imports.
- [x] T5. Wire Game-owned ephemeral `badOmen`, `grantBadOmen` / `clearBadOmen` /
  `getBadOmenLevel` / `setVillageQuery` seams, and one fixed-tick evaluation
  that starts through the 282 raid path then clears exactly once on
  `START_RAID`, gated by pause/loading/dispose; default query returns `null`.

## C. Verification and release

- [x] T6. Add focused unit integration coverage: grant→trigger→raid active +
  level 0, no-village and invalid-center retention, duplicate grant/clear,
  active/terminal raid replacement, pause freeze, dispose clears, reload level
  0, and no persistence writes.
- [x] T7. Add a browser journey: inject fixture village query, grant omen,
  observe `#raid-feedback` active state, inspect `getBadOmenLevel()` after
  trigger (0), and prove reload has no omen/raid resurrection.
- [x] T8. Confirm no persistence/archive/entity/registry/HUD/GPU change; update
  reviewed file-audit rows; retain existing raid-feedback, wither, trading,
  smoker, and container regressions.
- [x] T9. Run focused tests and required gates: `npm run typecheck`,
  `npm run lint`, `npm test`, `npm run build`, exact `npm run test:e2e`,
  file-audit, and `npm run validate-state`; record exact outputs and any
  non-blocking environment variance in `verification.md`.
- [x] T10. Reconcile artifacts to implementation, mark C285 exact/VERIFIED only
  at 10/10, commit implementation and docs on this branch, publish per
  `REVIEW_HANDOFF.md` when authorized, verify local/remote tips, and
  checkpoint the next sequential change without implementing it.
