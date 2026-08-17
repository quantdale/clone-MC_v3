# Design: 245-visual-regression-matrix

## Context/current state

### How the game is captured today
- `tests/e2e/game.spec.ts` runs against a production `vite build` served by
  `vite preview` on port 4173. `playwright.config.ts` uses headless Chromium,
  `workers: 1` (software WebGL starves under parallel load), `screenshot:
  'only-on-failure'`, `trace: 'on-first-retry'`. There is **no**
  `toMatchSnapshot`, `expect(page).toHaveScreenshot()`, or golden comparison
  anywhere in the repo.
- The only image assertion is `game.spec.ts` "renders textured terrain": it polls
  `page.screenshot()` and classifies grass/stone/sky pixels with a heuristic RGB
  classifier (a "terrain is present" smoke check, not a golden regression).
- `pngjs` is already a devDependency; `pixelmatch` is **not** present, so the diff
  must be implemented on `pngjs` buffers (no new dependency).

### Boot and test hooks
- `src/main.ts` exposes `window.__voxelGame` only when
  `import.meta.env.DEV || import.meta.env.VITE_E2E === 'true'`. The harness reuses
  this global and the `VITE_E2E` build gate.
- The world seed resolves via `?seed=` URL override (`src/engine/Game.ts`
  `resolveSeed`), default `CONFIG.seed = 1337`.
- `waitForGame(page)` waits for `#loading` to reach `hidden` (world ready).
  `enterPointerLock(page)` clicks `#game-canvas` and waits for
  `document.pointerLockElement`.

### Rendering pipeline (grounding for the render axis)
- `src/engine/Renderer.ts` creates a `THREE.PerspectiveCamera(75, aspect, 0.1, 1024)`
  — **fov is hardcoded to 75**. `antialias: true`, `outputColorSpace:
  SRGBColorSpace`, ACES tone mapping, exposure 1.05. In headless
  (`navigator.webdriver`) it sets pixel ratio to
  `min(devicePixelRatio, CONFIG.headless.maxPixelRatio)` where
  `CONFIG.headless.maxPixelRatio = 1`, and disables shadows
  (`CONFIG.rendering.shadows && !headless`).
- `src/rendering/Environment.ts` builds fog from `renderDistance`
  (`fog.near`/`fog.far` derived from the chunk-span corner distance), a shader sky
  (day/night tint driven by a `daylight` uniform), and a procedural cloud layer that
  is **disabled in headless** (`CONFIG.rendering.clouds && !headless`).
- `src/rendering/Lighting.ts` drives the day/night cycle (`CONFIG.dayNight.dayLength
  = 600`), computing `getDaylightFactor()`, `getTimeOfDayHours()`, and a sun
  direction; `Environment.update` consumes the daylight factor. When simulation is
  inactive, `lighting.update(dt=0, ...)` freezes the clock — so withholding pointer
  lock freezes day/night at its initial value.
- `CONFIG.headless` forces `renderDistance: 2`, `simulationDistance: 2`,
  `maxPixelRatio: 1`, `clouds: false` in headless.

### Settings model (grounding for the quality axis)
- `src/simulation/SettingsFramework.ts` (change 206) defines a pure settings model.
  The graphics-affecting keys are `renderDistance` (integer `[2, 32]`, default 12),
  `fov` (integer `[30, 110]`, default 70), `brightness` (float `[0, 1]`, default
  0.5). **It is not consumed by the runtime** — `getSetting`/`deserializeSettings`
  are used only inside the framework itself; `Renderer.ts` hardcodes fov 75, and
  `Game.ts` does not read the settings store for `renderDistance`/`brightness`.
- Consequence: changing the 206 settings store does not today change any rendered
  pixel. To make a "quality settings axis" observable, this change introduces a
  minimal VITE_E2E-only boot hook that applies a fixed quality configuration to the
  render pipeline. Fully general settings wiring belongs to change 206/208 and is
  **out of scope**; the implementer reconciles this seam against 206's wiring per
  the final reconciliation step.

