# Tasks: 176-nether-world-generation

## Implementation
- [x] `src/worldgen/NetherTerrain.ts`: `NetherTerrainConfig` (worldSeed/minY/maxY/lavaLevel/ceilingY)
      with validation (`minY < lavaLevel < ceilingY < maxY`).
- [x] `NetherTerrainBlockIds`; `DEFAULT_NETHER_TERRAIN_CONFIG` (0/256/31/127 — matches 175's Nether);
      `DEFAULT_NETHER_TERRAIN_BLOCK_IDS` (netherrack placeholder 1, lava 20, bedrock 7).
- [x] `generateNetherColumn(seed, columnX, columnZ, config?, ids?)` → `TerrainColumn`.
- [x] Bedrock floor at minY and full bedrock roof at ceilingY; open roof area above.
- [x] Spongy density `(lavaLevel − y)/64 + noise`; netherrack where density > 0.
- [x] No water; lava fills every cell below lavaLevel that is not terrain.

## Tests
- [x] `tests/unit/NetherTerrain.test.ts`: defaults match `NETHER_DIMENSION_TYPE` bounds (0..256).
- [x] Full bedrock floor at minY and full bedrock roof at ceilingY (all x/z).
- [x] No water anywhere; every cell below lavaLevel is non-air; lava present.
- [x] Netherrack band exists with a topmost solid below the roof (32..126 scan).
- [x] Open roof area above ceilingY is air.
- [x] Deterministic per (seed, columnX, columnZ).
- [x] Caller-supplied block ids are written (netherrack/lava/bedrock).
- [x] Invalid configs (minY >= maxY, lavaLevel <= minY, ceilingY >= maxY or <= lavaLevel) throw.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2386/2386 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      177-nether-portal-blocks).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
