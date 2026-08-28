# Proposal: 181-end-world-generation

## Problem
180 defined the End's `DimensionType`, but nothing can generate its terrain — and the End is the
most unusual terrain in vanilla: an almost-pure void with a single main island at the origin and
scattered outer islands far beyond it. Without a generator, 182's portal progression has no
destination geometry, and 183's dragon fight has no arena.

## Goals
- `src/worldgen/EndTerrain.ts` (NEW): `generateEndColumn(seed, columnX, columnZ, config?, ids?)` —
  a pure, deterministic 16×16×256 `TerrainColumn` (088's shape, 176's pattern) over the End void:
  - the **main island** at the origin: an end-stone blob centered on (0, 64) with a noisy radius
    (45 ± 10 · noise, reaching ~y=127 top / ~y=0 bottom — vanilla's island profile);
  - **outer islands** beyond `END_OUTER_ISLAND_DISTANCE = 1000` (vanilla's outer ring): seeded
    per-column noise above `END_OUTER_ISLAND_THRESHOLD` decides island-bearing columns, each a
    small end-stone blob around y=64;
  - **void everywhere else** (air);
  - defaults match 180's `END_DIMENSION_TYPE` bounds (0..256);
  - block ids caller-configurable (`EndTerrainBlockIds`), with `endStone: 1` as a documented
    placeholder until a later content change (215) registers the real end_stone block — the
    exact 176→179 handoff pattern.

## Non-goals
- **No obsidian platform/pillars** (182/183's scope), **no end_stone registry entry** (215),
  **no dragon** (183), **no exit portal** (184).
- **No integration with `World`/`TerrainGenerator`** (a wiring concern).
- **No `Game`/`World` wiring.**

## Preconditions
- Change 180 (`end-dimension-type`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/worldgen/OverworldTerrain.ts` (088, `TerrainColumn`), `src/worldgen/DensityNoise.ts` (087),
  `src/data/DimensionTypes.ts` (180, `END_DIMENSION_TYPE`).

## Proposed change
1. `src/worldgen/EndTerrain.ts` (NEW): `EndTerrainConfig`, `EndTerrainBlockIds`,
   `DEFAULT_END_TERRAIN_CONFIG`, `DEFAULT_END_TERRAIN_BLOCK_IDS`, the island constants,
   `generateEndColumn`.

## Compatibility and migration
- One new worldgen file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Generating the End like a normal dimension** (solid terrain everywhere) — the easy mistake.
  Mitigation: the void rule is structural — non-origin near columns must be empty (pinned by a
  test), only the origin column carries the main island, and outer columns only ever contain small
  bounded blobs.
- **The noisy radius exceeding the theoretical fbm range** (fbm3D with 4 octaves spans ±1.875, not
  ±1). Mitigation: the profile test uses the honest bounds (top ≤ 127, bottom ≥ 0), documented in
  the test.
- **End-stone id placeholders reaching persistence**. Mitigation: documented 215 handoff, same as
  176→179.

## Rollback strategy
One new worldgen file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- `generateEndColumn` implemented with the rules above.
- Unit tests cover: defaults matching 180's End bounds; main island present at the origin column
  (cells near (0, 64)); island vertical profile (top ≤ 127, bottom ≥ 0); near-but-outside columns
  as pure void; outer-island columns as bounded blobs near y=64; no water; determinism per (seed,
  columnX, columnZ); caller-supplied ids; config validation.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
