# Verification: 258-real-world-runtime-performance-fps-recovery

Status: BLOCKED — owner deferral of headed hardware-WebGL certification (2026-09-11)
Completion: 40/100 (40%)
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Headed GPU-backed baseline/final certification | Not run (SwiftShader-only host) | NOT RUN |
| Whole-frame rAF timing includes update + world + render | `GameLoop` boundary hook + `Game.wholeFrameRing` + `getWholeFrameStats`; unit 17 + GameLoop 6 + live-boot e2e 30/30 | PASS (headless-verified foundation; canonical headed proof pending) |
| Phase attribution | Game-level input/fixedTicks/worldUpdate/renderSubmit + World-internal generation/meshingMain/workerDispatch/lighting/upload/unload via disabled-by-default timers merged in `render()`; live e2e 2/2 proof (teleport-forced generation: worldUpdate 382 ms / generation 158 ms / meshingMain 213 ms totals) | PASS (mechanism headless-verified; canonical headed proof pending) |
| Generation/meshing/lighting/upload telemetry | Phase timers + per-frame `WorldFrameWorkCounts` (snapshotted at end of `update`, flow while disabled); `FrameAuxRing` renderer/buffer snapshots; unit 13 + live proof | PASS (mechanism headless-verified; canonical headed proof pending) |
| Canonical-run rejection logic | `CanonicalRunGate` unit-tested; runner mirrors rules | PASS (logic; canonical headed run pending) |
| Worker capability + pool sizing | `WorkerMeshCapability` unit-tested; production default unchanged | PASS (definition; activation pending) |
| Worker crash/fallback fault injection | `WorkerFallbackRecovery.test.ts` 2/2 (throwing factory incl. nested-fallback-inside-dispatch with timing enabled; mid-batch `onerror` crash → bounded sync recovery, no leaks); malformed/stale rejection pre-existing | PASS (headless fault injection; headed parity pending) |
| Production worker meshing with fallback | Existing code opt-in; production activation not implemented | NOT RUN |
| Worker/sync equivalence (headless slice) | Identical scripted content through live sync + worker Worlds: same sections, exact translucent match, identical opaque visible-face sets; module parity exact incl. corner order | PASS (headless; headed FPS-scale proof pending) |
| Shared adaptive main-thread budget | Pure `FrameBudgetGovernor` core + 11 unit tests; production wiring not done | PARTIAL |
| Headed perf harness + self-test | `npm run test:perf` 5 scenarios (stationary/fresh/cached/interaction/entities-day-night) + scripted real-input actions + per-sample phases/aux/worker/pipeline + screenshots + CDP traces; `--self-test` PASS; headless smoke 5/5 with zero action errors (non-canonical as required) | PASS (skeleton; canonical headed run pending) |
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
| worker equivalence/failure tests | PASS: pre-existing parity/stale suites + new `WorkerFallbackRecovery.test.ts` 2/2 (headless fault injection) |
| governor tests | PASS: `FrameBudgetGovernor.test.ts` 11/11 (pure core; production wiring pending) |
| whole-frame instrumentation tests | PASS: `WholeFrameMetrics.test.ts` 17/17 + `WorldPhaseTelemetry.test.ts` 13/13 + `GameLoop.test.ts` 6/6 + live e2e 2/2 |
| gate-threshold tests | PASS: `PerfGate.test.ts` 7/7 + `test:perf --self-test` PASS |
| `npm run validate-state` | PASS (re-run at checkpoint; see state section) |
| `npm run typecheck` | PASS (this session, after all Phase-2 edits) |
| `npm run lint` | PASS, 0 errors (5 new `any` warnings in 258 test fixtures match repo style; baseline 80) |
| `npm test` | PASS: 392 files; 4698 passed, 1 skipped (this session, incl. 15 Phase-2 + 1 Phase-3 equivalence tests) |
| `npm run build` | PASS (1.9 s production bundle, rebuilt after Phase-2) |
| `npm run test:e2e` (game.spec headless SwiftShader smoke) | PASS 30/30 (9.6 m, prior session) |
| `npm run test:e2e` (whole-frame-metrics live proof) | PASS 2/2 (31.3 s this session): Game-level + World-internal attribution, teleport-forced generation, aux/worker/counts shapes, disable path clean |
| `npm run test:e2e` (complete headless suite) | PASS 62/62 (25.6 m this session, incl. visual goldens, void-world recovery, furnace, persistence, memory-stress) — ran against the pre-sanitize tree; the only later production change is the 10-line aux-sanitize (finite-passthrough, tsc/lint clean, values proven finite live) |
| `npm run test:perf -- --self-test` | PASS (this session, after runner extension) |
| `npm run test:perf` headless smoke (non-canonical) | 5/5 scenarios captured with phases/aux/worker/pipeline + 5 PNGs + 5 trace zips, zero actionErrors; correctly NON-CANONICAL (headless + SwiftShader + reduced distance) |
| full e2e / visual / orphan / release gates | NOT RUN |
| file-audit manifest | PASS 2660 rows per validator (incl. 3 Phase-2 + 1 Phase-3 rows) |
| exact-final-SHA GitHub CI | PASS on 8f9406e (run 34578554173: gate 3m57s + e2e 22m1s) and re-run PASS on 263de49 (run 34583627196: gate 4m10s + e2e 38m29s, incl. the fixed full-audit step). No commits after 263de49 so HEAD holds the green exact SHA. |