### UI surfaces (grounding for the screen list)
- `src/ui/HUD.ts` wraps `#hud` and updates DOM chips: `#fps-counter`,
  `#selected-block-name`, `#health-status`, `#hunger-status`, `#world-time`.
  **`#fps-counter` and `#world-time` change every frame** and must be normalized for
  deterministic capture.
- `src/ui/Crosshair.ts` renders via CSS pseudo-elements on `#crosshair`.
- `src/inventory/Hotbar.ts` renders `#hotbar` item slots from the texture atlas.
- `src/ui/DebugOverlay.ts` toggles `#debug-overlay` (F3), showing dynamic stats that
  must be normalized.
- `src/ui/LoadingIndicator.ts` owns `#loading`; `src/engine/Game.ts` also owns the
  `#overlay` start/pause overlay and the `#error`/`#error-message` fatal-error path.
- `src/ui/CraftingPanel.ts` is the in-game container/crafting DOM panel opened by the
  crafting toggle. `InventoryScreenParity.ts`/`ContainerScreenFramework.ts` are pure
  headless transaction models (202/203); the only DOM container UI the game presents
  today is the crafting panel, which is what the inventory-family screen captures.
- Weather (`src/rendering/WeatherPresentation.ts`, 197) is a pure presentation
  mapping with **no wiring into the rendered scene** at authoring time, so weather
  visuals are excluded from the environment screens.

## Target state

A `tests/visual/` harness and a `tests/e2e/visual-regression.spec.ts` matrix that,
for each cell `(screen, quality, resolution)`, captures a deterministic golden and
compares it. The matrix is exactly:

- **Screens (10):**
  - Render family (full viewport, pixel-diff): `render-world`,
    `render-world-no-hud`.
  - HUD family (element-clipped, exact): `hud`, `hotbar`, `crosshair`,
    `debug-overlay`, `start-overlay`.
  - Inventory family (element-clipped, exact): `container-ui`.
  - Environment family (full viewport, pixel-diff): `environment-day`,
    `environment-night`.
- **Quality axis (3 profiles), a fixed tuple over `{ renderDistance, fov,
  brightness }`:**
  - `low`: `{ renderDistance: 2, fov: 70, brightness: 0.3 }`
  - `default`: `{ renderDistance: 2, fov: 75, brightness: 0.5 }` (matches today's
    headless behavior: renderDistance 2, hardcoded fov 75, default brightness 0.5)
  - `high`: `{ renderDistance: 4, fov: 90, brightness: 0.8 }`
- **Resolution axis (2 viewports, same 16:9 aspect so projection is comparable):**
  `1280x720`, `1920x1080`.
- **Cells: 3 × 2 × 10 = 60.**

`renderDistance` is applied **at boot** (before world/Environment creation) so fog
and chunk streaming are deterministic; `fov` is applied to `renderer.camera.fov`
(+ `updateProjectionMatrix()`); `brightness` is applied to the lighting/Environment
as a fixed daylight override (see Testing seams).

### Comparison rules
- **Exact mode** (DOM-overlay screens: hud, hotbar, crosshair, debug-overlay,
  start-overlay, container-ui): element-clipped screenshots; equal iff the PNG
  bytes are identical (`channelTolerance = 0`, `maxChangedFraction = 0`). DOM
  rendering with a fixed viewport, fixed fonts, and normalized dynamic text is
  deterministic.
- **Pixel-diff mode** (render/environment screens): full-viewport screenshots;
  equal iff the fraction of pixels where any channel differs by more than
  `channelTolerance` is `<= maxChangedFraction`. Defaults: `channelTolerance = 24`
  (per 0-255 channel), `maxChangedFraction = 0.01` (1%). A fast path treats
  byte-identical PNGs as equal before decoding.
- **Missing golden**: in verify mode a missing golden is a FAILURE (never an
  auto-pass), reported with the expected path. Under `UPDATE_SNAPSHOTS=1` a missing
  golden is written and the cell is reported "updated", not failed.

## Invariants

