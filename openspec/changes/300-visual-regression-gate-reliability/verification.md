# Verification: 300-visual-regression-gate-reliability

Status: VERIFIED
Completion: 100% (17/17 tasks)
Advancement allowed: true
Session start head: `ad3de555e6bbad14680a4e521c8319aed8d21c98` (origin/main)
Published head: recorded in `openspec/PROGRAM_STATE.json` after publication

## Summary

The visual-regression gate now has an enforced staleness check, a single
declared captured-surface contract, and one honest, documented noise bound for
the only cell whose software-WebGL noise reaches the comparison threshold. Two
parts of the audit-authored premise were **re-measured and did not reproduce**:
the matrix is not chronically ~50% red, and the committed `linux-ci` baseline
already matches the current build. That correction is recorded here rather than
being "verified" by re-pinning goldens that were already correct.

The change is tooling + test + documentation only: no product code, no rendering
change, and **no golden PNG was re-pinned**.

## T1/T2/T3 — Recorded baseline evidence

| Probe | At audit base `2ecf781` | Re-measured here (`ad3de55`) |
|---|---|---|
| `tests/visual-golden/linux-ci` pin | `6af6c6c`, 2026-09-18 | unchanged |
| `tests/visual-golden/win32-local` pin | `94b0671`, 2026-09-16 | unchanged |
| `#trading-open` (change 278) | `05203ab`, 2026-09-19, `class="hud-chip"`, no `hidden` | confirmed present, still inside `#hud` |
| `#shield-indicator` (279) / `#raid-feedback` (282) | added with `hidden` | confirmed — both carry `class="hud-chip hidden"` |
| HUD-surface delta explained by reviewed changes | 278/279/282 | confirmed; additionally change 297 touched `src/rendering/TextureAtlas.ts` |

Three independent runs are needed to say anything about this matrix, so the
following were measured directly rather than inherited from a dossier.

## T8 — The `high/1920x1080` noise floor, measured before touching anything

Method: five consecutive captures of `render-world/high/1920x1080` on an
unmodified build of this commit, each compared against the same committed
baseline with the shipped thresholds (`channelTolerance 24`,
`maxChangedFraction 0.02`), re-measuring `comparePng` output after every capture.

| Run | changedFraction |
|---|---|
| 1 | 0 (exact) |
| 2 | 0 (exact) |
| 3 | 0 (exact) |
| 4 | 0 (exact) |
| 5 | **0.020100308641975307** (41680 px) |

**Noise floor: 0.0201**, i.e. the worst case sits *exactly at* the 0.02 bound and
occasionally crosses it by one part in a thousand. One of five runs flipped.

> Correction of an earlier reading in this session: an initial measurement printed
> `0.0404` for this cell. That figure was produced by comparing a **Windows**
> capture against the **`linux-ci`** golden — a cross-environment comparison that
> is never a valid measurement, because pixel output is renderer/font-stack
> dependent (the reason the sets are environment-scoped at all). The correct
> same-environment measurement is 0.0201 above.

## T9 — Capture-side determinism attempts

| Attempt | Result |
|---|---|
| Dynamic resolution freeze | **Already present** — `assembleState` calls `testFreezeDynamicResolution()` for every cell, so this avenue was exhausted before this change. |
| Frame-completion settle instead of the 750 ms fixed wait | Not adopted: the world-ready gate (`testIsWorldReady()`) is already awaited per cell, and the residual difference is software-WebGL rasterization of the large sky region, not a settle-timing artefact. A longer settle cannot remove rasterizer noise, and it would add ~60 s per full matrix run for no measured gain. |
| Profile-scaled settle | Rejected on the same evidence — noise is not a function of quality profile here; the flipping cell is already the `high` profile. |

Neither alternative would make the column deterministic, so T10's documented
bound is the adopted path.

**Also fixed while here (real defect, not cosmetic):** `show()`/`hide()` in the
capture harness returned `void` while every caller `await`ed them, so the
`page.evaluate()` that reveals/hides HUD families was *not* awaited before the
capture. Both now return `Promise<void>` and are awaited, which makes the
per-screen state assembly actually sequential — a genuine determinism
improvement in the harness.

## T10 — Documented bound plus a tripwire

`tests/e2e/visual-regression.spec.ts`:

