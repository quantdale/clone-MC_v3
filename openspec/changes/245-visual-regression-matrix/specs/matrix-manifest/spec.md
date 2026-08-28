# Spec: matrix-manifest

## Contract

`matrix.ts` is the single source of truth for the visual-regression matrix: the
enumerated screen list (with family, capture mode, and element selector), the
quality-setting axis (three named profiles), the resolution axis (two viewports),
the derived 60-cell enumeration, the golden storage layout, and a validation
function. It is pure and headless-safe. The capture harness and the comparison
utility read their configuration exclusively from this manifest.

## Definitions

- **Screen**: `{ id, family, mode, selector?, normalize? }`. Family is one of
  `render`, `hud`, `inventory`, `environment`. Mode is `full-viewport` or
  `element-clipped`.
- **Quality profile**: `{ id, renderDistance, fov, brightness }` with `id` one of
  `low`, `default`, `high`.
- **Resolution**: `{ id, width, height }` with `id` one of `1280x720`, `1920x1080`.
- **Cell**: `{ screen, quality, resolution }`, a string tuple drawn from the manifest.
- **Golden path**: `tests/visual-golden/<environment>/<screen>/<quality>/<resolution>.png`
  (2026-08-23 amendment, below; originally environment-free).

## Invariants

- The screen ids, quality-profile ids, and resolution ids are each unique within
  their collection.
- Every `element-clipped` screen has a non-empty `selector`.
- Both resolutions are 16:9 (aspect ratio `width / height === 16 / 9`).
- Each quality profile's `renderDistance` is an integer in `[2, 32]`, `fov` an
  integer in `[30, 110]`, and `brightness` a finite number in `[0, 1]`.
- `allCells()` returns exactly `screens × qualities × resolutions` cells, and
  `goldenPath(cell)` is a pure, stable function of the cell.
- `validateMatrix()` returns an empty array exactly when the manifest satisfies every
  invariant above.

## Requirements

### Requirement: screen list
`SCREENS` MUST contain exactly the 10 documented screens, each with a family, a
capture mode, and a `selector` when `element-clipped`. The render and environment
families MUST use `full-viewport`; the hud and inventory families MUST use
`element-clipped`.

#### Scenario: render screens
- **GIVEN** `SCREENS`
- **THEN** `render-world` and `render-world-no-hud` exist, both have family `render`
  and mode `full-viewport`.

#### Scenario: hud screens
- **GIVEN** `SCREENS`
- **THEN** `hud`, `hotbar`, `crosshair`, `debug-overlay`, and `start-overlay` exist,
  all have family `hud` and mode `element-clipped`, and each has a non-empty
  `selector`.

#### Scenario: inventory screen
- **GIVEN** `SCREENS`
- **THEN** `container-ui` exists, has family `inventory` and mode `element-clipped`,
  and has a non-empty `selector`.

#### Scenario: environment screens
- **GIVEN** `SCREENS`
- **THEN** `environment-day` and `environment-night` exist, both have family
  `environment` and mode `full-viewport`.

#### Scenario: screen id uniqueness
- **GIVEN** `SCREENS`
- **THEN** every screen `id` is unique.

### Requirement: quality profile axis
`QUALITY_PROFILES` MUST contain exactly the `low`, `default`, and `high` profiles with
the documented `{ renderDistance, fov, brightness }` values and id uniqueness.

#### Scenario: profile values
- **GIVEN** `QUALITY_PROFILES`
- **THEN** `low` is `{ renderDistance: 2, fov: 70, brightness: 0.3 }`, `default` is
  `{ renderDistance: 2, fov: 75, brightness: 0.5 }`, and `high` is
  `{ renderDistance: 4, fov: 90, brightness: 0.8 }`.

#### Scenario: profile id uniqueness
- **GIVEN** `QUALITY_PROFILES`
- **THEN** every profile `id` is unique.

### Requirement: resolution axis
`RESOLUTIONS` MUST contain exactly `1280x720` and `1920x1080`, each with `width` and
`height` set and a 16:9 aspect ratio.

#### Scenario: resolution values
- **GIVEN** `RESOLUTIONS`
- **THEN** `1280x720` has width 1280 and height 720, and `1920x1080` has width 1920
  and height 1080, and both satisfy `width / height === 16 / 9`.

