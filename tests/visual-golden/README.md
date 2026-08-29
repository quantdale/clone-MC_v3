# Visual Golden Provenance

Committed goldens for the 60-cell visual-regression matrix (`tests/e2e/visual-regression.spec.ts`).

## Environment-scoped sets (2026-08-23, post-250 hardening Gate F)

Pixel output depends on the rendering environment: GPU/software rasterizer, OS font stack, and
headless mode all change captured pixels. Canonical GitHub Actions (ubuntu-latest) therefore
compares against a baseline pinned in that same environment instead of a workstation-pinned one —
the single global set previously made the mandatory E2E gate unpassable in CI (CI run 32577467105
on `ec6989b`: 54 cells exceeded thresholds at 0.015–0.049 vs the unchanged 0.02/0.015 bounds; all
six debug-overlay cells dimension-mismatched at 139 px [Windows Consolas] vs 149 px [Linux
monospace fallback] width). Thresholds, cell count, and update-mode semantics are unchanged.

Layout and resolution order:

| Directory | Baseline set | Resolved key |
|---|---|---|
| `win32-local/` | Windows authoring workstation (local dev / local gates) | `win32-local` |
| `linux-ci/` | Linux software-rendering baseline (canonical CI and local Linux gates) | `linux-ci` |

The active set is resolved by `resolveGoldenEnvironment()` (`tests/visual/matrix.ts`): a non-empty
`VISUAL_GOLDEN_ENV` wins verbatim; otherwise Linux always uses the committed `linux-ci` set,
while other platforms use `<platform>-ci` under `CI` and `<platform>-local` otherwise. Seeding follows
the suite's canonical `UPDATE_SNAPSHOTS=1` path; CI seeding is
automated by `.github/workflows/seed-visual-goldens.yml` (gated on the `[seed-visual]` commit
message marker or manual dispatch), which uploads the fresh `linux-ci/` tree as an artifact for
review before it is committed.

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
unchanged (channelTolerance 24 / maxChangedFraction 0.02 per Change 248). The files re-pinned on
that date are preserved byte-for-byte under `win32-local/`.
