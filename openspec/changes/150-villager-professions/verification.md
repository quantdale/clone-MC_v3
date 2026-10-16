# Verification: 150-villager-professions

## Status
VERIFIED — 100%

## Task completion
5 / 5 implementation tasks, 9 / 9 test tasks, 6 / 6 verification tasks complete (20/20, 100%).

## Gate evidence
- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit (isolated): PASS 17/17 (`tests/unit/VillagerProfession.test.ts` 10, `tests/unit/EntityType.test.ts` 7)
- unit (full suite): PASS 173 files / 1952 tests (`npx vitest run --testTimeout=30000`; prior 1942 +
  10 new)
- build: PASS (`tsc --noEmit && vite build`, 103 modules, unchanged from 149 — confirms this is an
  additive/unconsumed capability with no `Game.ts` consumer, matching 148/149's own identical
  validation evidence)
- e2e: PASS 22/22 (`npm run test:e2e`, Playwright; all pre-existing assertions unaffected — nothing
  wired into the live game, per the proposal's Definition of Done)

## Requirement coverage
| Requirement | Test | Result |
|---|---|---|
| REQ-1 villager registered as CREATURE | `EntityType.test.ts` villager presence/category case | PASS |
| REQ-2 assignProfession priority-ordered claim | claims-only-available / priority-order / no-workstation / already-assigned cases | PASS |
| REQ-3 unassign releases + clears | releases-claimed-POI / no-op-when-unassigned cases | PASS |
| REQ-4 scheduleForHour boundary coverage | all-eight-boundary-hours case | PASS |

## Edge/adversarial validation
- A farther earlier-priority profession's workstation is chosen over a nearer later-priority one —
  confirms priority order strictly outranks raw distance.
- A second `assignProfession` call for an already-employed villager returns the same profession id
  without touching any other profession's workstation (confirmed by asserting the librarian POI
  stays unclaimed after the second call).
- `unassign` on a villager with no tracked assignment returns `false` and touches nothing.
- All eight schedule boundary hours (`0`, `5.999`, `6`, `17.999`, `18`, `21.999`, `22`, `23.999`)
  resolve to the documented phase with no gap/overlap.

## Migration/compatibility validation
- One `EntityType.ts` edit (one new entity definition, additive) and one new, additive simulation
  file. No `Game.ts` edit (confirmed via the diff). No schema/save-format change; villager
  assignment is session-only.
- Adding the `villager` entity required updating `EntityType.test.ts`'s hardcoded default-registry
  size (11→12), sorted key list, and the fixed `item` runtime-id expectation (10→11, since
  `villager` registers before `item`) — required test maintenance for a legitimate new entity
  addition, the same pattern 148's `BlockItemSeparation.test.ts` update followed. `Registry.ts`
  itself documents runtime ids as process/data-set-local, not persistent identity, so this shift is
  expected and harmless.

## Performance/resource validation
- `assignProfession` is O(professions × 149's `findNearestUnclaimed` cost) — bounded by a small,
  caller-controlled profession list (3 in the default registry).

## Regressions
None beyond the required, documented `EntityType.test.ts` updates (themselves passing, updated
characterization tests, not broken ones). Full 1952-test unit suite green; all 22 pre-existing e2e
assertions pass unchanged.

## Incomplete tasks
None — 20/20 (100%).

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. Advance. 100% task completion, full gate green (typecheck, lint, 1952-unit suite,
production build, 22/22 e2e), no MUST/SHALL requirement unmet, no regression. This capability is
intentionally additive/unconsumed — no village/structure generation exists yet to naturally spawn a
villager or place a workstation block. Next change: 151-villager-trading.
