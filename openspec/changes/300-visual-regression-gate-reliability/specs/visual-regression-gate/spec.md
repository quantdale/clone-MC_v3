# Spec: visual-regression-gate

## Contract

The repository's visual-regression gate MUST be a trustworthy signal: it MUST
pass on the current product build, it MUST fail when a captured surface changes,
and it MUST NOT be chronically red for reasons unrelated to the product.

The committed golden baseline MUST reflect the current captured surfaces.
A golden set that predates a change to any captured surface MUST be detectable
before it silently causes failures. Comparison thresholds are evidence-based
policy and MUST NOT be relaxed as a substitute for stabilizing or re-pinning.

## Definitions

- **Golden set**: a committed directory of reference PNGs under
  `tests/visual-golden/<environment>/` compared against by the matrix.
- **Golden environment**: the resolved baseline directory key, e.g. `linux-ci`
  or `win32-local`.
- **Captured surface**: the DOM/CSS/renderer output the matrix screenshots —
  principally `index.html` HUD markup, `src/styles.css`, and the modules under
  `src/rendering/**` that produce the frame.
- **Cell**: one `(screen, quality, resolution)` triple; the matrix has 10 screens
  × 3 qualities × 2 resolutions = 60 cells.
- **HUD-bearing screens**: the screen families whose capture includes the `#hud`
  subtree with its chips visible (`hud`, `render-world`, `start-overlay`), as
  opposed to screens that force the HUD hidden (`render-world-no-hud`,
  `environment-day`, `environment-night`).
- **Noise floor**: the measured maximum changed-fraction that a fixed build
  produces across repeated captures of a cell under the CI rendering stack.

## Invariants

- A green matrix MUST mean the current build matches the committed baseline for
  every cell, at the committed thresholds.
- A golden set MUST NOT be older than the newest commit touching any captured
  surface, unless a reviewer explicitly acknowledged the specific commit.
- Comparison thresholds MUST NOT be increased to convert a systematic mismatch
  into a pass.
- The canonical CI baseline (`linux-ci`) is authoritative for the CI verdict.

## ADDED Requirements

### Requirement: The committed baseline matches the current build

The golden set resolved for the CI environment MUST contain captures of every
HUD-bearing surface that the current `index.html` renders, including any HUD
chip that is visible by default. In particular, an always-visible HUD control
introduced after the last re-pin MUST be present in the baseline.

#### Scenario: A newly added visible HUD chip requires a re-pin

- **GIVEN** the committed `linux-ci` golden set was pinned before a new
  always-visible element (no `hidden` class) was added inside `#hud`
- **WHEN** the matrix captures the `hud`, `render-world` and `start-overlay`
  cells in verify mode
- **THEN** those cells fail because the new chip changes the captured pixels
- **AND** the failure is reported as a baseline mismatch rather than being
  silently tolerated

#### Scenario: Re-pin makes the matrix green

- **GIVEN** the baseline was re-pinned through the canonical update path after
  the visible chip landed
- **WHEN** the matrix runs in verify mode at the committed thresholds
- **THEN** all 60 cells pass

### Requirement: Golden staleness is detected before a failing run

The repository MUST provide a check that compares the newest commit timestamp of
the committed golden set against the newest commit timestamp of any captured
surface, and MUST fail when the golden set is older than a captured-surface
change, unless a reviewer has explicitly acknowledged the exact newer commit.

The check MUST be runnable as a CI step before the browser gate and MUST name
the stale golden directory and the newest captured-surface commit in its failure
message.

#### Scenario: Stale goldens fail the check

- **GIVEN** the golden set predates a commit that modified `index.html`
- **WHEN** the staleness check runs
- **THEN** it exits non-zero
- **AND** its message names the golden directory and the newer captured-surface
  commit
- **AND** it names the canonical re-pin command

#### Scenario: Fresh goldens pass

- **GIVEN** the golden set is at least as new as every captured-surface commit
- **WHEN** the staleness check runs
- **THEN** it exits 0

#### Scenario: Explicit acknowledgement

- **GIVEN** a captured-surface commit is intentionally not reflected in the
  baseline (for example a commit that provably does not alter any captured
  surface)
