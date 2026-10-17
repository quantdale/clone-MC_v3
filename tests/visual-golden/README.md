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

## Enforcement: staleness check (change 300, 2026-10-17)

`scripts/check-visual-goldens.mjs` compares, for each committed baseline set, the
newest commit touching that set against the newest **real content** change to a
captured surface (`index.html`, `src/styles.css`, `src/rendering/**` — the single
source of truth is `CAPTURED_SURFACE_GLOBS` in `tests/visual/matrix.ts`). It runs
as a CI step before the browser gate, so a stale baseline fails in seconds
instead of after 14 minutes of capture.

Properties:

- **Read-only.** It never writes a golden, never re-pins, and never reads a PNG.
- **Line-ending safe.** A whitespace-only commit contributes no `git log -w
  --numstat` rows and is therefore skipped; change 298's repository-wide
  renormalisation does not mark every set stale.
- **Exact-commit acknowledgement.** `tests/visual-golden/acknowledgements.json`
  maps one 40-hex commit to a written reason. Only the *newest* surface commit
  may be acknowledged; naming any other commit has no effect. Set
  `VISUAL_GOLDENS_ACKNOWLEDGED=<sha>` for a one-off local run.
- **Exit codes.** 0 fresh or acknowledged, 1 stale, 2 a baseline directory is
  missing.

### Measured status at 2026-10-17 (not a claim from the older audit dossiers)

The audit-authored packages asserted the matrix was chronically ~50% red and that
the `#trading-open` HUD chip made 12 `linux-ci` cells unmatchable. Both claims
were re-measured here and **do not reproduce**:

| Measurement | Result |
|---|---|
| Canonical CI run `38989997105` (commit `d36b1a0`) | `tests/e2e/visual-regression.spec.ts:176:3 > every matrix cell matches its committed golden` **passed in 14.1m — all 60 `linux-ci` cells green** |
| Local verify mode (this Windows host, `win32-local` set) | **60/60 green, four consecutive runs** (7.1m, 7.4m, 7.1m, 8.8m) |
| Fresh re-pin of `win32-local` | Changed 19 cells that were **already passing**, so the re-pin was reverted as unnecessary churn |
| `render-world/high/1920x1080` noise, five captures vs a fixed baseline | `0, 0, 0, 0, 0.0201` — worst case sits *at* the 0.02 bound and occasionally crosses it |
| `#trading-open` chip geometry | Lives inside `#hud`, so it is captured by `render-world` and `hud`; it changes those cells by less than the 0.02 tolerance, which is why the pinned sets still match |

The one real, reproducible issue is the last column of the table: a single cell
whose software-WebGL noise floor equals the threshold. It is handled by an
explicit, documented per-cell bound (`UNSTABLE_CELL_NOISE_BOUND = 0.022` in
`tests/e2e/visual-regression.spec.ts`) rather than by raising the global
threshold, and `tests/unit/VisualGoldenNoiseBound.test.ts` proves the bound still
fails a synthetic image above it.

## Baseline policy (change 300)

Both environment sets are **retained**. Each is the only set its environment can
honestly produce:

| Set | Produced by | Gate that consumes it |
|---|---|---|
| `linux-ci/` | Canonical GitHub Actions `ubuntu-latest` (`seed-visual-goldens.yml`, `[seed-visual]` marker or manual dispatch). It **cannot** be re-pinned from a Windows or WSL host: SwiftShader/GPU and font stacks differ, so a locally captured "linux" set would be fabricated pixels. | CI `e2e` job |
| `win32-local/` | The Windows authoring workstation | Local `npm run test:e2e` |

Retiring `win32-local` was considered and rejected: it is the only baseline a
Windows contributor's local gate can compare against, and deleting it would
convert every local browser run into `missing-golden` failures.

**Refresh trigger (enforced, not remembered):** the staleness check fails the CI
`e2e` job whenever a captured surface changed after a set was pinned. Re-pin
through the canonical path (`UPDATE_SNAPSHOTS=1` against the matching
environment) and review the PNG diff as its own commit; or, when the surface
change is provably pixel-neutral, record the exact commit in
`acknowledgements.json` with the reason.

## Re-pin 2026-09-16 (post-277 release-readiness campaign)

Goldens were regenerated through the canonical `UPDATE_SNAPSHOTS=1` path after the
live integrations completed through Change 277. The refreshed captures include the
intentional HUD and world-state surfaces from Changes 259–277 (settings/actions,
game-mode controls, sleep/weather indicators, and the current interaction UI), plus
the corrected non-overlapping top-right HUD control stack. Verify mode was then run
against all 60 refreshed cells.

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
