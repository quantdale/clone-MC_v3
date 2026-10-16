# Tasks: 181-end-world-generation

## Implementation
- [x] `src/worldgen/EndTerrain.ts`: `EndTerrainConfig` (worldSeed/minY/maxY) with validation.
- [x] `EndTerrainBlockIds`; `DEFAULT_END_TERRAIN_CONFIG` (0/256 — matches 180's End);
      `DEFAULT_END_TERRAIN_BLOCK_IDS` (endStone placeholder 1, 215 handoff).
- [x] Island constants (center y 64, base radius 45, variation 10, outer distance 1000, threshold
      0.35, outer radius 12).
- [x] `generateEndColumn(seed, columnX, columnZ, config?, ids?)` → `TerrainColumn`.
- [x] Main island sphere at the origin; outer-island blobs beyond 1000; void elsewhere.

## Tests
- [x] `tests/unit/EndTerrain.test.ts`: defaults match `END_DIMENSION_TYPE` bounds (0..256).
- [x] Main island present at the origin column (cells near (0, 64)).
- [x] Island vertical profile: top ≤ 127, bottom ≥ 0.
- [x] Near-but-outside columns (world 80,80) are pure void.
- [x] Outer-island columns keep cells within a small blob near y=64.
- [x] No water anywhere; cells inside the column volume.
- [x] Deterministic per (seed, columnX, columnZ).
- [x] Caller-supplied endStone id is written.
- [x] Invalid configs throw.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2427/2427 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      182-end-portal-progression).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