- Determinism: every cell is captured from a **fresh Playwright context with
  `localStorage` cleared**, fixed seed, fixed viewport, fixed camera pose, frozen
  day/night, and normalized dynamic HUD text, so repeated runs reproduce the same
  capture for a fixed headless engine.
- Purity: `goldenCompare` and the manifest validation are pure, headless-safe
  functions (no DOM, no `Date`, no `Math.random`); their outputs are deterministic.
- Storage: a golden's path is a pure function of `(screen, quality, resolution)` and
  is stable across runs; `test-results/` is a throwaway output area for actuals/diffs.
- Comparison thresholds are fixed constants in the manifest, not recomputed per run.
- Missing goldens are never silently accepted in verify mode.

## API and data model

TypeScript sketches (descriptive intent; normative requirements live in the specs).

```ts
// tests/visual/matrix.ts
export type ScreenFamily = 'render' | 'hud' | 'inventory' | 'environment';
export type CaptureMode = 'full-viewport' | 'element-clipped';

export interface ScreenDef {
  readonly id: string;            // e.g. 'render-world'
  readonly family: ScreenFamily;
  readonly mode: CaptureMode;
  /** Element selector used when mode === 'element-clipped'. */
  readonly selector?: string;
  /** VITE_E2E-only DOM/element to normalize before capture. */
  readonly normalize?: string[];
}

export interface QualityProfile {
  readonly id: string;                    // 'low' | 'default' | 'high'
  readonly renderDistance: number;        // integer 2..32
  readonly fov: number;                   // integer 30..110
  readonly brightness: number;            // float 0..1
}

export interface Resolution {
  readonly id: string;                    // '1280x720' | '1920x1080'
  readonly width: number;
  readonly height: number;
}

export interface MatrixCell {
  readonly screen: string;
  readonly quality: string;
  readonly resolution: string;
}

export const SCREENS: readonly ScreenDef[];
export const QUALITY_PROFILES: readonly QualityProfile[];
export const RESOLUTIONS: readonly Resolution[];
export function allCells(): readonly MatrixCell[];
export function goldenPath(cell: MatrixCell): string; // tests/visual-golden/<screen>/<quality>/<resolution>.png
export function validateMatrix(): string[];           // returns list of defects; empty means valid
```

```ts
// tests/visual/goldenCompare.ts
export interface CompareOptions {
  readonly channelTolerance: number;   // per 0-255 channel
  readonly maxChangedFraction: number; // 0..1
}

export type CompareResult =
  | { readonly status: 'pass'; readonly mode: 'exact' | 'pixel-diff'; readonly changedFraction: 0 }
  | { readonly status: 'pass'; readonly mode: 'pixel-diff'; readonly changedFraction: number; readonly changedPixels: number }
  | { readonly status: 'fail'; readonly reason: 'dimension-mismatch' | 'exceeded-threshold' | 'decode-error';
      readonly changedFraction?: number; readonly changedPixels?: number }
  | { readonly status: 'missing-golden' };

export function comparePng(actualPng: Buffer, goldenPng: Buffer | null, opts: CompareOptions): CompareResult;
export function writeDiffPng(actual: Buffer, golden: Buffer, outPath: string): void; // debug aid; deterministic
```

```ts
// tests/e2e/visual-regression.spec.ts
// For each cell: new context -> navigate -> assemble deterministic state ->
// capture (full-viewport or element-clipped) -> read golden -> compare ->
// record report row. Assert: report has zero failures and zero missing goldens
// (unless UPDATE_SNAPSHOTS=1, which reports 'updated' rows).
export interface VisualReportRow {
  readonly screen: string; readonly quality: string; readonly resolution: string;
  readonly status: 'pass' | 'fail' | 'missing-golden' | 'updated';
  readonly changedFraction?: number; readonly message?: string;
}
```

## Control/data flow

For each cell, headless Chromium:

1. `page.setViewportSize(resolution)`.
2. Navigate to `/?seed=1337` (fixed seed), after applying the cell's quality profile
   through the VITE_E2E-only boot hook.