## Ship-hygiene gates (2026-09-11 owner-deferral session)

Documentation-only session (no `src/` change): 258 set to BLOCKED, state/README prose
made truthful, `docs/258-headed-resume.md` authored.

| Evidence | Result |
|---|---|
| `npm run validate-state` | PASS (after adding the BLOCKED entries; one self-inflicted advancement-label mismatch fixed by keeping the validator-required wording) |
| `npm run typecheck` | PASS, 0 errors |
| `npm run lint` | PASS, 0 errors (85 warnings; baseline 80 + 5 pre-existing 258-fixture `any` notes) |
| `npm test` | PASS: 393 files, 4701 passed + 1 skipped. Single initial failure was the file-audit manifest missing the new `docs/258-headed-resume.md` row (added in matching style); re-run green. No production-code finding. |
| `npm run build` | PASS (3.74 s production bundle) |
| `npx playwright test tests/e2e/whole-frame-metrics.spec.ts` (headless playable-boot proof) | PASS 2/2 (1.4 m). First attempt failed 2/2 on a missing Playwright browser binary (empty `~/.cache/ms-playwright`); fixed per README with `npx playwright install chromium` (Headless Shell 151.0.7922.34); re-run green. Environment issue, not a code regression. |
| full headless e2e 62/62 | NOT RE-RUN this session (prior checkpoint PASS 62/62 recorded above; no `src/` change since, boot path re-proven 2/2) |
| headed canonical perf | NOT RUN — deferred by owner decision (see Owner deferral section); nothing faked |

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

Re-probed 2026-09-11T07:05Z this session (Chrome 151.0.7922.169 present, `/dev/dri` absent, `nvidia-smi` missing — SwiftShader-only host, unchanged): headed hardware-WebGL tasks remain blocked; no headed result claimed.

Prior probe 2026-09-11 in this session (prior probe reported no Chrome):

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

60/100 incomplete — precise headed-blocker classification lives in
"Owner deferral / environment blocker (2026-09-11)" above and is authoritative.
Tasks 1, 2, 4, 5, 16–28, 30–33, 35–38, 40, 42–47, 58, 64, 66, 77, 82, 84, 85, and 96 (headless scope) complete;
task 3 and baseline tasks 6–15 (plus 91–95) are blocked on a headed hardware-WebGL reference
host. The governor/worker production-wiring tasks (33, 34, 39, 41–44, 47–57, 59, 60) and hot-path
sections G–J remain open pending headed profiling proof.

## Phase-3 evidence continued (tasks 33, 42, 44, 47)

- Task 33: runner records a post-warm-up `startup` snapshot plus the end-of-window steady-state sample per scenario (syntax-checked; headed adequacy pending).
- Task 42: sync-fallback preservation evidence — pre-existing construction-failure fallback + throwing-factory nested fallback + capability fail-closed, production default untouched (all green).
- Task 44: stale-attach prevention evidence — pre-existing delayed-result rejection + client validation suites + live current-version attach (all green; headed race-scale proof pending).

## Phase-3 evidence continued (task 47 duplicate-submit guard)

- Root cause found while testing task 47: `ensureMeshableRecord` reset (cancel batch + bump generation) on EVERY requeue with status past `MeshQueued`, including dirty rescans with unchanged versions — systematically discarding in-flight worker progress. The first submit-level guard could never fire (generation always bumped first).
- Fix: skip the reset when a worker batch for the exact chunk version is in flight and its snapshot is still current; defense-in-depth re-check in `submitWorkerMeshJob`. No behavior change for edited/stale versions (any bump still resets + resubmits).
- Test proves discrimination: bump-free teleports within a settled area add zero submits with the guard, and the test FAILS with the guard removed. Stable 3/3 across repeats.

