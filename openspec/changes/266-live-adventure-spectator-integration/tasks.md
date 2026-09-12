# Tasks: 266-live-adventure-spectator-integration

## A. Control plane

- [x] T1. Control-plane entries: 266 row in `CHANGE_SEQUENCE.md`, 266
  authorization in `CHANGE_SEQUENCE_OVERRIDES.md`, `PROGRAM_STATE.json`/`.md`
  activation (`currentChange=266-...` ACTIVE, `lastCompleted=265`,
  258 BLOCKED). Session start `faf1a51`.
- [x] T2. Package quality gate (SPEC_AUTHORING_PROTOCOL): number/name matches
  sequence; previous change VERIFIED; one narrow outcome; proposal/design/spec
  structures complete; every MUST/SHALL has a scenario; tasks cover
  impl/unit/E2E/edge/regression/docs/gate; verification mapping declared; no
  vague placeholders; no later-change scope.

## B. Pure helpers + declarations

- [x] T3. `AdventurePermissions.ts` + `can_destroy`/`can_place_on` component
  types in `StackDataComponents.ts` (registry 3→5) + unit suite
  (`AdventurePermissions.test.ts`): validation matrix, key splitting,
  empty/absent/malformed ⇒ empty set, tag union + unknown-tag skip, composed
  mode tables (survival/creative allow, spectator deny, adventure membership
  for break AND place).

## C. Persistence

- [x] T4. `__gamemode__` adventure/spectator round-trip evidence (extend
  `GameModePersistence` tests only if the four-mode matrix is uncovered) +
  `PotionItemData.test.ts` registry-size 3→5 characterization update with
  comment. No store/schema change.

## D. Live rules

- [x] T5. `PlayerInteraction` `canBreak`/`canPlace`/`canInteract` closures +
  gates (begin/advance break, placeBlock pre-consume check, update drain) +
  unit suite (allow/deny/drain incl. no-consume-on-deny and silent mid-mine
  reset).
- [x] T6. `PlayerPhysics` `noclip` closure + free-integration branch + unit
  suite (wall pass-through, no support, fallDistance 0; survival collision
  unchanged).

## E. Game store + UI

- [x] T7. `Game` wiring: blockTags field + `lookupBlockTag`, interaction
  closures (held-stack composition), physics `noclip`, hostile supplier null
  gate, wither `playerAlive` gate, eat early-return, crafting/creative toggle
  gates, pickup-adder gate, `setHeldAdventurePermissions` seam, capitalized
  toast/chip labels. No 265 semantic change (chip toggle untouched).
- [x] T8. HUD mode select (`#gamemode-select` + CSS + Game sync) exposing all
  four modes through real DOM.

## F. Browser E2E

- [x] T9. E2E adventure arc (new spec file): blocked place/break without
  permissions (world + counts unchanged) → attach declarations via seam →
  permitted break/place (consume exactly 1) → tag-declared permission works.
- [x] T10. E2E spectator + shared arc: spectator cannot break/place/use/open
  (world + counts unchanged, no panels), survival contrast unaffected, reload
  persists adventure AND spectator (chip + rules live after reload).

## G. Gate

- [x] T11. Regression: 265 E2E unmodified + green; full unit suite green; no
  259–265 source touched except the mechanical registry-size test.
- [x] T12. Full gates: `typecheck`, `lint`, `test`, `build`, `test:e2e` green;
  file-audit clean; `validate-state` PASS.
- [x] T13. Reconciliation + `PARITY_MATRIX.md` C266 `exact` row + publish
  `origin/main` + final report (SHAs, completion, validations, blockers, next
  action).
