# Tasks: 147-animal-breeding

## Implementation
- [x] `src/simulation/AnimalBreeding.ts`: `LOVE_MODE_DURATION_TICKS`, `BREEDING_COOLDOWN_TICKS`,
      `BREEDING_RANGE` constants; `BreedableSpecies` interface.
- [x] `LoveStateTracker` class: `feed`, `isInLove`, `isOnCooldown`, `completeBreeding`, `clear`.
- [x] `findBreedingPair` pure function (species/love/range filtering).
- [x] `childSpawnTransform` pure function (midpoint + lower-y placement).
- [x] `BreedingSystem` class: `feedEntity`, `tick` (population-cap gate, pair search, spawn +
      complete-breeding composition).
- [x] `src/engine/Game.ts`: construct one `BreedingSystem`; per-frame tick call alongside the
      existing passive-mob tick, passing `passiveMobs.getManager()`/`getActivePigs()`, a pig
      `BreedableSpecies` (breeding food `ItemId.Wheat`), and `SPAWN_CAP` as the population cap.

## Tests
- [x] `tests/unit/AnimalBreeding.test.ts`: `feed` correct-food/enters-love case.
- [x] `feed` wrong-food-rejected case.
- [x] `feed` on-cooldown-rejected case.
- [x] `completeBreeding` clears love + starts cooldown, blocking immediate re-feed case.
- [x] `findBreedingPair` in-range-in-love-match case.
- [x] `findBreedingPair` out-of-range-no-match case.
- [x] `findBreedingPair` not-in-love-excluded case.
- [x] `findBreedingPair` different-species-excluded case.
- [x] `BreedingSystem.tick` eligible-pair spawns exactly one child + completes breeding case (using
      a real `EntityManager`).
- [x] `BreedingSystem.tick` no-eligible-pair spawns-nothing case.
- [x] `BreedingSystem.tick` population-cap gating case (eligible pair does not breed at cap; love
      state preserved).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (14/14).
- [x] Full `npm test` passes (170 files, 1910/1910 — prior 1896 + 14 new).
- [x] `npm run build` passes (103 modules, up from 102 — confirms `Game.ts` consumes the new
      module).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — no live-game breeding
      trigger exists yet, per the proposal's Definition of Done).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 148-mob-drop-loot).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
