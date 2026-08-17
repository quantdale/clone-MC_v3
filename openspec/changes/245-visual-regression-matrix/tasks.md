# Tasks: 245-visual-regression-matrix

## 1. Baseline, characterization, and test seam

- [ ] 1.1 Establish baseline: record that no golden-image/snapshot infrastructure
      exists today, confirm `playwright.config.ts` headless single-worker/VITE_E2E
      behavior and the existing `pngjs`-based pixel classifier in `game.spec.ts`
      (record evidence in `verification.md`, not fabricated).
- [ ] 1.2 Add the VITE_E2E-only boot hook so `src/main.ts`/`src/engine/Game.ts`
      accept a quality profile `{ renderDistance, fov, brightness }` at game
      construction (test build only, gated exactly like `__voxelGame`); apply
      `renderDistance` to World/Environment creation, `fov` to the camera, and
      `brightness` to a fixed daylight override. Normal builds unchanged.
- [ ] 1.3 Add the VITE_E2E-only deterministic-state hooks on `window.__voxelGame`:
      set fixed yaw/pitch, freeze the day/night clock at a daylight value, and
      normalize dynamic HUD text (`#fps-counter`, `#world-time`, debug overlay
      stats) to fixed constants.

## 2. Pure modules and focused unit tests

- [ ] 2.1 Implement `tests/visual/matrix.ts`: `SCREENS` (10), `QUALITY_PROFILES`
      (low/default/high), `RESOLUTIONS` (1280x720/1920x1080), `allCells()` (60),
      `goldenPath(cell)`, and `validateMatrix()`.
- [ ] 2.2 Implement `tests/visual/goldenCompare.ts`: `comparePng` supporting
      byte-identity fast path, exact mode, pixel-diff mode with `channelTolerance`/
      `maxChangedFraction`, and `missing-golden`/`dimension-mismatch`/`decode-error`
      outcomes; add `writeDiffPng` for debug artifacts.
- [ ] 2.3 Unit tests for `VisualMatrix.test.ts`: screen/family/mode assertions,
      profile values, resolution aspect, 60-cell enumeration, golden-path
      derivation, and `validateMatrix()` valid/invalid cases.
- [ ] 2.4 Unit tests for `GoldenCompare.test.ts`: exact-mode equality, pixel-diff
      tolerance boundaries (equal-at-boundary, over-tolerance, at/above max-changed-
      fraction), dimension mismatch, missing golden, decode error, determinism.

## 3. Capture harness and e2e matrix

- [ ] 3.1 Implement `tests/e2e/visual-regression.spec.ts`: per-cell fresh context,
      `?seed=1337` + viewport + quality profile, world-ready wait, deterministic
      state assembly (camera pose, frozen day/night, normalized HUD text, screen UI
      reveal/hide), settle delay, full-viewport or element-clipped capture,
      golden read/compare, `UPDATE_SNAPSHOTS` and `SCREEN_FILTER` handling.
- [ ] 3.2 Seed the committed goldens under `tests/visual-golden/` by running the
      matrix once with `UPDATE_SNAPSHOTS=1` and reviewing the artifacts.
- [ ] 3.3 Verify the full 60-cell matrix passes headlessly against the committed
      goldens (no `UPDATE_SNAPSHOTS`); confirm the matrix is green.
- [ ] 3.4 Add failure reporting: per-cell report rows, `test-results/visual/…`
      actual+diff artifacts on failure, missing-golden failing in verify mode, and
      the spec asserting all executed rows are `pass` (or `updated` under the flag).

## 4. Edge/failure, regression, and final gate

- [ ] 4.1 Edge/failure coverage: missing golden fails (verify) / writes (update);
      `SCREEN_FILTER` narrows the run; corrupt-golden decode-error and dimension-
      mismatch paths; one failing cell does not halt the others.
- [ ] 4.2 Confirm the shipped build's `window.__voxelGame`/boot hook gating is
      unaffected when `VITE_E2E` is absent (normal release build has no seam).
- [ ] 4.3 Update `tasks.md` checkboxes, `verification.md` with real evidence, and
      the durable state files (`PROGRAM_STATE.json`, `PROGRAM_STATE.md`) when this
      change reaches VERIFIED.
- [ ] 4.4 Run the final baseline gate (`npm run typecheck`, `npm run lint`,
      `npm test`, `npm run build`, `npm run test:e2e`), record results, complete the
      pre-implementation quality gate, and reconcile all specs/design/tasks with the
      actual implementation per `SPEC_AUTHORING_PROTOCOL.md`.
