# Tasks: 148-mob-drop-loot

## Implementation
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Porkchop = 35`, `ItemId.RottenFlesh = 36`
      definitions (food items, no placeBlock).
- [x] `src/simulation/MobDropLoot.ts`: `MobHealthTracker` class (`damage`, `getHealth`, `remove`,
      `clear`).
- [x] `MobSpecies` interface; `createDefaultMobLootTables` (`loot/pig`, `loot/zombie`);
      `createPigMobSpecies`/`createZombieMobSpecies`.
- [x] `resolveMobDeath` pure function.
- [x] `MobDropLootSystem` class: `damageEntity` (missing/inactive-entity guard, death-threshold
      check, manager removal, loot/XP resolution, sink callback composition).

## Tests
- [x] `tests/unit/MobDropLoot.test.ts`: `MobHealthTracker` first-call lazy-init case.
- [x] `MobHealthTracker` zero-clamp case.
- [x] `MobHealthTracker` died-true-only-on-killing-call case.
- [x] `MobHealthTracker` non-lethal-hit died-false case.
- [x] `MobHealthTracker` already-dead-id repeat-damage died-false case.
- [x] `MobHealthTracker` non-positive/non-finite amount no-op case.
- [x] `resolveMobDeath` against a real `LootTableRegistry`/`ItemTypeRegistry` (pig and zombie
      cases).
- [x] `MobDropLootSystem.damageEntity` lethal-hit case (removal + both spawn callbacks invoked
      with death position, using a real `EntityManager`).
- [x] `MobDropLootSystem.damageEntity` non-lethal-hit case (entity stays active, no callbacks).
- [x] `MobDropLootSystem.damageEntity` missing/inactive-entity no-op case.
- [x] `tests/unit/BlockItemSeparation.test.ts`: updated legacy-id table + placeable-item
      exhaustiveness check for the two new items (regression fix, required by the new item ids).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (15/15).
- [x] Full `npm test` passes (171 files, 1925/1925 — prior 1910 + 15 new).
- [x] `npm run build` passes (103 modules, unchanged from 147 — additive/unconsumed, no `Game.ts`
      consumer, matching 136-144's own precedent).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — nothing wired into the live
      game, per the proposal's Definition of Done).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 149-point-of-interest-system).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
