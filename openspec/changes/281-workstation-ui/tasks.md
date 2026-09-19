# Tasks: 281-workstation-ui

## A. Control plane and specification

- [x] T1. Add the sequential 281 row, activate 281 from published VERIFIED
  280, reserve the next sequential slot, keep 258 BLOCKED and 259–280
  VERIFIED, and complete the proposal/design/spec/tasks/verification package.
- [x] T2. Pass the SPEC_AUTHORING_PROTOCOL quality gate: every MUST/SHALL has
  a scenario, invalid/duplicate/stale/reload/failure behavior is explicit, the
  scope is limited to a player smoker, and no production code is changed before
  this package validates.

## B. Registry, pure core, and entity adapter

- [ ] T3. Register stable smoker block/item ids, placement/drop references,
  container shape, and one original procedural atlas tile; add focused registry,
  shape, loot, and item tests without changing existing ids.
- [ ] T4. Add `createSmokerContext` with exact `ceil(base / 2)` duration,
  fail-closed unknown recipes, delegated fuel/result/XP, and focused even/odd/
  boundary tests.
- [ ] T5. Add the `smoker` block-entity adapter over the validated FurnaceState
  payload with type-key rejection, lossless timers/XP round-trip, and focused
  unit coverage.

## C. Live host and UI/Game integration

- [ ] T6. Extend `LiveBlockEntityHost` for smoker placement, atomic menu writes,
  fixed-tick simulation, hydration/quarantine, stale cleanup, XP, removal,
  persistence, and duplicate-coordinate safety; add `LiveSmokerIntegration`
  coverage for speed, pause, reload, blocked output, and no resurrection.
- [ ] T7. Extend the shared furnace panel and Game station session so Furnace
  remains unchanged while Smoker gets explicit title/accessibility labels,
  shared menu transactions, one-container lifecycle, live render, and safe
  close/walk-away/focus/dispose behavior.
- [ ] T8. Wire PlayerInteraction and Game place/use/break/drop paths, smoker
  collision/selection and registry identity; prove the held item is not consumed
  by use and contained stacks/XP settle exactly once on break.

## D. Browser and verification

- [ ] T9. Add a real browser journey covering place → open → label → insert →
  twice-fast cook → extract → save/reload → break → no resurrection, plus a
  lifecycle/refusal case; keep existing furnace/brewing journeys green.
- [ ] T10. Verify archive/persistence expectations: smoker uses only the
  existing block-entity snapshot/WorldArchiver path, no new namespace or schema
  field, and old furnace/brewing rows round-trip unchanged.
- [ ] T11. Run focused tests and the required regression/gates: typecheck, lint,
  full unit, build, exact `npm run test:e2e`, file-audit, and validate-state;
  record exact output, warnings, and any non-blocking environmental variance.
- [ ] T12. Reconcile every artifact and mark C281 exact/281 VERIFIED only at
  12/12, commit intended changes, publish normally to `origin/main`, verify
  local/remote tips, and checkpoint the next numbered change.
