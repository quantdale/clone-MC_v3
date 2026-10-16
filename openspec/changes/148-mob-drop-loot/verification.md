# Verification: 148-mob-drop-loot

## Status
VERIFIED — 100%

## Task completion
5 / 5 implementation tasks, 11 / 11 test tasks, 6 / 6 verification tasks complete (22/22, 100%).

## Gate evidence
- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit (isolated): PASS 15/15 (`tests/unit/MobDropLoot.test.ts`)
- unit (full suite): PASS 171 files / 1925 tests (`npx vitest run --testTimeout=30000`; prior 1910 +
  15 new)
- build: PASS (`tsc --noEmit && vite build`, 103 modules, unchanged from 147 — confirms this is an
  additive/unconsumed capability with no `Game.ts` consumer, matching 136-144's own identical
  validation evidence before 145/146 wired mob systems in)
- e2e: PASS 22/22 (`npm run test:e2e`, Playwright; all pre-existing assertions unaffected — nothing
  wired into the live game, per the proposal's Definition of Done)

## Requirement coverage
| Requirement | Test | Result |
|---|---|---|
| REQ-1 damage lazy-init + zero clamp | MobHealthTracker lazy-init/clamp cases | PASS |
| REQ-2 died true only on killing call | died-gating cases (non-lethal, lethal, repeat-on-dead) | PASS |
| REQ-3 non-positive/non-finite amount no-op | zero/negative/NaN no-op case | PASS |
| REQ-4 damageEntity lethal/non-lethal composition | lethal-hit + non-lethal-hit cases (real EntityManager) | PASS |
| REQ-5 damageEntity missing-entity no-op | missing-id + already-removed-id cases | PASS |

## Edge/adversarial validation
- A second `damage` call on an already-dead entity (health already `0`) correctly reports
  `died: false` — the tracker does not re-report death on every subsequent hit.
- `damageEntity` is a no-op both for an entity id that was never spawned and for one that was
  spawned then already removed (`state !== 'ACTIVE'`) — confirms the guard checks manager state,
  not just id presence.
- `resolveMobDeath` against a species whose `lootTableId` is not registered in the supplied
  `LootTableRegistry` returns an empty loot list (not a throw) while still returning the species'
  fixed `xp` — confirms loot and XP resolution fail independently.
- `createPigMobSpecies`/`createZombieMobSpecies` throw for a hand-built registry missing the
  corresponding key (defensive; unreachable via `createDefaultEntityRegistry()`).

## Migration/compatibility validation
- One `ItemRegistry.ts` edit (two new item ids, `Porkchop=35`/`RottenFlesh=36`, additive — no
  existing id renumbered) and one new, additive simulation file. No `Game.ts` edit (confirmed via
  the diff — zero lines touched). No schema/save-format change; mob health is session-only.
- Adding the two new item ids required updating `tests/unit/BlockItemSeparation.test.ts`'s
  hardcoded legacy-numeric-id table (ids 35/36 now also resolve to `porkchop`/`rotten_flesh` on the
  item side, alongside the pre-existing `farmland`/`fire` blocks at those same shared legacy ids)
  and its placeable-item exhaustiveness check (`isFood: true` on both new items satisfies the
  existing "non-placeable items are food/tool/exempt" assertion) — required test maintenance for a
  legitimate new-item addition, not a design regression; the same pattern every prior
  item-registry-expanding change (117, 120, 122, 125) has followed.

## Performance/resource validation
- `damageEntity` is O(1) plus 011's own bounded `evaluate` cost (capped at `MAX_ROLLS`/
  `MAX_TABLE_OUTPUT`). Not on any hot path in the live game (unconsumed).

## Regressions
None beyond the required, documented `BlockItemSeparation.test.ts` table update (see Migration/
compatibility validation) — itself a passing, updated characterization test, not a broken one. Full
1925-test unit suite green; all 22 pre-existing e2e assertions pass unchanged.

## Incomplete tasks
None — 22/22 (100%).

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. Advance. 100% task completion, full gate green (typecheck, lint, 1925-unit suite,
production build, 22/22 e2e), no MUST/SHALL requirement unmet, no regression. This capability is
intentionally additive/unconsumed — nothing in the live game can yet damage a mob, since real
player→mob combat remains an unscheduled gap (flagged by 146, still not covered by any titled
change through 153). A future combat/interaction change is the real consumer of
`MobDropLootSystem.damageEntity`. Next change: 149-point-of-interest-system.