## Phase-3 evidence (2026-09-11 session, fourth checkpoint)

- Finding F-258-W1 (worker pack axis mapping, pre-existing 255-path bug): `PACKED_FACE_LAYOUTS` mapped merger width/height to the wrong axes on +X/+Y/-Z faces. Invisible for square rects and unit quads (the entire prior fixture set), it misplaced merged non-square rects on concave content: World-level sync-vs-worker comparison showed 66 vs 144 triangles with phantom faces at never-written cells. Minimized to plain (pass) vs notch/pillar (fail) variants via direct `processMeshSectionRequest`.
- Fix (worker-path-only, no shared-mesher change): corrected uDir/vDir per the merger's (u,v) frame + (m0,m3,m2,m1) corner/attribute permutation reproducing the sync mesher's exact corner convention with standard indices. Proof: `WorkerMeshParity` exact incl. corner order/uvs/light (updated helpers replicate production), new `WorkerSyncEquivalence.test.ts` (live sync + worker Worlds, identical scripted cube/notch/pillar/glass content: same sections, exact translucent match, identical opaque visible-face sets). Sync mesher, greedy merger, shared builders untouched; production default remains sync (task 41 still pending headed proof).
- Gates: typecheck PASS; lint 0 errors; unit 392 files 4698+1 PASS; file-audit manifest PASS 2660 rows; full headless e2e re-running at checkpoint (webServer build fixed) — result to be recorded before VERIFIED, not as an exception.

## Phase-2 evidence (2026-09-11 session, third checkpoint)

- `src/world/WorldPhaseTelemetry.ts` (new) — `WORLD_TIMED_PHASES` (6 World-internal phases, subset of `WHOLE_FRAME_PHASES`), `WorldFrameWorkCounts` + validation.
- `World` — own disabled-by-default `PhaseTimer`, nest-guarded exception-safe `withPhase` bracket, per-frame work-count snapshot at end of `update`, `drainPhaseTotals`/`getLastFrameWorkCounts`/`setPhaseTimingEnabled`/`isPhaseTimingEnabled`. `PhaseTimer.hasOpenPhase` added (additive; nesting still throws on direct misuse).
- `WholeFrameMetrics` — `PhaseTimer.accumulate` + always-on fixed `FrameAuxRing` (renderer/buffer/dynScale per frame, zero per-frame allocation).
- `Game` — forwards the timing switch to `World`, merges World phases into the sample in `render()`, records aux snapshots every frame, `getWholeFrameAuxLatest`/`getWholeFrameMaxCalls`/`getWorkerTelemetry`/`getWorldFrameWorkCounts` accessors. No tick/streaming/budget/render behavior change.
- Production crash found and fixed by the new live proof: canonical section path nested `upload` inside `meshingMain` (`The game stopped: WholeFrameMetrics: begin(upload) while meshingMain is open`); fixed via `withPhase` sequential/nest-guarded brackets at all attach sites (sync, canonical-per-section, fallback, worker completion). Live e2e now green with real attribution.
- `tests/unit/WorldPhaseTelemetry.test.ts` (13) + `tests/unit/WorkerFallbackRecovery.test.ts` (2): disabled/enabled/reset/defensive-copy, busy-stub >0 attribution, `hasOpenPhase`, throwing-factory nested fallback, mid-batch crash recovery. Fixture lesson recorded: stub meshers must echo the caller `inputVersion` (like production) or `failStage` bumps self-invalidate the stub forever.
- `tests/e2e/whole-frame-metrics.spec.ts` extended to 2 tests: World-internal phase keys + teleport-forced generation total > 0, aux buffer > 0, worker/count shapes. PASS 2/2 (31.3 s).
- Runner `canonical-perf-run.mjs`: 5 scenarios, scripted real-input interaction + daylight-cycle steps, per-sample phases/aux/worker/counts/pipeline/actionErrors, per-scenario CDP traces. Headless smoke (`--allow-non-canonical`): 5/5 samples + PNGs + trace zips, zero actionErrors, correctly NON-CANONICAL (headless + SwiftShader + reduced distance 0). `--self-test` PASS.
- Gates this session: typecheck PASS; lint 0 errors; unit 391 files 4697+1 PASS; build PASS (1.9 s); validate-state PASS; file-audit manifest PASS 2658 rows (3 new Phase-2 rows).
- Blocker unchanged: headed hardware-WebGL baselines unavailable on this host (Chrome 151 present, SwiftShader-only, no `/dev/dri`); no headed result claimed, no default-quality retune.

