# Spec: capture-harness

## Contract

The capture harness runs headless Chromium and, for every matrix cell
`(screen, quality, resolution)`, produces a deterministic screenshot that is
compared against a stored golden. It is the only capability that touches a browser.
It MUST reuse the existing `VITE_E2E` build hook (`window.__voxelGame`, port 4173,
single worker) and MUST assemble each cell's state so that identical cells on the
same headless engine reproduce identical pixels. It MUST never auto-write goldens
except under the explicit `UPDATE_SNAPSHOTS=1` opt-in.

## Definitions

- **Cell**: a tuple `(screen, quality, resolution)` drawn from the matrix manifest
  (see `matrix-manifest` spec). `60` cells total.
- **Capture mode**: `full-viewport` (`page.screenshot()`) or `element-clipped`
  (`page.locator(selector).screenshot()`), taken from the screen's definition.
- **Golden path**: `tests/visual-golden/<screen>/<quality>/<resolution>.png`,
  derived by `goldenPath(cell)`.
- **Verify mode**: the default; the harness reads the golden and compares. It never
  writes goldens.
- **Update mode**: active only when the environment variable `UPDATE_SNAPSHOTS` is
  `"1"`; the harness writes the golden instead of comparing.
- **Screen filter**: an optional environment variable `SCREEN_FILTER` listing screen
  ids (comma-separated) to run; when absent, every screen runs.

## Invariants

- Determinism: every capture uses a fresh browser context with `localStorage`
  cleared, the fixed seed, the fixed viewport, the fixed camera pose, a frozen
  day/night clock, and normalized dynamic HUD text, so a cell is reproducible.
- The capture state is assembled before the settle delay and never mutated mid-settle.
- Verify mode never writes goldens; update mode never compares.
- A missing golden in verify mode is a `missing-golden` result and fails the cell —
  it is never treated as a pass.
- Each cell runs and reports independently; one failing cell must not prevent the
  remaining cells from running and being reported.

## Requirements

### Requirement: per-cell deterministic capture
The harness MUST, for each cell, navigate to `/?seed=1337` at the cell's resolution,
wait for the world to be ready (`#loading` hidden), apply the cell's quality profile
and the screen's UI state, freeze day/night, normalize dynamic HUD text, apply a
fixed settle delay, and capture by the screen's capture mode.

#### Scenario: render world at default quality
- **GIVEN** the cell `(render-world, default, 1280x720)`
- **WHEN** the harness captures it
- **THEN** the viewport is 1280×720, the seed is fixed, `#loading` is hidden before
  capture, HUD/hotbar/crosshair are visible, and the capture is a full-viewport
  screenshot written to `tests/visual-golden/render-world/default/1280x720.png` in
  update mode or compared against it in verify mode.

#### Scenario: element-clipped capture
- **GIVEN** the cell `(hotbar, default, 1280x720)` whose screen is `element-clipped`
- **WHEN** the harness captures it
- **THEN** it captures only the `#hotbar` element's bounding box, not the full page.

#### Scenario: seed and viewport isolation
- **GIVEN** two runs of the same cell
- **WHEN** both complete in verify mode against a committed golden
- **THEN** both produce the same pass/fail outcome for that cell on the same headless
  engine.

### Requirement: deterministic state assembly
Before capture the harness MUST set a fixed camera pose (fixed yaw/pitch, no
movement, no bob), freeze the day/night clock, and normalize every dynamic DOM text
element (`#fps-counter`, `#world-time`, and the debug overlay stats) to fixed
constants.

#### Scenario: frozen lighting
- **GIVEN** the cell `(environment-day, default, 1280x720)`
- **WHEN** the harness captures it and the harness does not simulate movement
- **THEN** the day/night clock does not advance during the settle delay and the
  captured sky matches the frozen `environment-day` daylight state.

#### Scenario: normalized dynamic text
- **GIVEN** the cell `(hud, default, 1280x720)`
- **WHEN** the harness normalizes `#fps-counter` and `#world-time` to fixed strings
  and captures
- **THEN** the captured HUD text is identical on repeated captures regardless of the
  actual FPS or wall-clock time.

#### Scenario: fresh session
- **GIVEN** a prior browser session wrote `localStorage` under
  `voxel-game-state-v1:<seed>` and `voxel-game-edits-v1:<seed>`
- **WHEN** the harness creates a new context and captures a cell
- **THEN** the saved state is absent, so the world and inventory start from the
  deterministic seed baseline rather than the previous session's edits.

### Requirement: golden lifecycle
The harness MUST, in verify mode, read the golden at `goldenPath(cell)`, report a
`missing-golden` result when it is absent (failing the cell), and, in update mode
(`UPDATE_SNAPSHOTS=1`), write the capture to the golden path and report it as
`updated` without comparing.

