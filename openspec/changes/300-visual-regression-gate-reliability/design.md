# Design: 300-visual-regression-gate-reliability

## Context/current state

The visual gate is a 60-cell Playwright matrix (`tests/e2e/visual-regression.spec.ts`
+ `tests/visual/matrix.ts` + `tests/visual/goldenCompare.ts`):

* 10 screens × 3 quality profiles (`low`, `default`, `high`) × 2 resolutions
  (`1280x720`, `1920x1080`) = 60 cells.
* Screens: `render-world`, `render-world-no-hud`, `hud`, `hotbar`, `crosshair`,
  `debug-overlay`, `start-overlay`, `container-ui`, `environment-day`,
  `environment-night`.
* Thresholds: `channelTolerance 24`, `maxChangedFraction 0.02` for both
  full-viewport and element-clipped cells.
* Golden environments: `linux-ci` (authoritative for CI) and `win32-local`
  (local Windows), 60 PNGs each.
* Capture conditions: fresh context per cell, `?seed=1337`, quality injected
  pre-boot via a `VITE_E2E`-only seam, fixed camera pose, frozen clock per
  screen, normalized dynamic HUD text, `SETTLE_MS = 750`, single worker.

### Problem 1 — the baseline is deterministically stale

```
$ git log -1 --format='%h %ad %s' --date=short -- tests/visual-golden/linux-ci
6af6c6c 2026-09-18 audit and harden changes 1 through 277

$ git log --format='%h %ad %s' --date=short -S 'trading-open' -- index.html
05203ab 2026-09-19 feat: ship live villager trading UI (change 278)

$ git log --format='%h %ad %s' --date=short -S 'shield-indicator' -- index.html
a9b7108 2026-09-19 feat: ship live shield wiring (change 279)

$ git log --format='%h %ad %s' --date=short -S 'raid-feedback' -- index.html
f0e022c 2026-09-23 feat: ship live raid feedback and verify change 282
```

`index.html` today (measured):

```
trading-open       class="hud-chip"          <-- visible, no `hidden`
statistics-open    class="hud-chip"          <-- visible
creative-open      class="hud-chip"          <-- visible
shield-indicator   class="hud-chip hidden"
raid-feedback      class="hidden"
```

The spec shows the HUD for `hud`, `render-world` and `start-overlay` and hides
it only for `render-world-no-hud` / `environment-day` / `environment-night`:

```ts
const hideHudFamily = ['render-world-no-hud', 'environment-day', 'environment-night'];
...
} else if (screenId === 'hud') { await show(page, '#hud'); }
```

So `#trading-open` — a visible chip introduced one day after the baseline was
pinned — appears in the only **2 of 10 screens that show `#hud`** (`render-world`, `hud`) × 3 qualities × 2 resolutions = **12
cells that cannot match the committed baseline**. This is arithmetic, not
rendering theory.

### Problem 2 — the `high/1920x1080` column is structurally unstable

From `openspec/changes/297-gunpowder-and-splash-brewing/verification.md`
(§"visual:176 SwiftShader drift"), across six runs:

| Run | fail / pass | band (failing) |
|---|---|---|
| 296 full (`998fef9`) | 30 / 30 | 0.0202–0.0619 |
| 296 isolated rerun | 29 / 31 | 0.0222–0.0619 |
| origin/main `218aabd` isolated | 31 / 29 | 0.0203–0.0619 |
| 297 full | 30 / 30 | 0.0215–0.0619 |
| 297 isolated rerun | 30 / 30 | 0.0222–0.0619 |
| origin/main `fdba42d` isolated | 30 / 30 | 0.0222–0.0708 |

Cell-by-cell conclusions recorded there:

* all 40 low/default cells **byte-identical**;
* all 10 `high/1280x720` cells status-stable;
* every status flip is a `high/1920x1080` cell.

`high` is the heaviest profile (`renderDistance 4`, `fov 90`,
`brightness 0.8`) and `1920x1080` is 4.5× the pixels of `1280x720`, so under
SwiftShader these captures render the slowest and the most timing-sensitive.
A 750 ms settle is not enough for the heaviest profile to reach a settled frame.

