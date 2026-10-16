# Tasks: 216-biome-content-expansion

## Implementation
- [x] `src/data/BiomeExpansion.ts`: `BiomePrecipitation` / `BiomeCategory` / `BiomeDefinition` +
      `createBiomeDefinition` (id incl. `biome/` prefix rule, name, temperature [-2,2], choices,
      features; defaults 0.5/rain/plains/[]).
- [x] `BiomeExpansion` / `createBiomeExpansion` (duplicate rejection, registration order) /
      `biomeById` / `featuresFor`.

## Tests
- [x] `tests/unit/BiomeExpansion.test.ts`: creation incl. defaults.
- [x] Every rejection with exact messages.
- [x] Expansion order; duplicate; lookups; featuresFor; empty expansion.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2805/2805 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      217-structure-content-expansion).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