3. Wait for world ready (`#loading` hidden); assemble deterministic state:
   - clear/ignore any persisted session (fresh context ⇒ empty `localStorage`);
   - set the camera to the fixed spawn pose (fixed yaw/pitch via the test hook,
     no movement, no bob — bobAmount is 0 while not moving);
   - freeze day/night at the profile's `brightness`/fixed daylight (test hook) so
     the clock does not advance during capture;
   - normalize dynamic HUD text (`#fps-counter`, `#world-time`, debug stats) to
     fixed constants;
   - reveal/hide the screen's UI elements per `ScreenDef` (e.g. hide HUD/hotbar/
     crosshair for `render-world-no-hud`; toggle `#debug-overlay` for `debug-overlay`;
     open the crafting panel for `container-ui`; show `#overlay` for `start-overlay`).
4. Apply a fixed settle delay after state assembly so meshing/textures settle.
5. Capture `page.screenshot()` (full viewport) or
   `page.locator(selector).screenshot()` (element-clipped).
6. Read the golden at `goldenPath(cell)`; compare via `comparePng` with the mode's
   options; append the report row. On failure, write the actual + diff PNG under
   `test-results/visual/<screen>/<quality>/<resolution>/`.
7. Close the context. `UPDATE_SNAPSHOTS=1` writes goldens instead of comparing.

## Detailed behavior

- **Golden lifecycle**: first matrix run (or after an intentional visual change) is
  done with `UPDATE_SNAPSHOTS=1` to seed/refresh goldens, then the update flag is
  removed and the matrix must pass against those goldens. Verify-mode runs never
  write goldens.
- **Report**: the spec collects one `VisualReportRow` per cell and asserts that every
  row is `pass` (or `updated` under the update flag). A failure names the cell and,
  for pixel-diff cells, the changed fraction vs. the 1% bound.
- **Stability of DOM overlays**: `element-clipped` screenshots crop to the UI
  element, excluding the WebGL canvas, so their exactness is robust to WebGL noise.
- **Resolution isolation**: both resolutions are 16:9, so only raster resolution
  changes; a mismatch in one resolution but not the other isolates DPI/scaling bugs.

## Failure modes

- Missing golden in verify mode → `missing-golden` row, matrix fails, expected path
  printed; no auto-seed.
- Dimension mismatch between actual and golden → `fail` with
  `reason: 'dimension-mismatch'`.
- Decode failure (corrupt/truncated PNG) → `fail` with `reason: 'decode-error'`.
- Threshold exceeded (pixel-diff) → `fail` with changed fraction.
- Any pixel difference (exact mode) → `fail`.
- World not ready / element missing within timeout → the spec errors for that cell
  (surfaced, not silently skipped).
- A golden that cannot be written (permission, path) → spec error, not a pass.

## Compatibility/migration

Additive test infrastructure. The only production-code touch is a VITE_E2E-only boot
hook (test build only), identical in gating to the existing `__voxelGame` hook; the
shipped bundle is unchanged. No schema, save-format, registry, or public API change.
Goldens are new files under `tests/visual-golden/`, git-committed as reviewable
fixtures and excluded from the shipped bundle.

## Performance/resource constraints

- Full matrix: 60 cells × (boot + world-ready + settle + capture). Software WebGL in
  headless is slow, so the matrix runs as a **dedicated e2e spec** (single worker,
  matching the existing `workers: 1`) and is not on the default fast path beyond the
  already-scheduled e2e run. A `SCREEN_FILTER` env var allows running a subset of
  screens for iteration; the normative full matrix must be able to run and pass.
- `goldenCompare` is O(w×h); it decodes only when bytes differ. No unbounded memory:
  each capture is processed and discarded per cell.
- Thresholds are small fixed constants; no per-run recomputation.

## Testing seams