Note the band is `0.0202–0.0708` against a bound of `0.02`: the persistent
failures sit just above the bound, which means the bound is inside this
environment's noise floor for this column. A gate whose noise floor equals its
threshold is not a gate.

### Problem 3 — two baselines, no refresh trigger

`resolveGoldenEnvironment` resolves `linux-ci` on Linux and `<platform>-local`
elsewhere, so a Windows workstation compares against `win32-local`, pinned at
`94b0671` (2026-09-16) — even older than `linux-ci`. Nothing detects staleness,
so each session discovers ~30 failures and spends a dossier reconstructing why
they are "baseline-equivalent". Sixteen `verification.md` files carry that
narrative.

## Target state

1. `linux-ci` re-pinned so every cell matches the current build, at unchanged
   thresholds.
2. A staleness check that fails CI before a browser run when the baseline
   predates a captured-surface commit.
3. The `high/1920x1080` column either made deterministic by capture-side change,
   or explicitly bounded with a recorded noise-floor measurement plus a tripwire.
4. One authoritative baseline policy; the duplicated set is retired or has an
   enforced refresh trigger.

## Invariants

- Green means "current build matches committed baseline at committed thresholds".
- A re-pin is an explicit, reviewed action that must be justified against the
  reviewed list of UI changes since the previous pin.
- Thresholds are never raised to convert a systematic mismatch into a pass.
- The comparison utility keeps its documented semantics and stays pure.

## API and data model

```ts
// scripts/check-visual-goldens.mjs
// exit 0 fresh / acknowledged, 1 stale, 2 golden directory missing
type StaleRow = { goldenDir: string; goldenCommit: string; newerCommit: string; surfaces: string[] };

// tests/visual/matrix.ts gains an explicit, exported surface list so the
// staleness check and the capture harness cannot drift apart:
export const CAPTURED_SURFACE_GLOBS: readonly string[];  // index.html, src/styles.css, src/rendering/**
```

The staleness check computes, per golden directory:

```
goldenTs   = git log -1 --format=%ct -- tests/visual-golden/<env>
surfaceTs  = max over globs of git log -1 --format=%ct -- <glob>
newerSha   = git log -1 --format=%h --diff-filter=M <captured surfaces> --since=<goldenTs>
stale      = newerSha !== ''
```

Acknowledgement is an explicit environment value naming an exact commit
(`VISUAL_GOLDENS_ACKNOWLEDGED`); it is honoured only for that commit, so a later
unacknowledged change still fails.

### Capture-side determinism (candidate fix for Problem 2)

Ordered, cheapest-first:

1. **Frame-completion gate** — after the fixed pose, wait until the renderer has
   produced N consecutive frames whose whole-frame stats are within a small
   epsilon, instead of a fixed `SETTLE_MS`. Expose through the existing
   `getWholeFrameStats` observability surface rather than a new build-time hook.
2. **Profile-scaled settle** — scale settle with render cost, e.g.
   `SETTLE_MS * renderDistance * (width * height / 1280 / 720)`, bounded.
3. **Disable dynamic resolution during capture** — dynamic resolution changes the
   backing-store size per frame and is a prime candidate for pixel variance. The
   spec already has a `freezeDynamicResolution`-style seam used by other cells.
4. Only if 1–3 fail: bound the column with a measured noise floor.

Each step MUST be justified by a before/after status map over ≥3 runs.

## Control/data flow

```
re-pin path:
  UPDATE_SNAPSHOTS=1 → matrix captures 60 cells → writes tests/visual-golden/<env>/*.png
  → reviewed commit

verify path (CI + local):
  npm ci / dependency check (299)
  ├─ npm run validate-state, typecheck, lint, build, test
  ├─ node scripts/check-visual-goldens.mjs        <-- NEW staleness step
  │     └─ stale → exit 1 naming golden dir + newer captured-surface commit
  └─ npm run test:e2e
        └─ per cell: capture → comparePng(actual, golden, {24, 0.02})
              pass | fail(changedFraction) | missing-golden | dimension-mismatch
```

## Detailed behavior

### Staleness check

```
$ node scripts/check-visual-goldens.mjs
Visual goldens are stale:
  tests/visual-golden/linux-ci  pinned 6af6c6c (2026-09-18)
  newer captured-surface commit: 05203ab (2026-09-19) index.html
Re-pin: UPDATE_SNAPSHOTS=1 npm run test:e2e
```

