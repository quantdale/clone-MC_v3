# Visual Golden Provenance

Committed goldens for the 60-cell visual-regression matrix (tests/e2e/visual-regression.spec.ts).

## Re-pin 2026-08-22 (validation campaign)

Goldens were regenerated via the suite's canonical `UPDATE_SNAPSHOTS=1` authoring path after two
intentional rendering/terrain changes landed on main:

1. **Worldgen depth pipeline v2** — five-field climate/biome classification, declarative surface
   rules, and region-owned ore veins changed generated terrain everywhere (see
   src/worldgen/WorldgenRegressionMatrix.ts, matrix version v2).
2. **Four-stream material split** — cutout (alphaTest) and fluid (blended, depthWrite:false)
   meshes now render as separate geometry with dedicated materials instead of folding into the
   opaque/translucent pair.

Determinism of the new terrain is proven by tests/unit/WorldgenDeterminism.test.ts; interaction
correctness after these changes is covered by the game E2E specs. Pixel-diff thresholds are
unchanged (channelTolerance 24 / maxChangedFraction 0.02 per Change 248).