```ts
export const UNSTABLE_CELL_NOISE_BOUND = 0.022;
export const UNSTABLE_CELL = { screen: 'render-world', quality: 'high', resolution: '1920x1080' } as const;
export function diffOptionsForCell(screen, mode) { /* per-cell bound */ }
```

The bound applies to **one cell only**; every other cell keeps 0.02, so the
global threshold was not raised (the spec forbids that as a substitute).

Justification: 0.022 is 1.095x the 0.02 bound and 1.095x the measured 0.0201
worst case — the smallest round value that clears the observed noise by more than
the observed jitter, while a real rendering regression in that cell (missing
geometry, wrong material, lighting failure) changes far more than 2.2% of pixels.

`tests/unit/VisualGoldenNoiseBound.test.ts` (5 tests) proves the bound cannot hide
a regression:

- a synthetic image at 0.03 changed **fails** the global 0.02 thresholds;
- a synthetic image at 0.05 changed **fails** the 0.022 bound with
  `reason: 'exceeded-threshold'` and `changedFraction > 0.022`;
- a synthetic image at 0.0201 (the measured noise level) **passes** the bound;
- a synthetic image at 0.044 (2x the bound) **fails**, so the bound does not
  absorb a doubled regression;
- the source declares exactly `0.022` and never a threshold raise such as
  `maxChangedFraction: 0.03+`.

Old vs new numbers: **global bound unchanged at 0.02** for 59 cells; the single
unstable cell goes **0.02 → 0.022**, recorded with the 0.0201 measurement above.

## T4 — Single declared captured-surface contract

`tests/visual/matrix.ts` exports

```ts
export const CAPTURED_SURFACE_GLOBS: readonly string[] = [
  'index.html', 'src/styles.css', 'src/rendering/**',
];
```

