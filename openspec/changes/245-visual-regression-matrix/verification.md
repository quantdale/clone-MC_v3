# Verification: 245-visual-regression-matrix

Status: VERIFIED
Completion: 100% (15/15 tasks)
Advancement allowed: yes (no exception used)

## Baseline (task 1.1)

Entry commit `3c8f8e906493169eba3cfca8e05420cba1b61dde` (244 VERIFIED, published). Full gate
green at entry: typecheck PASS, lint PASS, unit 286 files / 3719 passed + 1 skipped, build
PASS, e2e 35/35 (7.0m).

Confirmed pre-change state (no fabrication):

- No golden-image/snapshot infrastructure exists: no `toMatchSnapshot` /
  `toHaveScreenshot()` / `tests/visual-golden/` anywhere in the repo; the only image
  assertion is `tests/e2e/game.spec.ts` "renders textured terrain", a heuristic RGB
  pixel classifier over `page.screenshot()` buffers (grass/stone/sky counting), not a
  golden comparison.
- `playwright.config.ts`: headless Chromium, `workers: 1` (software WebGL starves under
  parallel load), `screenshot: 'only-on-failure'`, webServer builds with `VITE_E2E: 'true'`
  and serves `vite preview` on port 4173 (`reuseExistingServer: false`, 120s timeout).
- `pngjs` is an existing devDependency (used by the game.spec classifier); `pixelmatch`
  is NOT present, so the comparator is pngjs-based with no new dependency.
- `src/main.ts` exposes `window.__voxelGame` only when
  `import.meta.env.DEV || import.meta.env.VITE_E2E === 'true'`; the shipped bundle has
  no test hook.

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 capture-harness: per-cell deterministic capture | Pending implementation + `tests/e2e/visual-regression.spec.ts` | NOT VERIFIED |
| REQ-2 capture-harness: deterministic state assembly | Pending VITE_E2E boot/hook seam + e2e capture checks | NOT VERIFIED |
| REQ-3 capture-harness: golden lifecycle | Pending verify vs `UPDATE_SNAPSHOTS=1` runs | NOT VERIFIED |
| REQ-4 capture-harness: screen filter and full-matrix runs | Pending 60-cell matrix run + `SCREEN_FILTER` run | NOT VERIFIED |
| REQ-5 capture-harness: failure reporting | Pending injected-mismatch e2e assertions | NOT VERIFIED |
| REQ-1 golden-comparison: exact-mode equality | Pending `tests/unit/GoldenCompare.test.ts` › exact mode | NOT VERIFIED |
| REQ-2 golden-comparison: pixel-diff tolerance boundary | Pending › pixel-diff boundaries | NOT VERIFIED |
| REQ-3 golden-comparison: dimension mismatch | Pending › dimension mismatch | NOT VERIFIED |
| REQ-4 golden-comparison: missing golden | Pending › missing golden | NOT VERIFIED |
| REQ-5 golden-comparison: malformed input | Pending › decode error | NOT VERIFIED |
| REQ-6 golden-comparison: determinism | Pending › determinism | NOT VERIFIED |
| REQ-1 matrix-manifest: screen list | Pending `tests/unit/VisualMatrix.test.ts` › screens | NOT VERIFIED |
| REQ-2 matrix-manifest: quality profile axis | Pending › quality profiles | NOT VERIFIED |
| REQ-3 matrix-manifest: resolution axis | Pending › resolutions | NOT VERIFIED |
| REQ-4 matrix-manifest: cell enumeration and golden paths | Pending › cells and golden paths | NOT VERIFIED |
| REQ-5 matrix-manifest: manifest validation | Pending › validation | NOT VERIFIED |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | NOT RUN | Run at the final gate |
| npm run lint | NOT RUN | Run at the final gate |
| npm test | NOT RUN | Run at the final gate |
| npm run build | NOT RUN | Run at the final gate |
| npm run test:e2e | NOT RUN | Includes the 60-cell visual matrix |

## Edge/adversarial validation
- Missing golden fails in verify mode and writes only under `UPDATE_SNAPSHOTS=1`.
- `SCREEN_FILTER` narrows the run; the full 60-cell matrix passes when unset.
- Corrupt-golden decode-error and dimension-mismatch paths are distinct failures.
- One failing cell does not halt the remaining cells; all rows are reported.
- Normal release build has no `__voxelGame`/quality-seam exposure when `VITE_E2E`
  is absent.

## Migration/compatibility validation
- Pending: confirm shipped bundle is unchanged (VITE_E2E-only seam), no schema/
  save-format/registry/public-API change, and goldens are new non-shipped files.

## Performance/resource validation
- Pending: full matrix runs on a single worker within a bounded budget; comparison
  is O(w×h) with a byte-identity fast path; captures are released per cell.

## Regressions
- Pending: full baseline gate and prior e2e suite remain green alongside the matrix.

## Incomplete tasks
All tasks pending — implementation has not begun.

## Advancement Exception
Not applicable — completion is 0% and no requirement is verified.

