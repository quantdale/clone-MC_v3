# Verification: 300-visual-regression-gate-reliability

Status: NOT VERIFIED
Completion: 0% (T1–T3 are pre-implementation evidence only; T4–T17 are open)
Advancement allowed: false

Authored by an audit campaign that is **forbidden from implementing code**. T1–T3
record the measured baseline the implementing agent must reproduce. No passing
evidence is pre-filled.

## Pre-implementation evidence captured at base `2ecf781`

### E1 — The committed baseline predates three HUD changes

```
$ git log -1 --format='%h %ad %s' --date=short -- tests/visual-golden/linux-ci
6af6c6c 2026-09-18 audit and harden changes 1 through 277

$ git log -1 --format='%h %ad %s' --date=short -- tests/visual-golden/win32-local
94b0671 2026-09-16 harden release readiness after live integrations

$ git log --format='%h %ad %s' --date=short -S 'trading-open'    -- index.html
05203ab 2026-09-19 feat: ship live villager trading UI (change 278)
a9b7108 2026-09-19 feat: ship live shield wiring (change 279)     # shield-indicator
f0e022c 2026-09-23 feat: ship live raid feedback and verify change 282   # raid-feedback
```

### E2 — The change-278 chip is visible by default

Measured from `index.html` at `2ecf781`:

| Element | `class` attribute | Visible in a HUD capture |
|---|---|---|
| `trading-open` | `hud-chip` | **yes** |
| `statistics-open` | `hud-chip` | yes |
| `creative-open` | `hud-chip` | yes |
| `shield-indicator` | `hud-chip hidden` | no |
| `raid-feedback` | `hidden` | no |

`tests/e2e/visual-regression.spec.ts` shows `#hud` for the `hud`,
`render-world` and `start-overlay` screens and hides it only for
`render-world-no-hud` / `environment-day` / `environment-night`:

```
const hideHudFamily = ['render-world-no-hud', 'environment-day', 'environment-night'];
```

Therefore the visible `#trading-open` chip is present in **3 screen families × 3
qualities × 2 resolutions = 18 cells** whose committed golden predates it. Those
cells cannot match the current build.

### E3 — The `high/1920x1080` column is structurally unstable

From `openspec/changes/297-gunpowder-and-splash-brewing/verification.md`,
§"visual:176 SwiftShader drift":

| Run | fail / pass | band (failing) |
|---|---|---|
| 296 full (`998fef9`) | 30 / 30 | 0.0202–0.0619 |
| 296 isolated rerun | 29 / 31 | 0.0222–0.0619 |
| origin/main `218aabd` isolated rerun | 31 / 29 | 0.0203–0.0619 |
| 297 full run | 30 / 30 | 0.0215–0.0619 |
| 297 isolated visual rerun | 30 / 30 | 0.0222–0.0619 |
| origin/main `fdba42d` isolated rerun | 30 / 30 | 0.0222–0.0708 |

Recorded cell-by-cell conclusions from the same dossier:

* all 40 low/default cells **byte-identical**;
* all 10 `high/1280x720` cells status-stable;
* every status flip and every persistent failure is a `high/1920x1080` cell
  (`container-ui`, `crosshair`, `environment-day`, `render-world-no-hud`,
  `start-overlay`).

Committed thresholds: `channelTolerance 24`, `maxChangedFraction 0.02` for both
capture modes. The measured band `0.0202–0.0708` sits at and above the bound, so
the environment's noise floor for this column is at or beyond the gate's own
threshold.

### E4 — The cost is re-paid every session

`grep -rln 'visual:176|SwiftShader.*drift|drift band' openspec/changes/*/verification.md`
matches **16** verification files. The most recent full-suite result of record is
`npm run test:e2e` = **136 passed / 1 failed of 137**, the single failure being
the visual matrix (per the 297 verification dossier).

### E5 — No staleness detection exists