with a comment recording why `src/world/**` and `src/worldgen/**` are excluded
(the capture scene is pinned by `?seed=1337`, so worldgen is covered by change
244's golden-seed matrix instead of the pixel matrix).

The unit test **imports** the constant and asserts it equals those three paths
and that the check script uses the identical three pathspecs, so the contract is
one dependency rather than two copies that can drift.

## T5 — `scripts/check-visual-goldens.mjs`

Node builtins only, strictly read-only. Per golden environment it compares the
newest commit touching `tests/visual-golden/<env>/**` against the newest **real
content** change to a captured surface.

The "real content change" rule is the important part: the check walks
`git log -w --numstat` and takes the first commit with a non-zero added/removed
row. This is required because `git log -w` still *lists* whitespace-only commits
(it simply prints an empty numstat block for them). Measured directly:

```
$ git show      --numstat --format=%h 1d10c7d -- index.html
1d10c7d
163     163     index.html          <-- change 298's EOL renormalisation

$ git show -w   --numstat --format=%h 1d10c7d -- index.html
1d10c7d
                                <-- empty: no content change
```

So change 298's repository-wide line-ending commit is correctly skipped and does
not mark every baseline stale.

Acknowledgement: `tests/visual-golden/acknowledgements.json` maps one 40-hex
commit to a written reason (an environment variable cannot persist in CI). Only
the **newest** surface commit may be acknowledged. `VISUAL_GOLDENS_ACKNOWLEDGED`
remains available for a one-off local run.

Exit codes: **0** fresh or acknowledged, **1** stale, **2** a baseline directory
is missing. Never writes a golden, never re-pins, never reads a PNG.

## T6 — `tests/unit/VisualGoldenStaleness.test.ts` (8 tests, all pass)

Synthetic throwaway git repos with controlled author dates:

1. golden newer than every surface → exit 0 + "are fresh";
2. surface newer than golden → exit 1, names the surface SHA, the env directory,
   and the `UPDATE_SNAPSHOTS=1` command;
3. exact newest surface commit acknowledged → exit 0, reports "acknowledged";
4. acknowledgement naming a **different** commit → still exit 1, and the message
   says the acknowledgement does not match;
5. missing golden directory → exit 2;
6. a line-ending-only surface change → exit 0 (whitespace-only commit skipped);
7. read-only: `git status --porcelain` is byte-identical before and after;
8. `CAPTURED_SURFACE_GLOBS` equals the three paths and the script uses them.

## T7 — CI wiring and the synthetic stale proof

`.github/workflows/ci.yml`'s `e2e` job now runs

```yaml
- name: Visual golden staleness
  run: node scripts/check-visual-goldens.mjs
```

**before** `E2E tests`, so a stale baseline fails in seconds instead of after a
14-minute capture. `npm run verify:visual-goldens` exposes the same check locally.

Failure proof (real repository state, not a mock): before the acknowledgement was
added, the check exited **1** on this tree —

```
Visual goldens are stale relative to a captured surface:
  newest captured-surface commit: 9dfc9c7… (2026-09-27T16:12:23+08:00)
  tests/visual-golden/linux-ci: pinned at 6af6c6c6… (2026-09-18T12:33:41Z)
  tests/visual-golden/win32-local: pinned at 94b0671b… (2026-09-16T13:00:16+08:00)
EXIT=1
```

and after recording the reviewed, pixel-neutral acknowledgement it exits **0**:

```
Visual goldens are fresh against captured surface 9dfc9c7…; 2 environment set(s) checked, one acknowledged.
EXIT=0
```

The case-4 unit test is the "acknowledged for a different commit" proof.

## Measured correction: the audit's matrix claims do not reproduce

The audit-authored packages asserted (F-003) that the matrix is chronically
~50% red and that the `#trading-open` chip makes 12 `linux-ci` cells unmatchable.
Both were re-measured and **neither reproduces**:

| Measurement | Result |
|---|---|
| **Canonical CI run `38989997105`** (commit `d36b1a0`, the 299 tip) | e2e job: `tests/e2e/visual-regression.spec.ts:176:3 > every matrix cell matches its committed golden` **PASSED in 14.1m — all 60 `linux-ci` cells green** |
| Local verify mode, resolved `win32-local` set | **60/60 green, four consecutive runs** (7.1m, 7.4m, 7.1m, 8.8m) |
| Local verify mode, full suite | **137/137 green** twice in this campaign (298 and 299 sessions) |
| Fresh `UPDATE_SNAPSHOTS=1` re-pin of `win32-local` | Changed **19 cells that were already passing** → reverted as unnecessary churn that could have masked a regression |
| `#trading-open` geometry | Inside `#hud`; captured by `render-world` and `hud`, but it moves those cells by **less than** the 0.02 tolerance, which is exactly why the pinned sets still match |

The audit's evidence was gathered on a SwiftShader-only host and its "30 fail /
30 pass" band came from comparing across environments and across runs. On the
authoritative environments (canonical CI for `linux-ci`, the resolved local set
for `win32-local`) the matrix is green.

Consequence for T11: **no re-pin was performed**, because the committed baseline
already matches the current build. Re-pinning would have rewritten 19–60
passing PNGs, i.e. destroyed the regression signal this change exists to
protect. The staleness check plus the acknowledgement mechanism is what makes
"the baseline is correct" a *checked* claim rather than an assumption.

## T12 — Green matrix, three consecutive runs, identical status map

The **full** `npm run test:e2e` for this candidate is also green:
**137/137 passed, exit 0 (36.2m)**, including
`tests/e2e/visual-regression.spec.ts:176:3 > every matrix cell matches its
committed golden`.

Verify mode on the resolved baseline, no tolerated failures:

| Run | Result | Duration |
|---|---|---|
| 1 | `1 passed` (60/60 cells) | 7.1m |
| 2 | `1 passed` (60/60 cells) | 7.4m |
| 3 | `1 passed` (60/60 cells) | 7.1m |
| 4 (after reverting the needless re-pin) | `1 passed` (60/60 cells) | 8.8m |

Zero failing cells in any run, so the per-cell status map is `pass` × 60 each
time — identical across runs. No run showed a tolerated failure.

## T13 — Baseline policy decision (documented, enforced)

Both sets are **retained**, and the reason is now recorded rather than implied:

- `linux-ci/` can only be produced by canonical `ubuntu-latest` (the
  `seed-visual-goldens.yml` path). This host is Windows with WSL's SwiftShader;
  capturing a "linux" set here would fabricate pixels, exactly what change 258's
  deferral forbids.
- `win32-local/` is the only set a Windows contributor's local gate can compare
  against; retiring it would turn every local browser run into
  `missing-golden` failures.

Retiring the duplicate set is therefore **not** implemented, and instead the
refresh trigger is *enforced* by T5's check running in CI (which covers both
directories) — satisfying the spec's requirement that a retained per-platform set
must have a documented, enforced refresh trigger. `tests/visual-golden/README.md`
documents the authoritative sets, the policy, the refresh trigger, the
acknowledgement mechanism, and the measured status table above.

## T14 — File-audit manifest

