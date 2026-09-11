# Verification: 258-real-world-runtime-performance-fps-recovery

Status: NOT VERIFIED
Completion: 12/100 (12%)
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Headed GPU-backed baseline/final certification | Not run (SwiftShader-only host) | NOT RUN |
| Whole-frame rAF timing includes update + world + render | `GameLoop` boundary hook + `Game.wholeFrameRing` + `getWholeFrameStats`; unit 17 + GameLoop 6 + live-boot e2e 30/30 | PASS (headless-verified foundation; canonical headed proof pending) |
| Phase attribution | Pure `PhaseTimer` core only; production phase wiring not done | PARTIAL |
| Production worker meshing with fallback | Existing code opt-in; production activation not implemented | NOT RUN |
| Shared adaptive main-thread budget | Pure `FrameBudgetGovernor` core + 11 unit tests; production wiring not done | PARTIAL |
| Headed perf harness + self-test | `npm run test:perf` skeleton + `PerfGate` thresholds + `--self-test` PASS | PASS (skeleton; canonical scenarios not run) |
| Stationary/fresh/cached default-quality gates | Not run | NOT RUN |
| Sustained resource stability | Not run | NOT RUN |
| Gameplay/visual/persistence regressions | Headless game.spec 30/30 PASS; full suite NOT RUN | PARTIAL |
| Exact-final-SHA GitHub CI | Not run | NOT RUN |

## Commands

Change 257 is VERIFIED and 258 is ACTIVE. Canonical baseline commands remain NOT RUN because this
execution environment exposes neither Chrome/Chromium nor a hardware GPU renderer.

| Evidence | Result |
|---|---|
| headed canonical perf runner and five canonical scenarios | Skeleton landed; canonical headed scenarios NOT RUN |
| worker equivalence/failure tests | NOT RUN |
| governor tests | PASS: `FrameBudgetGovernor.test.ts` 11/11 (pure core; production wiring pending) |
| whole-frame instrumentation tests | PASS: `WholeFrameMetrics.test.ts` 17/17 + `GameLoop.test.ts` 6/6 |
| gate-threshold tests | PASS: `PerfGate.test.ts` 7/7 + `test:perf --self-test` PASS |
| `npm run validate-state` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS with 80 pre-existing warnings, 0 errors |
| `npm test` | PASS: 387 files; 4670 passed, 1 skipped |
| `npm run build` | PASS (5.70 s production bundle) |
| `npm run test:e2e` (game.spec headless SwiftShader smoke) | PASS 30/30 (9.6 m) |
| full e2e / visual / orphan / release gates | NOT RUN |
| file-audit manifest | PASS 2651 rows (7 new 258 rows registered) |
| exact-final-SHA GitHub CI | NOT RUN |

## Activation and repository-truth evidence

- `session_start_head`: `1c958fce11b2234c1e99a8640c63de593600911f`; clean `main == origin/main` at session start.
- Change 257 predecessor: VERIFIED 92/92 at `d55c2e7`, with canonical CI run `33600754305` success.
- OpenSpec pre-implementation quality gate: PASS after reconciling the stale Markdown control-plane
  summary with the already-active JSON state. The package has the required proposal, design, tasks,
  verification, and normative runtime-performance spec; mandatory behavior, failure modes,
  compatibility, performance bounds, and verification mappings are explicit.
- Source/spec drift check confirms the activation rationale remains current: desktop render distance
  6 and DPR cap 2; independent 12 ms generation, 4 ms lighting, and 3 ms upload maxima; worker
  meshing opt-in defaults false; `Game` does not enable it; existing render timing remains scoped
  inside render rather than rAF-to-rAF.

## Prior performance-evidence classification

| Change/evidence | Classification for Change 258 | Authority |
|---|---|---|
| 247 release frame fixtures/monitor driver | Synthetic/headless contract evidence | Supporting only |
| 254 Vitest hot-path benches | Microbenchmark/headless CPU evidence | Supporting only |
| 255 Playwright performance baseline | Headless, reduced render distance/DPR/visual cost | Supporting only |
| 255 worker/upload/LOD unit and stress suites | Deterministic/synthetic subsystem evidence | Supporting only |
| Change 258 headed production/default-quality hardware-WebGL run | Production-representative | Primary; not yet available |

