# Tasks: 286-live-raid-bar-parity

## A. Control plane and specification (this session)

- [x] T1. Author the complete 286 OpenSpec package (proposal, design, tasks,
  verification, normative capability spec) under
  `openspec/changes/286-live-raid-bar-parity/` without editing live
  `CHANGE_SEQUENCE*`, `PROGRAM_STATE*`, or `PARITY_MATRIX.md` on this branch.
- [x] T2. Draft `OVERRIDE_DRAFT.md` in the package recording that 286 is
  prepared ahead of activation and may activate only after 282 is VERIFIED;
  do not apply it to the live overrides file while 282 is unfinished on main.
- [x] T3. Pass the SPEC_AUTHORING_PROTOCOL quality gate mentally: every
  MUST/SHALL has at least one scenario; invalid/duplicate/stale/reload/
  dispose/failure rules are explicit; scope excludes 258 headed FPS/GPU,
  production implementation now, and unrelated systems.

## B. Activation gate (blocked until 282 VERIFIED)

- [ ] T4. On a session where 282 is VERIFIED (and advancement is allowed),
  re-read this package, add the 286 sequence row and override ADDENDUM to the
  live control files, and mark 286 ACTIVE without reopening 258 or 259–282.
- [ ] T5. Confirm baseline: typecheck/lint/unit/build/E2E green at activation
  head; Change 258 still BLOCKED; wither boss-bar regression boundary intact.

## C. Pure projection and isolation

- [ ] T6. Implement the pure `projectRaidBar` (or approved equivalent) with
  wave progress, clamped omen level, optional village name + fallback, and
  total behavior for `null`/`INACTIVE`/active/terminal states; unit tests
  cover clamps, totality, and invalid village input.
- [ ] T7. Prove isolation: projection and DOM hooks MUST NOT import or mutate
  `BossFramework`, `HudParity` boss bars, `WitherBossBarParity`, or
  `#wither-boss-bar`; unit/E2E assert distinct selectors and independent
  visibility.

## D. Live presentation and accessibility

- [ ] T8. Wire the distinct raid bar element (additive CSS/DOM) to the
  projection with `data-status`, `data-raid-bar`, `aria-label`, live-region
  semantics, and fill width matching clamped progress; cover active,
  victory, defeat, missing-DOM, and dispose hide.
- [ ] T9. Present village name only from the documented context/fallback and
  Bad Omen level from `RaidState.badOmenLevel` with integer clamp; never
  invent settlement data; reduced-motion-safe CSS (no required animation).

## E. Edge cases and regression

- [ ] T10. Edge/failure tests: non-finite counters, empty/whitespace/non-string
  village name, duplicate sync idempotence, stale post-dispose sync no-op,
  reload with no raid/village/omen resurrection, pause freeze inherited from
  282 fixed-tick rules.
- [ ] T11. Regression: existing `boss-bar.spec.ts`, 282 raid-feedback tests,
  HUD visual matrix, and full unit suite remain green; no persistence/archive
  namespace added; file-audit rows updated for new package/implementation
  files when activated.

## F. Verification and release (activation only)

- [ ] T12. Run focused unit + browser suites for projection, a11y, isolation,
  and lifecycle; record exact commands in `verification.md`.
- [ ] T13. Full baseline gates: `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`, `npm run test:e2e`, file-audit, and
  `npm run validate-state`; record PASS/FAIL with notes (including any
  known software-WebGL environment variance, not claimed as GPU evidence).
- [ ] T14. Reconcile artifacts against every MUST/SHALL; set C286 exact and
  VERIFIED only at 100% with 258 still BLOCKED; commit only on the activation
  branch; do not implement while this draft session's constraints forbid
  production code.