The check runs against every committed golden environment, not just `linux-ci`,
so a stale local set is also surfaced.

## Failure modes

| Failure | Behaviour |
|---|---|
| Golden directory absent | exit 2, message names the missing directory |
| Golden PNG missing for a cell | that cell is `missing-golden`, a failure; never skipped |
| Dimension mismatch | `dimension-mismatch`; never coerced to a pixel comparison |
| Malformed PNG | `decode-error`; never a pass |
| Acknowledgement for a different commit | ignored; the real newer commit still fails |
| Staleness check auto-re-pins | forbidden — re-pinning is a human action |

## Compatibility/migration

- Golden PNG content changes on re-pin; the commit is reviewed as such.
- If `win32-local` is retired, `resolveGoldenEnvironment` resolves Windows to the
  authoritative set and `tests/visual-golden/README.md` states the consequence:
  a local Windows run approximates CI rendering rather than matching a
  Windows-specific baseline.
- No product code, save data, or API change.

## Performance/resource constraints

- The staleness check is `git`-only, reads no PNG, and completes in seconds.
- Capture-side changes must not increase the matrix's wall-clock beyond the
  existing single-worker software-WebGL schedule without an explicit budget
  note.
- Committed PNG count must not grow beyond one authoritative set plus any
  explicitly justified platform set.

## Testing seams

* Pure unit tests for the staleness decision function, fed synthetic
  `{goldenCommit, newerCommit, acknowledged}` tuples — no `git` required.
* Existing `tests/visual/` unit coverage for `comparePng` and the matrix
  enumeration remains the regression net for the comparison contract; a
  synthetic over-threshold image MUST still fail (the tripwire that keeps a
  widened bound honest).
* A throwaway-worktree experiment measures the noise floor before any bound is
  considered.

## Observability

- Per-cell status map printed at the end of the matrix run, grouped by column
  (quality × resolution), so an unstable column is visible without reading 60
  rows.
- The staleness check prints golden dir, golden commit, newer commit, and the
  re-pin command.
- A candidate noise-floor measurement is written to the change's
  `verification.md` with method and raw fractions.

## Affected files/symbols

**Modified**
- `tests/visual-golden/linux-ci/*.png` (re-pin)
- `tests/visual-golden/README.md` (policy)
- `tests/e2e/visual-regression.spec.ts` (staleness step / determinism changes)
- `tests/visual/matrix.ts` (exported captured-surface list; environment policy)
- `.github/workflows/ci.yml` (add staleness step)
- `tests/visual/goldenCompare.ts` (only if a bound is adopted, with evidence)

**New**
- `scripts/check-visual-goldens.mjs`
- `tests/unit/VisualGoldenStaleness.test.ts`

**Possibly deleted**
- `tests/visual-golden/win32-local/` (if retired)

**Explicitly not modified**
- anything under `src/`
- `maxChangedFraction` / `channelTolerance` values (any change requires
  independent recorded evidence and is out of scope)

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Raise `maxChangedFraction` to ~0.07 so the current cells pass | This converts a known baseline mismatch into a green gate and would mask a genuine rendering regression of the same magnitude. Explicitly rejected; thresholds are not a substitute for re-pinning. |
| Delete the `high/1920x1080` column | Loses the only high-resolution coverage. Prefer capture-side determinism; a documented bound is the fallback. |
| Mark the visual spec as non-blocking in CI | Removes the gate rather than fixing it. The matrix already caught the change-278 HUD addition; weakening it discards real signal. |
| Re-pin every session before running the matrix | That is what makes the gate meaningless — a re-pinned baseline always passes. Re-pins must be reviewed, deliberate commits. |
| Keep `win32-local` and hand-maintain both sets | Already demonstrated to drift; the per-session triage cost is the symptom this change removes. |
| Generate goldens at test time (self-fulfilling) | A baseline generated by the run it validates detects nothing. |

## Downstream dependencies

- 298 and 299 are recommended predecessors: a re-pin must be produced and
  verified under a green, matched toolchain.
- 301 (gate wiring) may place the staleness step in CI; coordinate so the CI
  workflow is not edited by two changes without ordering.
