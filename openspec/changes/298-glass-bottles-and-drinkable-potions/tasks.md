# Tasks: 298-glass-bottles-and-drinkable-potions

## A. Control plane

- [x] T1. Author the complete OpenSpec package under
  `openspec/changes/298-glass-bottles-and-drinkable-potions/` (proposal,
  design, tasks, verification, capability spec, OVERRIDE_DRAFT) and pass the
  SPEC_AUTHORING_PROTOCOL quality gate.
- [x] T2. Add the CHANGE_SEQUENCE row and the live OVERRIDES addendum. Set
  PROGRAM_STATE so 298 is the sole ACTIVE change. 258 stays BLOCKED;
  259–297 stay VERIFIED.

## B. Items + contents

- [ ] T3. Add the `ItemId.GlassBottle = 74` definition and original art for
  `TILE_INDEX.glassBottle = 76`; update the registry/separation tests and the
  297 witch-table tests (bottles now present).
- [ ] T4. Accept base-only `potion_contents` (create + read guard); update the
  pinned legacy tests; water → awkward completes in the real engine.
- [ ] T5. Run the `container-ui` golden experiment (before ×2 / after) and apply
  the D2 decision rule; record the evidence.

## C. Filling + drinking

- [ ] T6. Pure `BottleFilling.ts` (fluid raycast, decision) and
  `PotionDrinking.ts` (start, tick/cancel, outcome) with unit tests.
- [ ] T7. Game wiring: use dispatcher (fill → drink → throw), fixed-tick
  drink step, shield priority, durable saves, and the
  `getDrinkState`/`getLastDrinkOutcome` seams.
- [ ] T8. Composition and source-guard tests, plus the base-only brewing chain
  test (water → awkward → speed → splash).
- [ ] T9. Browser E2E `tests/e2e/glass-bottles-drinkable-potions.spec.ts`.

## D. Docs + closure

- [ ] T10. 260/295/297 notes, PARITY C298 row, and the file-audit manifest.
- [ ] T11. Full gates: typecheck, lint, unit, build, file-audit,
  validate-state and full E2E (visual:176 cell by cell with isolation reruns;
  enchanting:227 green).
- [ ] T12. verification.md VERIFIED N/N, control plane VERIFIED,
  fast-forward publish (no force), docs sync.
