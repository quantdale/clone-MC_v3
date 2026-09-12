# Tasks: 270-leaf-apple-loot-probability

## A. Control plane

- [x] T1. Control-plane entries: 270 row in `CHANGE_SEQUENCE.md`, 270
  authorization in `CHANGE_SEQUENCE_OVERRIDES.md`, `PROGRAM_STATE.json`/`.md`
  activation (`currentChange=270-...` ACTIVE, `lastCompleted=269`,
  258 BLOCKED). Session start `f9007bc`.
- [x] T2. Package quality gate (SPEC_AUTHORING_PROTOCOL): number/name matches
  sequence; previous change VERIFIED; one narrow outcome; proposal/design/spec
  structures complete; every MUST/SHALL has a scenario; tasks cover
  impl/unit/integration/edge/regression/docs/gate; verification mapping
  declared; no vague placeholders; no later-change scope.

## B. Audit (characterization before code)

- [x] T3. Record the double-apple audit: `buildCurrentLootTables` leaves
  apple pool (`LootTable.ts:321-325`) + `finishBreak` unconditional apple
  push (`PlayerInteraction.ts:488-490`); silk-touch replacement
  (lines 498-506) already strips apples; no shears item in registries
  (grep-empty); no sapling/stick drop wiring. Evidence: file:line citations
  in design.md (done) — no code changed in this task.

## C. Implementation

- [x] T4. `LootTable.ts`: optional `LootPool.chance` (0,1] gated on the
  injected rng in `evaluate()` (exactly one draw per gated pool, before
  its rolls; strict `<`); `INVALID_CHANCE` validation; exported
  `LEAF_APPLE_CHANCE = 0.005`; leaves apple pool chance-gated, leaves-block
  pool unconditional; header/builder comments updated. No signature change
  to entries/conditions/context.
- [x] T5. `PlayerInteraction.finishBreak`: delete the unconditional
  `BlockId.Leaves` apple push so the loot table is the sole apple
  authority. No other behavior change (silk/fortune/clean-break/fallback
  paths untouched).
- [x] T6. Risk register: R-2 row → CLOSED by Change 270 with evidence
  pointer; no other row touched.

## D. Tests

- [x] T7. Unit (`tests/unit/LootTable.test.ts`): update the two
  guaranteed-apple tests to fixed-rng both-outcome proofs (rng 0 → apple,
  rng ≥ 0.005 → none); chance validation (0/negative/>1/NaN/Infinity throw
  `INVALID_CHANCE`; 1 legal); draw-consumption order (one gate draw, then
  entry/quantity draws); statistical shape (deterministic alternating
  sequence yields exactly the hit fraction; seeded sweep near 0.5%).
- [x] T8. Interaction (`tests/unit/LeafAppleLoot.test.ts`, new): leaf break
  with injected lootTables — lucky rng spawns leaves + apple, unlucky rng
  spawns leaves only; silk-touch leaf break spawns exactly the block item
  with zero apples for a lucky rng; unharvestable-gated case unchanged.
- [x] T9. `tests/unit/ItemEntityManager.test.ts`: fix the stale
  "Mirrors PlayerInteraction.finishBreak" comment (two-stack spawn is now
  the lucky-case shape, not the every-time shape). No assertion change
  needed (generic routing proof stays valid).

## E. Gate

- [x] T10. `PARITY_MATRIX.md` C270 `exact` row + summary counts reconciled
  + post-terminal note (258 stays BLOCKED/rowless; 259–269 untouched).
- [x] T11. Full gate green (`validate-state`, `typecheck`, `lint`, unit
  `test`, `build`, `test:e2e` full 83-spec regression incl. no new e2e),
  mark 270 VERIFIED with requirement evidence, publish `origin/main`,
  final report (SHAs, completion, validations, blockers, next action).
- [x] T12. Publish `origin/main`, verify remote head, report
  `session_start_head...published_head` range with change status, task
  completion, validations, blockers, next exact action.
