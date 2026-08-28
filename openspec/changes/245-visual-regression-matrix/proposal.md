# Proposal: 245-visual-regression-matrix

## Problem

The game has no automated visual regression guard. Playwright captures screenshots
only `on-failure`, and the single image-based check (`tests/e2e/game.spec.ts`
"renders textured terrain") is a heuristic pixel classifier (counts grass/stone/sky
pixels) with no golden comparison. As the renderer, HUD, inventory/container UI, and
environment evolve (changes 075, 196-210, 211-221, 244), there is nothing that fails
when a quality setting, a resolution, or a rendering change alters what the player
actually sees. Nothing prevents subtle rendering drift (wrong fog distance, shifted
HUD chips, broken sky tint, misplaced hotbar) from going unnoticed.

## Goals

- Stand up a deterministic, golden-image visual regression matrix for the
  Render, HUD, inventory/container, and environment surfaces of the game.
- Define a concrete matrix: a fixed set of screens, a fixed quality-setting axis,
  and a fixed resolution axis, whose full cross-product is capturable headlessly.
- Capture deterministically in headless Chromium (fixed seed, fixed camera pose,
  frozen day/night, normalized dynamic HUD text, fresh context, capped DPR).
- Compare captures against stored golden PNGs with a concrete, thresholded
  method: exact-byte comparison for deterministic DOM-overlay screens and a
  documented pixel-diff tolerance for WebGL render/environment screens.
- Make missing goldens a hard failure in verify mode and support an explicit,
  opt-in regeneration (`UPDATE_SNAPSHOTS=1`) for intentional golden updates.
- Produce a per-cell pass/fail report with the failing screen/quality/resolution,
  changed-pixel fraction, and the diff output paths.

## Non-goals

- No production rendering, HUD, inventory, or environment feature work. This change
  only adds capture/comparison test infrastructure plus the minimal test-only seam
  required to observe render-visible quality settings.
- No general graphics-quality-preset feature (a user-facing "fast/fancy" switch is
  the domain of change 206/208 and stays out of scope).
- No new gameplay-feature screenshots beyond the enumerated screen list.
- No screenshot coverage for weather particle/rain visuals, which are not yet wired
  into the rendered scene at the time of authoring (see `design.md`); if a later
  change wires them, extending the matrix is a follow-up, not part of this change.
- No change to the default `npm test` unit suite's coverage of gameplay logic; the
  pure comparison/manifest modules gain focused unit tests, and the matrix runs as a
  dedicated e2e spec.
- No dependence on the still-unwired 206 settings runtime consumption: the quality
  axis is applied through a VITE_E2E-only boot/test seam owned by this change.

## Preconditions

- Change 244 (`244-worldgen-regression-matrix`) is VERIFIED and advancement is
  allowed, so its deterministic seed/coordinate worldgen goldens are in place and
  share conventions (fixed seed, golden storage, update-mode env) with this change.
- `playwright.config.ts` already runs headless Chromium on a single worker with a
  `VITE_E2E` build exposing `window.__voxelGame` (see `design.md`), which the harness
  reuses.
- The project already depends on `pngjs` (devDependency) for PNG decoding; the
  comparison utility builds on it and does not introduce a new runtime dependency.

## Dependencies

- `@playwright/test` and `pngjs` (existing devDependencies).
- The `VITE_E2E` build hook and `window.__voxelGame` test global (existing).
- `CONFIG.headless` pixel-ratio cap (DPR 1 in headless) for deterministic raster size.
- The `?seed=` URL override used to fix world generation.
- `tests/visual/goldenCompare.ts` and `tests/visual/matrix.ts` (new test-support
  modules, never shipped) imported by a new e2e spec and by focused unit tests.
- A new VITE_E2E-only boot hook that accepts a render-visible quality configuration
  (`renderDistance`, `fov`, `brightness`); its application to the render pipeline is
  specified in `design.md` and reconciled against 206's wiring by the implementer.

## Proposed change

Add a visual-regression matrix package (test infrastructure only):

1. **Matrix manifest** (`tests/visual/matrix.ts`): the enumerated screen list with
   capture mode and family, the quality-setting axis (three named profiles over
   `renderDistance`/`fov`/`brightness`), the resolution axis (two viewport sizes),
   the derived cell list, the golden storage layout, and a validation function.
2. **Golden comparison** (`tests/visual/goldenCompare.ts`): a pure, headless-safe
   PNG comparison supporting exact-byte mode (DOM overlays) and pixel-diff mode
   (WebGL render/environment) with documented channel tolerance and max-changed-
   fraction thresholds; missing-golden results; and a deterministic diff report.
3. **Capture harness** (`tests/e2e/visual-regression.spec.ts`): drives headless
   Chromium per cell — fresh context, fixed seed, deterministic state assembly
   (camera pose, day/night freeze, normalized HUD text), full-viewport or
   element-clipped capture, golden read/compare, `UPDATE_SNAPSHOTS` regeneration,
   and a pass/fail report asserted by the spec.
4. **Focused unit tests** for the manifest validation and the comparison utility.

The matrix is `3 qualities × 2 resolutions × 10 screens = 60 cells`.

## Compatibility and migration

- Additive test infrastructure only. No shipped production module is modified.
- The only production-code change is a VITE_E2E-only boot hook (test build only,
  gated exactly like the existing `__voxelGame` hook), so normal releases are
  unaffected; no schema, save-format, or registry change.
- Golden files are new and live under `tests/visual-golden/`; they are never part of
  the shipped bundle.
- No migration of existing persisted data; no change to any public API.

## Risks

- **Headless WebGL nondeterminism**: software-rendered WebGL can produce small
  frame-to-frame channel differences. Mitigated by pixel-diff tolerance on
  render/environment screens and by using exact comparison only on element-clipped
  DOM overlays.
- **Dynamic HUD text** (FPS counter, world time) changes every frame and would break
  equality. Mitigated by normalizing/freezing dynamic HUD text to constants before
  capture.
- **Persisted-session interference**: prior `localStorage` world/player saves alter
  world and inventory. Mitigated by a fresh browser context per capture with storage
  cleared, so every cell starts from the deterministic seed baseline.
- **Runtime re-streaming on quality change** would be slow and nondeterministic.
  Mitigated by applying `renderDistance` at boot (before world creation), never at
  runtime.
- **Scope creep into 206/208**: the quality axis must stay render-observable without
  building a user-facing quality preset. The seam is test-only and minimal.

## Rollback strategy

- The change is purely additive. Reverting removes the new test-support modules,
  the e2e spec, the golden files, and the VITE_E2E-only boot hook; no shipped
  behavior changes, so rollback is a clean deletion.
- A golden that is deemed wrong can be regenerated with `UPDATE_SNAPSHOTS=1` and
  re-reviewed; no destructive action to existing tests or data.

## Definition of Done

- The manifest, comparison, and harness modules exist and are unit-tested.
- The full matrix (60 cells) runs and passes headlessly with zero unexpected
  failures; a first-run seed of goldens is committed.
- Missing goldens fail in verify mode and regenerate only under
  `UPDATE_SNAPSHOTS=1`.
- Every requirement in the capability specs has a passing scenario/evidence.
- The baseline gate (`npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`) passes.

## Advancement gate

Target 100% task completion. The absolute floor is 90% with an explicit
`Advancement Exception` in `verification.md` proving any incomplete task is
non-blocking and implements/verifies no MUST/SHALL requirement. Required tests pass
and no unresolved correctness or regression blocker remains.
