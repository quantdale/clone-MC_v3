# Tasks: 218-mob-content-expansion

## Implementation
- [x] `src/data/MobExpansion.ts`: `MobCategory` / `MobArchetype` / `MobSpawnData` /
      `MobDefinition` + `createMobDefinition` (id incl. `mob/` prefix rule, name, category,
      archetype default, health, speed, hostile default, spawn rules).
- [x] `MobExpansion` / `createMobExpansion` (duplicate rejection, registration order) /
      `mobById` / `mobsByCategory` / `mobsInBiome`.

## Tests
- [x] `tests/unit/MobExpansion.test.ts`: creation incl. defaults (archetype, hostile).
- [x] Every rejection with exact messages.
- [x] Expansion order; duplicate; lookups; category/biome filters; empty expansion.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2822/2822 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      219-enchantment-potion-content-expansion).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