- **VITE_E2E-only boot hook**: accept `{ renderDistance, fov, brightness }` at game
  construction (e.g. an optional Game option or a pre-boot global read under
  `import.meta.env.VITE_E2E === 'true'`). `renderDistance` feeds World/Environment
  creation so fog and streaming are fixed before capture; `fov` is applied to the
  camera; `brightness` sets a fixed daylight override. This is the minimal seam that
  makes the quality axis observable; the implementer reconciles it with 206's
  (currently non-runtime) settings wiring.
- **Deterministic-state hooks** (VITE_E2E-only, on `window.__voxelGame` or a
  dedicated test API): set fixed yaw/pitch; freeze day/night; normalize dynamic HUD
  text. These let the harness reach a reproducible pose/lighting/HUD before capture.
- **Pure modules** `matrix.ts` / `goldenCompare.ts` are unit-tested headlessly by
  `tests/unit/VisualMatrix.test.ts` and `tests/unit/GoldenCompare.test.ts`.

## Observability/debugging

- The e2e report lists every cell and status; failures carry the changed fraction
  and the expected golden path.
- On failure, actual and diff PNGs are written under
  `test-results/visual/<screen>/<quality>/<resolution>/` for visual inspection.
- `validateMatrix()` returns human-readable defect strings (duplicate cell ids, bad
  profile ranges, non-16:9 resolutions, missing selectors for element-clipped
  screens) for fast diagnosis.
- `SCREEN_FILTER` and `UPDATE_SNAPSHOTS` env vars are documented in the spec headers.

## Affected files/symbols

New files (test infrastructure, not shipped):
- `tests/visual/matrix.ts` — `SCREENS`, `QUALITY_PROFILES`, `RESOLUTIONS`, `allCells`,
  `goldenPath`, `validateMatrix`.
- `tests/visual/goldenCompare.ts` — `comparePng`, `writeDiffPng`, `CompareOptions`,
  `CompareResult`.
- `tests/e2e/visual-regression.spec.ts` — the matrix e2e spec.
- `tests/unit/VisualMatrix.test.ts`, `tests/unit/GoldenCompare.test.ts`.
- `tests/visual-golden/…` — committed golden PNGs.

Test-only production touch (VITE_E2E build only):
- `src/main.ts` and/or `src/engine/Game.ts` — the boot hook accepting the quality
  profile and the deterministic-state hooks. Shipped builds are unchanged.

Downstream consumers: none in production; the e2e suite consumes the harness; the
unit suite consumes the pure modules.

## Rejected alternatives

- **Exact hashing everywhere**: rejected — headless software WebGL produces
  run-to-run channel noise, so render/environment screens would be flaky. Exact
  comparison is used only where it is safe (element-clipped DOM overlays).
- **`toMatchSnapshot` / Playwright's built-in screenshot matcher**: rejected —
  Playwright stores its own snapshot artifacts and does not expose the thresholded
  per-channel diff and report format this matrix needs; a `pngjs`-based comparator
  keeps thresholds and storage explicit and unit-testable, with no new dependency.
- **Full settings wiring for the quality axis**: rejected — wiring 206's store into
  the runtime is change 206/208 scope. A minimal VITE_E2E-only boot seam delivers the
  observable axis without shipping a half-built settings system.
- **A single resolution**: rejected — the outcome explicitly calls for "resolutions";
  two fixed 16:9 sizes make the resolution axis meaningful and cheap.
- **Rendering a DOM inventory screen as a separate screen**: rejected — no standalone
  DOM inventory screen exists; `container-ui` captures the crafting/container panel,
  which is the DOM container UI the game presents.

## Downstream dependencies

- Change 244 (`244-worldgen-regression-matrix`) establishes the fixed-seed /
  golden-storage / update-mode conventions this change reuses; 245 must remain
  consistent with them.
- Change 246 (`246-input-accessibility-matrix`) and later hardening changes may reuse
  the deterministic-capture harness; 245's seams should not be shaped to preclude
  that, but 245 adds no behavior beyond its own scope.
- 206/208 own the general settings wiring; if they later make
  `renderDistance`/`fov`/`brightness` runtime-settable, 245's boot seam must be
  reconciled so both remain true.