There is no script, npm script, or CI step that compares a golden set's commit
age against the captured surfaces. `grep -rn 'check-visual-goldens' .` returns
nothing; `scripts/` contains `validate-file-audit`, `gen-file-audit`,
`audit-inventory`, `orphan-check`, `build-evidence-archive`,
`check-release-bundle`, `verify-mcp-addons`, and the perf/worldgen helpers — none
of which touch the goldens.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Baseline matches the current build | E1/E2 prove 18 HUD-bearing cells cannot match. T4/T11/T12 unimplemented. | NOT VERIFIED |
| Golden staleness is detected | E5 shows no such check exists. T5/T6/T7 unimplemented. | NOT VERIFIED |
| Failures are actionable | E3 shows ~50% of the matrix is permanently red with the bound inside the noise floor. T8/T9/T10/T12 unimplemented. | NOT VERIFIED |
| One canonical baseline policy | E1 shows two sets (`linux-ci` pinned 09-18, `win32-local` pinned 09-16) with no enforced refresh. T13 unimplemented. | NOT VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `git log -1 -- tests/visual-golden/linux-ci` | `6af6c6c` 2026-09-18 | E1 |
| `git log -1 -- tests/visual-golden/win32-local` | `94b0671` 2026-09-16 | E1 |
| `git log -S 'trading-open' -- index.html` | `05203ab` 2026-09-19 | E1 |
| element `class` probe over `index.html` | `trading-open` visible | E2 |
| `npm run test:e2e` | **NOT RUN in this audit session** (~33.5 min suite) | Last recorded result: 136/137, the one failure being the visual matrix (E4) |
| `npm run typecheck` / `lint` / `validate-state` / `validate-file-audit` | PASS | see change 298 verification E1 |
| `npm test` | FAIL (2 unit tests) | see change 298; unrelated to the visual gate |

`npm run test:e2e` was deliberately not executed in this audit session: it takes
~33.5 minutes, requires a production build plus a preview server, and its result
is already documented across six runs in the 297 dossier (E3). The implementing
agent MUST run it.

## Edge/adversarial validation (required at T5/T6/T8/T10)

- [ ] Staleness check: fresh → exit 0.
- [ ] Staleness check: stale → exit 1, naming golden dir, golden commit, newer
      captured-surface commit, and the re-pin command.
- [ ] Staleness check: stale but acknowledged for that exact commit → exit 0.
- [ ] Staleness check: acknowledged for a *different* commit → still exit 1.
- [ ] Staleness check: golden directory missing → exit 2.
- [ ] Staleness check reads no PNG and completes in seconds.
- [ ] Matrix: missing golden for a cell → `missing-golden` failure, never skipped.
- [ ] Matrix: dimension mismatch → `dimension-mismatch`, never coerced.
- [ ] Matrix: malformed PNG → `decode-error`, never a pass.
- [ ] Three consecutive same-build runs produce an identical per-cell status map.
- [ ] If a bound is adopted, a synthetic over-bound image still fails
      `comparePng` (the tripwire).
- [ ] No committed PNG churn other than the reviewed re-pin.
- [ ] No threshold value changed (`channelTolerance 24`, `maxChangedFraction 0.02`)
      unless T10's recorded evidence justifies it.

## Migration/compatibility validation

- [ ] The HUD-surface delta between `6af6c6c` and the candidate is fully explained
      by reviewed changes 278/279/282 (no unexplained drift hidden by the re-pin).
- [ ] `tests/visual-golden/README.md` names the authoritative baseline and the
      re-pin trigger.
- [ ] `resolveGoldenEnvironment` semantics (if changed) are documented.
- [ ] Product save data, API, and runtime behaviour untouched (no `src/` change).

## Performance/resource validation

- [ ] Staleness check completes in under 5 s and reads no PNG.
- [ ] Matrix wall-clock does not regress beyond the existing single-worker
      software-WebGL schedule without an explicit budget note.
- [ ] Committed PNG count does not grow beyond one authoritative set plus any
      justified platform set.

## Regressions

- None introduced by design: the change touches tests, goldens, a new script, and
  one CI step. No `src/` file is modified.
- Note for the reviewer: a re-pin legitimately changes many PNGs. That commit MUST
  be reviewed as a golden re-pin and MUST NOT be conflated with product changes.
- Related open items: 298 (local gate red), 299 (toolchain drift), 301
  (un-wired gate scripts), 302 (never-executed canonical load test).

## Incomplete tasks

T4–T17 (14 of 17 tasks). Completion **0%** by checkbox count.

## Advancement Exception

Not applicable: completion is below 90%; advancement is forbidden.

## Final decision

**NOT VERIFIED.** The visual gate is not a trustworthy signal at base `2ecf781`:
18 HUD-bearing golden cells predate the always-visible `#trading-open` chip added
by Change 278; the `high/1920x1080` column fails run-to-run with a noise band
(0.0202–0.0708) at or above the 0.02 bound; and sixteen verification dossiers
record the same tolerated drift rather than a fix. T4–T17 must be implemented and
the matrix must be **fully green three consecutive times at unchanged thresholds**
before this change may be marked VERIFIED. A result that still reports tolerated
visual failures does not satisfy this change.