#### Scenario: missing golden fails in verify mode
- **GIVEN** a cell whose golden file does not exist and `UPDATE_SNAPSHOTS` is not `1`
- **WHEN** the harness runs in verify mode
- **THEN** the cell's report row has status `missing-golden`, the matrix is not green,
  and the expected golden path is included in the report.

#### Scenario: update mode seeds goldens
- **GIVEN** `UPDATE_SNAPSHOTS=1`
- **WHEN** the harness captures a cell with no existing golden
- **THEN** it writes the golden PNG at `goldenPath(cell)` and reports status `updated`,
  and it does not compare.

#### Scenario: update mode refreshes existing goldens
- **GIVEN** `UPDATE_SNAPSHOTS=1` and an existing golden at `goldenPath(cell)`
- **WHEN** the harness captures the cell
- **THEN** it overwrites the golden with the new capture and reports status `updated`.

### Requirement: screen filter and full-matrix runs
The harness MUST run the full 60-cell matrix when `SCREEN_FILTER` is unset, and run
only the listed screens when it is set (all qualities × all resolutions for those
screens). It MUST be able to run the full matrix and pass.

#### Scenario: full matrix runs
- **GIVEN** no `SCREEN_FILTER`
- **WHEN** the matrix spec runs
- **THEN** it executes all 60 cells and asserts that every row is `pass` (or
  `updated` under `UPDATE_SNAPSHOTS=1`).

#### Scenario: screen filter narrows the run
- **GIVEN** `SCREEN_FILTER=hud,hotbar`
- **WHEN** the matrix spec runs
- **THEN** only the `hud` and `hotbar` screens execute, each across all 3 qualities
  and both resolutions, and no other screen runs.

### Requirement: failure reporting
The harness MUST record one report row per executed cell and MUST surface every
failure (comparison fail, missing golden, element/timeout error) without halting the
remaining cells, and the spec MUST fail if any executed row is not `pass` (or
`updated` under `UPDATE_SNAPSHOTS=1`).

#### Scenario: single failing cell reported, others run
- **GIVEN** one cell whose golden mismatches and several cells whose goldens match
- **WHEN** the matrix spec runs
- **THEN** the mismatching cell's row is `fail` with its changed fraction, every other
  executed cell's row is `pass`, all rows are recorded, and the spec result is failed.

#### Scenario: persistent failure artifacts
- **GIVEN** a `fail` or `decode-error` result for a cell
- **WHEN** the harness records the failure
- **THEN** it writes the actual and (when available) a diff PNG under
  `test-results/visual/<screen>/<quality>/<resolution>/` and includes those paths in
  the report.

## Error and failure behavior

- Missing golden in verify mode → `missing-golden`, a cell failure.
- Golden write failure (missing directory, permissions) in update mode → the cell
  errors and is surfaced, never silently skipped.
- `#loading` never reaching `hidden`, or a required element (`selector`) not found
  within the timeout → the cell errors with a descriptive message.
- A comparison failure never throws; it is recorded as a report row so sibling cells
  continue.

## Performance and resource bounds

- One browser context per cell, opened and closed within the cell; a bounded settle
  delay (fixed constant) after state assembly.
- Captures are processed per cell and released; no cell accumulates unbounded memory.
- The full matrix uses a single Playwright worker (matching `playwright.config.ts`),
  so it is serial by design and should not be parallelized.
- `SCREEN_FILTER` provides a bounded iteration path without weakening the normative
  full-matrix requirement.

## Compatibility and migration

- Additive: a new e2e spec plus test-support modules; the shipped bundle is
  unchanged except the VITE_E2E-only boot hooks (see `matrix-manifest`/design).
- Golden storage and the `UPDATE_SNAPSHOTS`/`SCREEN_FILTER` env vars are new and
  documented in this spec and the design.

## Security and integrity

- The harness touches only the local dev server (`http://localhost:4173`), the local
  filesystem (`tests/visual-golden/`, `test-results/`), and the `?seed=` URL override;
  it introduces no external network access and no privileged filesystem operations.
- Golden writes occur only under the explicit `UPDATE_SNAPSHOTS=1` opt-in.

## Observability

- The report lists every executed cell with its status and, for failures, the changed
  fraction, expected golden path, and artifact paths under `test-results/`.
- The `UPDATE_SNAPSHOTS` and `SCREEN_FILTER` env vars are documented in the spec
  header comments.

## Verification mapping

| Requirement | Test / command |
|---|---|
| Per-cell deterministic capture | `tests/e2e/visual-regression.spec.ts` renders each cell's golden; `tests/unit/GoldenCompare.test.ts` covers the compare side |
| Deterministic state assembly | `tests/e2e/visual-regression.spec.ts` repeated-capture determinism checks |
| Golden lifecycle | e2e matrix in verify vs `UPDATE_SNAPSHOTS=1` mode |
| Screen filter and full-matrix runs | e2e matrix with and without `SCREEN_FILTER` |
| Failure reporting | e2e matrix with an injected-mismatch golden; report assertions |
