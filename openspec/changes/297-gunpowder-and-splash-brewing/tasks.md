# Tasks: 297-gunpowder-and-splash-brewing

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/297-gunpowder-and-splash-brewing/` (proposal, design,
  tasks, verification, capability spec, OVERRIDE_DRAFT); pass
  SPEC_AUTHORING_PROTOCOL quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 297 is the sole ACTIVE change; 258 stays BLOCKED; 259–296 stay VERIFIED.

## B. Item + drops

- [x] T3. `ItemId.Gunpowder = 73` definition + `TILE_INDEX.gunpowder = 75`
  original art (no other tile touched); registry tests updated.
- [x] T4. Pure `src/simulation/GunpowderMobDrops.ts` (creeper/witch vanilla
  tables, looting term, missing-item discard, merge, fixed draw order) +
  `tests/unit/GunpowderMobDrops.test.ts`.

## C. Brewing

- [x] T5. `GUNPOWDER_ITEM`, `BrewingRecipeOutput.kind`,
  `match(base, ingredient, kind?)` gunpowder rule; `tickOnce` passes kind;
  `applyMatch` preserves kind.
- [x] T6. `tests/unit/SplashBrewing.test.ts`: conversion preserves effects,
  splash stays splash, no double splash (no fuel lit), fuel/time rules,
  serialize/deserialize + live host persist/hydrate round-trip.

## D. Game wiring

- [x] T7. `RaiderDeathInfo` through `damageRaider`/`onRaiderDied`; Game
  `dropRaiderLoot` on all three witch death sites (exactly once); seams
  `debugSetMobDropRandomSequence`, `getLastMobDrops`; `testGrantSplashPotion`
  doc updated (test-only).
- [x] T8. Composition tests `tests/unit/LiveWitchGunpowderDrops.test.ts`
  (real RaiderCombatSystem death info, witch-only drops, Game source guards).
- [x] T9. Browser E2E `tests/e2e/gunpowder-splash-brewing.spec.ts`: witch
  kill → gunpowder picked up → awkward+redstone → +gunpowder in a real stand
  → collect splash → throw → speed applied.

## E. Docs + closure

- [x] T10. 295/260 notes (splash obtainable in survival), PARITY C295 note +
  C297 row, file-audit manifest.
- [x] T11. Full gates: typecheck, lint, unit, build, file-audit,
  validate-state, full E2E (visual:176 cell-by-cell vs 296 baseline with
  isolation reruns for flips; enchanting:227 green).
- [x] T12. verification.md VERIFIED N/N, control plane VERIFIED, fast-forward
  publish (no force), docs sync.