No prior result may override a failing or unavailable Change 258 canonical run.

## Environment blocker probe

Re-probed 2026-09-11 in this session (prior probe reported no Chrome):

- Chrome executable: PRESENT (`/usr/bin/google-chrome`, version 151.0.7922.169); Playwright
  bundled Chromium was absent and installed this session (headless-shell 151.0.7922.34) for
  headless smoke only.
- Hardware GPU/renderer: UNAVAILABLE (`nvidia-smi` missing, `/dev/dri` absent). Live page probe:
  `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` —
  software rendering only.
- Result: tasks 3 and 6–15 and 91–95 remain BLOCKED for canonical purposes. Headless Chromium
  and SwiftShader are used only for non-canonical smoke (game.spec 30/30) and never as canonical
  evidence, per the proposal precondition and fail-closed spec.
- Environment-independent foundation work (tasks 16, 24–28, 38, 58) was implemented and verified
  headlessly this session; no headed result is claimed and no production behavior was retuned.

## Baseline requirement

First implementation session records an unoptimized headed baseline on the same reference host used
for final comparison. Old synthetic/headless numbers cannot be imported as the baseline.

## Performance/resource validation

Final verification records both absolute thresholds and before/after whole-frame/phase deltas.

## Regressions

Full gameplay, persistence, deterministic simulation, visual and E2E gates are mandatory.

## Phase-1 foundation evidence (2026-09-11 session)

New modules (additive, no world-truth/rendering-behavior change):

- `src/rendering/WholeFrameMetrics.ts` — `WHOLE_FRAME_PHASES` (11 phases), `WholeFrameSample`
  validation (`WholeFrameMetrics: <detail>`), fixed-capacity `WholeFrameRing` (p50/p95/p99, avg
  FPS, >50 ms long frames, >100 ms severe stalls, trailing-window `rollingMinFps`,
  `longFrameFraction`), and injectable-clock `PhaseTimer` with a zero-clock-read disabled mode.
- `src/rendering/FrameBudgetGovernor.ts` — shared-budget `decide` over CONFIG-style hard caps:
  input/render reserve (baseline + half p95 excess), overload cutback ×0.75, +0.05 healthy
  recovery, starvation floors for non-empty queues, zero for idle queues, fail-closed invalid
  latch. Production wiring into `World.update` is NOT done.
- `src/rendering/PerfGate.ts` — exact proposal thresholds for stationary/fresh/cached/interaction
  gates with fail-closed malformed handling and `busyLoopSelfTestSummary`.
- `src/engine/GameLoop.ts` — optional 4th-param `onFrameBoundary` reporting the raw rAF interval
  before update/render (fires even when update throws); existing 3-arg callers unaffected.
- `src/engine/Game.ts` — `wholeFrameRing` (600 samples) fed by the boundary hook plus
  `getWholeFrameStats`/`getWholeFrameRollingMinFps` harness accessors. No tick, streaming,
  budget, or render behavior changed.
- `scripts/perf/canonical-perf-run.mjs` (`npm run test:perf`) — headed-runner skeleton: metadata
  (commit/chrome/viewport/DPR/buffer/quality/seed), WebGL-identity gate refusing PASS on
  software/headless (exit 2), warm-up/startup separation, per-scenario samples with median +
  worst-p95, versioned JSON + summary + screenshots + long-task capture, `--self-test` mode.

Tests: 17 + 11 + 7 new unit tests and 2 new `GameLoop` boundary tests (42/42 in touched files);
full unit 4670 passed + 1 skipped; file-audit manifest extended to 2651 rows and PASS.

## Incomplete tasks

88/100 incomplete. Tasks 1, 2, 4, 5, 16, 24, 25, 26, 27, 28, 38, and 58 complete; task 3 and
baseline tasks 6–15 (plus 91–95) are blocked on a headed hardware-WebGL reference host. Task 17
and the governor/worker production-wiring tasks remain open pending headed profiling proof.

## Advancement Exception

Not applicable. Canonical headed performance requirements cannot be excepted.

## Final decision

NOT VERIFIED. Change 257 is VERIFIED; implementation is blocked on the canonical headed
hardware-WebGL baseline required before production performance changes.