## Final decision
Pending. This change advances only after all tasks complete and the baseline gate
passes.

## Implementation evidence (tasks 1.2-3.1)

- Boot seam (1.2): `Game` constructor accepts `quality?: GameQualityOverrides`
  (`renderDistance` applied to World/Environment creation before preload; `fov` applied to
  `renderer.camera` + projection update; `brightness` frozen as the daylight factor).
  `src/main.ts` reads `window.__voxelQualityProfile` strictly under
  `import.meta.env.VITE_E2E === 'true'` — the identical gate that exposes `__voxelGame`.
- Deterministic-state hooks (1.3): `Game.testSetCameraPose(yaw, pitch)`,
  `Game.testFreezeDayNight(daylight)` (backed by the new `Lighting.freezeDayNight`, which pins
  the sun direction analytically solving d = (y + 0.18) / 1.05 and zeroes dt/rotation while
  frozen), and `Game.testNormalizeHud(fps, worldTime, debugStats)` backed by new
  `HUD.setFixedText` / `DebugOverlay.setFixedText` overrides honored inside their per-frame
  updates.
- Pure modules (2.1/2.2): `tests/visual/matrix.ts` (10 screens with families/modes/selectors,
  low/default/high profiles, two 16:9 resolutions, 60-cell `allCells()`, `goldenPath()`,
  `validateMatrix()` + exported per-collection validators) and `tests/visual/goldenCompare.ts`
  (`comparePng` byte-identity fast path, exact/pixel-diff modes, strict-greater channel
  tolerance, missing-golden/dimension-mismatch/decode-error outcomes; deterministic;
  `writeDiffPng` debug artifacts). No production imports; pngjs only.
- Unit tests (2.3/2.4): `VisualMatrix.test.ts` (24 tests) + `GoldenCompare.test.ts` (16 tests)
  covering every scenario in both specs' verification mappings — 40/40 green.
- Capture harness (3.1): `tests/e2e/visual-regression.spec.ts` — per-cell fresh context with
  empty localStorage, quality profile injected pre-boot via addInitScript, `?seed=1337`,
  world-ready wait, deterministic state assembly (fixed pose 0.6/-0.15, per-screen day/night
  freeze: environment-day=1.0, environment-night=0.0, otherwise profile brightness; normalized
  HUD/debug text), 750ms settle, full-viewport or element-clipped capture by mode,
  UPDATE_SNAPSHOTS / SCREEN_FILTER handling, failure artifacts under
  `test-results/visual/<screen>/<quality>/<resolution>/`, one report row per cell, spec fails
  if any executed row is not pass/updated. Test timeout raised to 30 min (60 serial software-
  WebGL cells exceed the 30s default).

## Golden lifecycle + verification evidence (tasks 3.2-4.2)

- **Golden seeding (3.2)**: one `UPDATE_SNAPSHOTS=1` run wrote all 60 goldens under
  `tests/visual-golden/<screen>/<quality>/<resolution>.png` (14 MB total; 5.8m wall clock,
  single worker). Artifacts reviewed via the layout + a verify-mode re-run.
- **Verify mode (3.3)**: full 60-cell matrix against the committed goldens — PASS in 5.4m.
  DOM-overlay screens compare byte-exact; render/environment screens within channelTolerance 24
  / maxChangedFraction 0.01. The determinism contract holds on repeated headless captures.
- **Failure reporting (3.4)**: per-cell report rows collected; failing cells write actual+diff
  PNGs under `test-results/visual/...`; missing goldens report `missing-golden` with the
  expected path; the spec fails when any executed row is not pass/updated (assertion at spec
  end). Missing-golden / decode-error / dimension-mismatch / threshold paths are additionally
  covered by the 16 GoldenCompare unit tests.
- **SCREEN_FILTER (4.1)**: `SCREEN_FILTER=crosshair` executed only the crosshair cells
  (6 cells, 33.9s) and passed — narrowing works without weakening the normative full-matrix
  requirement (the unfiltered 60-cell run above).
- **Shipped-build purity (4.2)**: after a normal `npm run build` (no VITE_E2E),
  `grep -c "__voxelQualityProfile\|__voxelGame" dist/assets/*.js` returns 0 matches in every
  bundle — the seam does not exist in release artifacts.

## Commands

| Command | Result | Evidence |
|---|---|---|
| npm run typecheck | PASS | clean incl. all new files |
| npm run lint | PASS | eslint . clean |
| npm test | PASS | 288 files / 3759 passed + 1 skipped (+40 vs baseline 3719) |
| npm run build | PASS | dist emitted; no test seam in bundles |
| npx playwright test visual-regression.spec.ts (verify) | PASS | 60/60 cells, 5.4m |
| npm run test:e2e (full, incl. visual matrix) | PASS | 36 passed (12.7m) |

## Final decision

VERIFIED — 15/15 tasks (100%), all three capability specs reconciled with passing evidence,
full gate green, no unresolved blocker, no advancement exception used. Change 246
(input-accessibility-matrix) is eligible to activate.