- **WHEN** the check is given an acknowledgement value naming that exact commit
- **THEN** it exits 0 for that commit
- **AND** it still fails for any later unacknowledged captured-surface commit

### Requirement: The gate's failures are actionable

A cell MUST NOT fail for the same reason across the current baseline and the
unmodified baseline of the same source. The high-resolution software-rendering
column MUST either be made deterministic by capture-side changes, or be given an
explicitly documented bound justified by a recorded noise-floor measurement, so
that a persistent cell failure always indicates a product change.

#### Scenario: Deterministic high-resolution column

- **GIVEN** capture-side determinism changes have been applied to the
  high-resolution column
- **WHEN** the matrix runs three consecutive times on the same build
- **THEN** the pass/fail status of every cell in that column is identical across
  all three runs

#### Scenario: Documented bound for an irreducible column

- **GIVEN** an irreducible column whose noise floor is recorded
- **THEN** the bound applied to that column is documented with the measured
  noise-floor value and the measurement method
- **AND** a synthetic change exceeding the noise floor is still detected by a
  dedicated test of the comparison utility

### Requirement: One canonical baseline policy

The repository MUST document a single authoritative golden-environment policy
and MUST NOT require per-session manual re-baselining of a duplicated local set.
Any retained per-platform set MUST have a documented refresh trigger that is
enforced by the staleness check.

#### Scenario: Policy is documented

- **WHEN** the visual-golden provenance documentation is read
- **THEN** it names the authoritative baseline for CI
- **AND** it states, for every other retained baseline, how it is refreshed and
  who triggers it

#### Scenario: No per-session triage is required

- **GIVEN** a clean checkout at the tip of `main`
- **WHEN** a session runs the full browser gate with no product change
- **THEN** the visual matrix passes without any baseline re-pinning, manual cell
  classification, or "baseline-equivalent" exception being required

## Error and failure behavior

- A missing golden for a cell MUST fail that cell as `missing-golden`, not be
  skipped.
- A dimension mismatch MUST fail the cell with `dimension-mismatch` and MUST NOT
  be coerced into a pixel comparison.
- A malformed PNG MUST fail the cell with `decode-error` and MUST NOT be treated
  as a pass.
- The staleness check MUST exit non-zero when the golden directory is absent.
- The staleness check MUST NOT auto-re-pin; re-pinning is an explicit human
  action.

## Performance and resource bounds

- The staleness check MUST complete in under 5 seconds and MUST NOT read any PNG.
- The full 60-cell matrix runtime budget is unchanged from the current
  single-worker software-WebGL schedule.
- The number of committed PNGs MUST NOT grow beyond one golden set plus any
  explicitly justified platform set.

## Compatibility and migration

- Golden PNG content changes on re-pin; this is expected and reviewed as a
  golden re-pin, not a product change.
- No product save data, API, or runtime behaviour change.
- Any change to `resolveGoldenEnvironment` semantics MUST be documented in
  `tests/visual-golden/README.md`.

## Security and integrity

- A golden that is silently re-pinned to match a broken build would let a
  rendering regression ship. Re-pins MUST be reviewed commits, and the staleness
  check exists to ensure re-pins happen deliberately rather than as a side
  effect of a red run.

## Observability

- Each failing cell reports its changed fraction and a diff artifact path.
- The staleness check prints the golden directory, the golden commit, and the
  newest captured-surface commit.
- The matrix summary reports pass/fail/updated/missing counts per cell family so
  a reviewer can see which column moved.

## Verification mapping

| Requirement | Verification |
|---|---|
| Baseline matches current build | Verify-mode matrix run is 60/60 green at committed thresholds |
| Staleness detection | Run the check against a synthetic stale state (expected non-zero) and a fresh state (expected zero), plus the acknowledgement path |
| Actionable failures | Three consecutive same-build runs produce an identical per-cell status map; or a recorded noise-floor measurement justifies a documented bound with a tripwire unit test on the comparison utility |
| One canonical baseline policy | Read `tests/visual-golden/README.md`; a clean-checkout browser gate passes without manual re-baselining |
