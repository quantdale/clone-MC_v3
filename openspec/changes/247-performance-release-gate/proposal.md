# Proposal: 247-performance-release-gate

## Problem

The game has grown a large, individually-tested system stack (simulation ticks 044-055,
rendering 062-075, persistence 034-043/234, multiplayer 222-236) but there is **no release
readiness statement** tying performance to the hardware the game targets. Budgets exist in
isolated places — `RenderBudgetConfig`/`DEFAULT_RENDER_BUDGET` (075) declares frame ceilings and
236 `multi-client-performance-fixtures` declares multiplayer ceilings — but there is no unified
definition of *hardware tiers*, no per-tier budget across all five domains the sequence names
(frame, tick, load, save, network), and no concrete headless measurement procedure that decides
"this build meets this tier's budget". A build can be functionally correct yet fail every target
class of device with no automated signal.

## Goals

- Define a small closed set of **release hardware tiers** (Low / Medium / High / Ultra) and a
  single, validated **budget matrix** that maps each tier to a concrete ceiling for every
  dimension in the five named domains: **frame**, **tick**, **load**, **save**, **network**.
- Provide a **headless measurement method** per domain that runs in the node Vitest environment
  (no DOM, no GPU, no real transport) and produces a comparable *measurement bundle* of actuals.
- Provide a **release-gate evaluation**: a pure function that turns `(config, tier, measurement
  bundle)` into a per-dimension + overall PASS/FAIL verdict, fail-closed on any violation.
- Make every budget a concrete, measurable number with a defined procedure, following the 075 and
  236 measurement conventions (boundary equality counts as within budget; non-finite/negative
  actuals are violations).

## Non-goals

- **No production optimization.** This change measures and gates; it does not tune the renderer,
  simulation, storage, or network code paths. Optimizations are the later stress changes
  (238 worker stress, 239 long-session memory, 240 save-recovery).
- **No GPU / real-device benchmark.** Measurement is headless (node); the frame budget measures
  the cost of the render system's observable work recorded through the 075 monitor surface, not
  raw GPU frame time. A physical-device compliance pass is a documented procedure outside this
  change's CI harness.
- **No implementation of 236's harness.** `MultiClientHarness` / `MultiClientBudgets` are authored
  as specs in 236 but their implementation may not exist yet. 247 references those budgets *by
  name* and defines the per-tier network ceilings; it does not build the multi-client harness.
- **No network adversarial/rate-abuse testing** — that is 237.
- **No new gameplay, network protocol, persistence format, or stored-data schema.** Measurement is
  additive; no existing module's public behavior changes.

## Preconditions

- Per `CHANGE_SEQUENCE.md`, change 246 `input-accessibility-matrix` is VERIFIED and advancement is
  allowed before 247 may activate.
- Baseline gate green at the 246 baseline: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`.
- The measurement seams this change consumes exist: `RenderPerformanceMonitor` + `RenderBudget`
  (075), `WorldTickProcess` + `SimulationClock` (224/044), `ServerSaveLifecycle` + `SaveLoadBoundary`
  (234), `SimulationHarness` (055).

## Dependencies

- **075 `RenderBudgetConfig`/`RenderPerformanceMonitor`** — the frame-domain measurement surface
  and budget conventions.
- **224 `WorldTickProcess` + 044 `SimulationClock`** — the tick-domain measurement driver and the
  20 TPS / 50 ms tick definition.
- **234 `ServerSaveLifecycle` + injected `SaveLoadBoundary`** — the load/save-domain measurement
  seam.
- **236 `multi-client-performance-fixtures`** — the network-domain budgets, referenced by name
  (`MultiClientBudgets`: `minTicksPerSecond`, `maxElapsedMsForTicks`, per-tick message ceilings)
  and its canonical `BASELINE_LOAD` scenario.

## Proposed change

- **NEW** `src/simulation/ReleasePerformanceGate.ts` — a pure, headless, deterministic module
  containing:
  - the closed tier set (`Low` | `Medium` | `High` | `Ultra`);
  - `ReleaseBudgetConfig` and `DEFAULT_RELEASE_BUDGETS` — the concrete per-tier × per-dimension
    budget matrix (see `design.md` and `specs/performance-release-gate/spec.md`);
  - `validateReleaseBudgetConfig(input)` — strict positive-finite validation naming the offending
    field;
  - `ReleaseMeasurementBundle` — the typed actuals collected by the per-domain measurements;
  - `evaluateReleaseGate(config, tier, bundle)` — the per-dimension + overall verdict,
    fail-closed, boundary-equality-within.
- **NEW** headless measurement drivers and fixture scenarios per domain (implemented during 247,
  tested in `tests/unit/`):
  - *frame* — drive the 075 `RenderPerformanceMonitor` on a canonical render scenario;
  - *tick* — drive a `WorldTickProcess` on a canonical simulation scenario and measure sustained
    ticks/sec and elapsed run time;
  - *load/save* — drive `ServerSaveLifecycle` through a wall-time-instrumented `SaveLoadBoundary`
    on canonical load and dirty-save fixtures;
  - *network* — run the 236 `BASELINE_LOAD` scenario through the 236 harness (by name) and measure
    sustained ticks/sec, elapsed time, and per-tick message ceilings.
- Each measurement produces a `ReleaseMeasurementBundle` evaluated against the declared tier.

## Compatibility and migration

Additive. New module + new test files only; no existing module, public symbol, persistence format,
or protocol version changes. No stored data is touched, so no migration applies.

## Risks

- **Headless measurements are machine-dependent** for the wall-clock ceilings (tick/load/save/
  network throughput). Mitigation: budgets are conservative ceilings that catch regressions, not
  targets; actuals are recorded in `verification.md`; deterministic/scripted-clock paths provide
  machine-independent correctness evidence while wall-clock ceilings are regression fences.
- **Overly tight ceilings could flake in CI.** Mitigation: conservative numbers; boundary equality
  counts as within budget (075 convention); a budget is tightened only with evidence, never
  loosened silently.
- **236's harness may not be implemented when 247 begins.** Mitigation: 247's network measurement
  consumes the 236 contract *by name*; the reconciliation step in `SPEC_AUTHORING_PROTOCOL.md`
  reconciles the exact symbol/type names against the 236 implementation before 247 verifies.

## Rollback strategy

Revert the commit; additive with no consumers in production paths and no stored-state impact.

## Definition of Done

- The four hardware tiers and the full frame/tick/load/save/network budget matrix are declared,
  concrete, and validated (`validateReleaseBudgetConfig` rejects any malformed config).
- `evaluateReleaseGate` produces a deterministic per-dimension + overall verdict; boundary
  equality is within budget; non-finite/negative/missing actuals violate; unknown tier rejected;
  overall is within only when every dimension of the selected tier is within.
- Each domain has a documented, headless measurement procedure and a fixture that produces a
  measurement bundle; the gate is demonstrated on at least one tier per domain.
- Baseline gate `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e` all PASS; unit count grows by the 247 suites, e2e stays green.

## Advancement gate

100% task completion; all MUST/SHALL requirements in the capability specs verified; regression gate
green.