## Follow-up evidence (2026-09-11 session, second checkpoint)

- `src/rendering/CanonicalRunGate.ts` — deterministic headed/hardware/quality classifier
  (7 unit tests incl. the exact SwiftShader string observed on this host).
- `src/rendering/WorkerMeshCapability.ts` — half-cores-clamped-[1,4] pool sizing with
  fail-closed capability resolution (5 unit tests); production default untouched.
- `Game` phase wiring: `phaseTimer` (disabled default, zero clock reads) times
  input/fixedTicks/worldUpdate/renderSubmit; `getWholeFramePhaseStats` exposes attribution;
  `setWholeFramePhaseTimingEnabled` is the harness-only switch. No tick, streaming, budget,
  or render behavior changed (disabled path adds one boolean check per boundary).
- `tests/e2e/whole-frame-metrics.spec.ts` — live proof against the production build that
  samples accumulate and enabled phase timing records real worldUpdate/renderSubmit work.
- Runner `canonical-perf-run.mjs` now also gates on render distance (6) and DPR range [1,2],
  mirroring `CanonicalRunGate` under MUST-match comments.

## Owner deferral / environment blocker (2026-09-11, Michael via Minecraft Clone Dev)

The owner formally deferred headed hardware-WebGL certification for Change 258 on
2026-09-11 and authorized moving on to whatever else is still allowed. No headed GPU
evidence is faked and no GPU host is waited for. This section is the durable record.

- Host: Grok Bot computer / Linux, Chrome 151.0.7922.169, SwiftShader-only software WebGL
  (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)),
  SwiftShader driver)`), no `/dev/dri`, no `nvidia-smi`. Re-probed 2026-09-11 this session:
  unchanged. Headless/SwiftShader evidence cannot substitute for canonical headed proof.
- Strictly headed-hardware-WebGL-blocked tasks (require a headed production run to even
  execute; left unchecked, NOT passed): 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 29, 34,
  91, 92, 93, 94, 95, 97, 98.
  - 3: reference host/browser/GPU/renderer/viewport/DPR/refresh/quality metadata.
  - 6–15: unmodified-candidate headed baselines (stationary, fresh/cached traversal,
    interaction, entities/day-night) with frame/queue/worker metrics, screenshots, traces.
  - 29: actual production build at default desktop quality.
  - 34: three samples/scenario with median plus worst relevant percentile.
  - 91–95: final FPS/resource certification gates.
  - 97–98: final screenshot/behavior comparison and before/after metrics record.
- Headed-profiling-gated tasks (no production retune without headed proof; left unchecked,
  NOT passed): 39, 41, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 59, 60, 61, 62, 63, 65,
  67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 78, 79, 80, 81, 83, 86, 87, 88, 89, 90.
- Process-closure tasks blocked by the above (left unchecked): 99, 100.
- Completed: 40/100 environment-independent tasks (1, 2, 4, 5, 16–28, 30–33, 35–38, 40,
  42–47, 58, 64, 66, 77, 82, 84, 85, 96-headless). Production default remains sync
  meshing; no quality retune; no default presentation change.
- GPU-only task checkboxes are intentionally left unchecked. Partial work receives no
  checkbox credit per the checkbox rule; environment-blocked tasks are NOT marked `[x]`.
- Owner explicitly deferred headed certification on 2026-09-11 and authorized moving on
  to production-readiness / ship-hygiene work that does not require headed GPU. Change 258
  is therefore formally BLOCKED (not ACTIVE waiting forever), and no higher-numbered
  content campaign may activate as if 258 were VERIFIED.

## Advancement Exception

Not applicable. Canonical headed performance requirements cannot be excepted, and no
exception is claimed: the change is BLOCKED by owner deferral, not advanced.

## Final decision

BLOCKED. Change 257 is VERIFIED; 001–257 VERIFIED. The game is shippable with known
performance-certification debt: 40/100 environment-independent 258 tasks landed and
headless-verified, production default unchanged (sync meshing, no quality retune), and the
remaining 60/100 tasks require a hardware-WebGL host. Resume order on such a host:
task 3 → tasks 6–15 → task 29/34 → governor/worker wiring with headed proof → 91–95 →
97–100 (see `docs/258-headed-resume.md`).
