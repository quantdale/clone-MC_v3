# Proposal: 300-visual-regression-gate-reliability

## Problem

The mandatory visual-regression gate is **permanently ~50% red on the local
authoring host** and, worse, **deterministically stale in the canonical `linux-ci`
baseline used by CI**, and it has been normalized as "accepted drift" across many
sessions instead of being fixed. This is the highest-value, most concrete
verification-integrity defect after the CRLF gate.

Three compounding problems:

1. **Stale committed goldens (deterministic failure).** The `linux-ci` baseline
   was last re-pinned at commit `6af6c6c` (2026-09-18, "audit and harden changes
   1 through 277"). On 2026-09-19 Change 278 added a **new, always-visible**
   `#trading-open` HUD chip to `index.html` (`class="hud-chip"`, no `hidden`),
   and Change 279 / 282 added `#shield-indicator` / `#raid-feedback` inside
   `#hud`. The `hud`, `render-world` and `start-overlay` golden cells capture
   `#hud` with these children visible, so the committed goldens can no longer
   match the current build. This is objective git evidence, not a rendering
   theory.
2. **Baseline duplication with no refresh path.** Golden sets exist for
   `linux-ci` (CI) and `win32-local` (local Windows). There is no automated way
   to detect that a golden set is stale relative to the code, so every session
   discovers the same drift manually and re-classifies it.
3. **A structurally unstable column.** The `high/1920x1080` column fails
   run-to-run under software WebGL even on the unmodified baseline, so ~half the
   matrix is permanently red and its failures carry no signal.

Net effect: the visual gate no longer distinguishes a real rendering regression
from known noise + staleness, it forces every session to spend large effort
proving the failures are "baseline-equivalent", and it has been recorded as
"136/137 with one tolerated visual failure" instead of being repaired.

## Inspection findings (base `2ecf781`)

- Golden provenance:
  - `tests/visual-golden/linux-ci/` — 60 PNGs, last pinned `6af6c6c` 2026-09-18.
  - `tests/visual-golden/win32-local/` — 60 PNGs, last pinned `94b0671` 2026-09-16.
- `git log -S` proves `index.html` gained HUD children after the pin:
  - `trading-open` at `05203ab` (2026-09-19, change 278) — `class="hud-chip"`,
    **no `hidden`**, so it renders in every HUD capture.
  - `shield-indicator` at `a9b7108` (2026-09-19, change 279) — `hidden` by
    default.
  - `raid-feedback` at `f0e022c` (2026-09-23, change 282) — `hidden` by default.
- `tests/e2e/visual-regression.spec.ts` shows the HUD for the `hud`,
  `render-world` and `start-overlay` screens and hides it only for
  `render-world-no-hud` / `environment-day` / `environment-night`. Therefore
  `trading-open` is visible in 3 of the 10 screen families.
- The 297 verification dossier (`openspec/changes/297-.../verification.md`
  §"visual:176 SwiftShader drift") shows, across six independent runs (296 full,
  296 rerun, origin/main `218aabd`, 297 full, 297 rerun, origin/main `fdba42d`),
  a stable **30 fail / 30 pass** split with a changed-fraction band of
  **0.0202–0.0708** against a `maxChangedFraction` of **0.02**, where:
  - all 40 low/default cells are byte-identical,
  - all 10 `high/1280x720` cells are status-stable,
  - every flip and every persistent failure is a `high/1920x1080` cell
    (`container-ui`, `crosshair`, `environment-day`, `render-world-no-hud`,
    `start-overlay`).
- 16 `verification.md` files under `openspec/changes/*/` carry the same
  "SwiftShader drift / baseline-equivalent" narrative, i.e. the cost is being
  re-paid every session.

## Goals

1. Make the **canonical CI visual gate green on the current code** by re-pinning
   the `linux-ci` baseline through the canonical `UPDATE_SNAPSHOTS=1` path after
   the HUD-affecting changes, without relaxing any comparison threshold.
2. Add a **staleness detector** so a golden set that predates a UI-affecting
   change is surfaced automatically rather than discovered by a failing run.
3. Reduce the **permanent-red `high/1920x1080` column** to a truthful, stable
   signal (either stabilize capture or explicitly bound it with evidence) so the
   gate's failures are actionable.
4. Give the local `win32-local` set an explicit, documented refresh trigger (or
   retire it in favour of the canonical `linux-ci` set for all gates) so the
   per-session "classify 30 failures" burden is removed.

## Non-goals

- No change to comparison thresholds (`channelTolerance 24`,
  `maxChangedFraction 0.02`) as a way to make cells pass; any threshold change
  requires independent evidence and is out of scope here.
- No gameplay/rendering/behaviour change under `src/`.
- No addition of new screens to the matrix (that is a separate coverage
  improvement; see the follow-on note).
- No CI job restructuring beyond adding the staleness check step.
- No 258 headed hardware-WebGL work.

## Preconditions

- Changes 298 (green local gate) and 299 (matching toolchain) are recommended
  predecessors so the re-pinned goldens are produced under a known-good tree.

## Dependencies

- **298**, **299**: a trustworthy local run is required to re-pin and to prove
  the gate green.
- **301** (gate wiring) is complementary; the staleness check may be wired into
  CI there, but the re-pin itself is independent.

## Proposed change

### 1. Re-pin the canonical `linux-ci` baseline

After 298/299 land, regenerate the `linux-ci` set through the documented path
(`UPDATE_SNAPSHOTS=1 npm run test:e2e` with the full matrix, in a Linux
SwiftShader-equivalent environment or via the `seed-visual-goldens.yml` workflow),
so the baseline includes the change-278/279/282 HUD children. Do **not** touch
thresholds. Verify mode (`npm run test:e2e`) must then pass the HUD-bearing
cells. This mirrors the precedent of AUDIT-011, which re-pinned the six
`render-world` cells the same way.

### 2. Add golden-staleness detection

Add a script `scripts/check-visual-goldens.mjs` that fails when the committed
golden set is older than the newest commit that changed any file the matrix
captures (`index.html`, `src/styles.css`, the renderer/presentation modules under
`src/rendering/**`, and any HUD markup). The check is a **CI step** that runs
before the e2e job: it compares `git log -1 --format=%ct -- <golden dir>` against
`git log -1 --format=%ct -- <captured sources>` and fails if the goldens are
older, with a message telling the author to re-pin via `UPDATE_SNAPSHOTS=1`.
This turns a silent-drift class into an actionable CI signal.

### 3. Bound the `high/1920x1080` instability explicitly

Investigate whether the `high/1920x1080` capture can be made deterministic
(longer settle for the heaviest profile, forcing a completed frame before
capture, disabling dynamic resolution for the capture). If a capture-side fix
makes the column stable, adopt it. If the column is inherently noisy under
software WebGL, then — with recorded evidence — either:
- move `high/1920x1080` to an explicitly documented "informational" band with a
  wider bound justified by the measured noise, or
- pin only `high/1280x720` for `high` and capture `1920x1080` at `default` quality,
  which is stable.

Either way the resolution MUST be justified by before/after data in
`verification.md`, not by assertion. The goal is a gate whose failures mean
something.

### 4. Retire or formalize the `win32-local` duplicate

Decide one of:
- **Retire** `win32-local` and have every non-Linux local run compare against
  `linux-ci` (documenting that local pixel checks then approximate CI), or
- **Keep** it but add a documented refresh trigger to `tests/visual-golden/README.md`
  and a staleness check that covers it.

Prefer **retire** unless a Windows-only rendering difference is demonstrated to
be material; the duplicated 60-PNG set is a maintenance cost that has already
produced drift.

## Compatibility and migration

- No product code or save-data change.
- Golden PNGs are replaced (content changes expected on re-pin). The commit MUST
  be reviewed as a golden re-pin, not a product change.
- Any change to `resolveGoldenEnvironment` semantics is documented in
  `tests/visual-golden/README.md`.

## Risks

- **Re-pin masks a real regression** that happened to accumulate between the old
  pin and today. Mitigation: before re-pinning, diff the captured surfaces
  (the trading-open chip and raid/shield HUD additions) against the intended
  change list so the re-pin is justified by known, reviewed UI additions, not
  unknown drift.
- **A wider `high/1920x1080` bound weakens detection** for that column.
  Mitigation: only widen with recorded before/after data showing the noise floor,
  and keep a regression tripwire (e.g. an explicit maximum-fraction assertion).
- **The staleness check may false-positive** on cosmetic-only commits. Mitigation:
  scope it to files the matrix actually captures and allow an explicit
  `VISUAL_GOLDENS_ACKNOWLEDGED=<sha>` escape hatch that is itself reviewed.

## Rollback strategy

Revert to the previous golden PNG blobs and disable the staleness step. The
staleness check is additive and removable without touching the comparison logic.

## Definition of Done

- `npm run test:e2e` reports the visual matrix **fully green** on both the
  canonical `linux-ci` set and the (retired-or-refreshed) `win32-local` policy,
  with unchanged thresholds.
- A golden-staleness check runs in CI and demonstrably fails on a synthetic
  stale-golden state.
- The `high/1920x1080` column is either deterministic or explicitly bounded with
  recorded before/after evidence, and the matrix's overall pass count is stable
  across at least three consecutive runs.
- The `win32-local` duplicate is retired or has a documented refresh trigger.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run validate-state`, `npm run test:e2e` all PASS.

## Advancement gate

All mandatory gates PASS on the candidate SHA. The visual matrix MUST be green
(not "green modulo tolerated failures") for this change to advance; a re-run that
still shows 30 tolerated failures is not acceptable completion.