+4 rows (`scripts/check-visual-goldens.mjs`, the two new unit tests,
`tests/visual-golden/acknowledgements.json`) plus in-place re-reviews of
`tests/visual/matrix.ts`, `tests/e2e/visual-regression.spec.ts`,
`tests/visual-golden/README.md` and both workflows. Total **3076**;
`validate-file-audit` reports `PASSED (3076 rows, reviewed manifest)`.

## T15 — Full mandatory gate

| Command | Result |
|---|---|
| `npm run verify:deps` | **PASS** — 171 packages verified |
| `npm run verify:visual-goldens` | **PASS** — fresh, 2 sets checked, one acknowledged |
| `npm run validate-state` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS — 0 errors / 85 warnings** (unchanged) |
| `npm test` | **PASS — 480 files, 5748 passed + 1 skipped, exit 0** |
| `npm run test:coverage` | **PASS — 91.82 / 88.61 / 94.65 / 93.15** vs 91/88/94/93 |
| `npm run build` | **PASS — 2.48 s** (existing chunk advisory only) |
| `node scripts/check-release-bundle.mjs` | **PASS — 4 assets checked; no E2E hook found** |
| `npm run test:e2e` | **PASS — 137/137, exit 0 (36.2m)**, including the full 60-cell visual matrix |
| `node scripts/validate-file-audit.mjs <manifest>` | **PASSED — 3076 rows** |

No golden PNG changed: `git diff --numstat -- '*.png'` is empty for this change,
which the spec requires.

## Edge/adversarial validation

- [x] Stale baseline → exit 1, naming directory, golden commit, newer commit and
      the re-pin command.
- [x] Fresh baseline → exit 0 with the count of environment sets checked.
- [x] Acknowledgement honoured **only** for the exact newest surface commit.
- [x] Acknowledgement for any other commit has no effect.
- [x] Missing golden directory → exit 2.
- [x] Line-ending-only commit does not mark the baseline stale.
- [x] Read-only: `git status` unchanged before/after.
- [x] The knowledge script cannot run at all without git (exit non-zero rather
      than reporting "fresh").
- [x] The noise bound fails synthetic images at 0.03, 0.044 and 0.05.
- [x] The noise bound passes the measured 0.0201 noise level.

## Migration/compatibility

- [x] No product code, rendering code, or product behaviour changed.
- [x] No dependency version, coverage threshold, or global pixel threshold
      changed (0.02 remains for 59 of 60 cells).
- [x] No golden PNG re-pinned (`git diff --numstat -- '*.png'` empty).
- [x] CI gains one cheap step; `npm ci` and every existing step unchanged.
- [x] Both workflows keep every `actions/*` step pinned to a full commit SHA
      (verified: 0 range/tag pins remain) and now also set
      `persist-credentials: false`, so the job token cannot be captured by an
      uploaded artifact — the e2e job does upload `test-results/` on failure.

## Performance/resource validation

- [x] The staleness check reads only `git log` metadata: it completes in well
      under a second (measured 0.3 s here) and never reads a PNG, far inside the
      spec's 5-second bound.
- [x] The per-cell bound does not lengthen any comparison path.

## Regression / debt status

- No regression introduced.
- Remaining audit findings keep their own changes: 301 (verification-script gate
  wiring — which will also wire `verify:deps`/`verify:visual-goldens` into the
  aggregate command), 302 (multiplayer performance gate), 303 (`Renderer.ts`
  coverage), 304 (modal focus/keyboard accessibility).
- `258-real-world-runtime-performance-fps-recovery` remains **BLOCKED** at
  40/100. No headed FPS work, no GPU evidence, no 258 status change, and no
  claim that a Windows host produced a `linux-ci` baseline.

## Advancement Exception

Not required: completion is 100% (17/17), every MUST/SHALL requirement in
`specs/visual-regression-gate/spec.md` has passing evidence above, all mandatory
tests pass, and no unresolved data-loss, corruption, determinism, compatibility,
security, or regression blocker remains.

## Final decision

**VERIFIED.** The visual gate is now self-checking: a stale baseline fails in CI
before the 14-minute browser gate, the captured-surface contract is declared once
and imported, the single irreducible cell has a measured bound with a tripwire
proving it still fails a real regression, the harness awaits its own state
assembly, and the baseline policy (both sets retained, refresh trigger enforced)
is documented with the evidence for why no re-pin was needed.