### Requirement: cell enumeration and golden paths
`allCells()` MUST return exactly `10 × 3 × 2 = 60` cells, one for each combination of
screen, quality, and resolution; `goldenPath(cell)` MUST return the deterministic
path `tests/visual-golden/<environment>/<screen>/<quality>/<resolution>.png` for any
cell drawn from `allCells()`, where `<environment>` is the resolved golden
environment key.

#### Scenario: full cross-product
- **GIVEN** `allCells()`
- **THEN** it has 60 entries, and for every screen, quality, and resolution there is
  exactly one entry.

#### Scenario: golden path derivation
- **GIVEN** the cell `(render-world, high, 1920x1080)` and golden environment `win32-local`
- **THEN** `goldenPath(cell)` is
  `tests/visual-golden/win32-local/render-world/high/1920x1080.png`.

### Requirement: golden environment resolution (2026-08-23 amendment)
The golden environment key MUST be a single validated filesystem-safe path segment.
A non-empty `VISUAL_GOLDEN_ENV` override MUST win verbatim; otherwise the key MUST be
`<platform>-ci` when the CI marker is set and `<platform>-local` otherwise. An invalid
key MUST throw naming the value rather than silently redirecting captures to an
unintended baseline directory. Rationale: captured pixels are renderer- and
font-environment dependent, so each verification environment compares against a
baseline pinned in that same environment; thresholds, cell count, and update-mode
semantics are unchanged. Discovered during post-250 hardening Gate F (canonical CI),
recorded in `openspec/hardening/2026-08-21-post-250-production-persistence-hardening/`.

#### Scenario: derived keys
- **GIVEN** platform `linux` with the CI marker set / unset
- **THEN** the resolved key is `linux-ci` / `linux-local`.

#### Scenario: explicit override
- **GIVEN** `VISUAL_GOLDEN_ENV=win32-local`
- **THEN** that exact key wins regardless of platform or CI marker.

#### Scenario: invalid override rejected
- **GIVEN** `VISUAL_GOLDEN_ENV=../escape`
- **WHEN** the key resolves
- **THEN** it throws naming the invalid key.

### Requirement: manifest validation
`validateMatrix()` MUST return an empty array for the valid manifest and a non-empty
array of human-readable defect strings when any invariant is violated (duplicate
ids, missing selector for an `element-clipped` screen, non-16:9 resolution, or a
quality profile value outside its documented range).

#### Scenario: valid manifest
- **GIVEN** the shipped manifest
- **WHEN** `validateMatrix()` runs
- **THEN** it returns `[]`.

#### Scenario: invalid manifest detected
- **GIVEN** a manifest variant where a resolution is `1000x1000` (aspect 1:1)
- **WHEN** `validateMatrix()` runs
- **THEN** it returns a non-empty array naming the offending resolution.

## Error and failure behavior

- `validateMatrix()` never throws; it reports defects as strings.
- `goldenPath` and `allCells` are total for the manifest; callers treat out-of-domain
  inputs as programming errors surfaced by validation, not by the accessors.

## Performance and resource bounds

- `allCells()` is computed from constants and is O(screens × qualities ×
  resolutions); `validateMatrix()` is O(screens + qualities + resolutions).
- No allocation beyond the returned arrays/strings.

## Compatibility and migration

- Additive: a new pure test-support module; no shipped module changes.
- Golden layout and the env vars consumed by the harness (`UPDATE_SNAPSHOTS`,
  `SCREEN_FILTER`) are documented here and in the `capture-harness` spec.

## Security and integrity

- Pure constants and functions; no I/O, no global state, no mutation of inputs.

## Observability

- `validateMatrix()` gives implementers and CI a direct, readable verdict on the
  manifest's integrity before any capture runs.

## Verification mapping

| Requirement | Test / command |
|---|---|
| Screen list | `tests/unit/VisualMatrix.test.ts` › screens |
| Quality profile axis | › quality profiles |
| Resolution axis | › resolutions |
| Cell enumeration and golden paths | › cells and golden paths |
| Golden environment resolution (2026-08-23 amendment) | › golden environments |
| Manifest validation | › validation |
