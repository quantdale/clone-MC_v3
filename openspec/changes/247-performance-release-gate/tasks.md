# Tasks: 247-performance-release-gate

## 1. Baseline & characterization

- [ ] 1.1 Record the 246 baseline gate result (`npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`) and confirm change 246 is VERIFIED / advancement allowed.
- [ ] 1.2 Confirm the current state of the measurement seams (075 `RenderPerformanceMonitor`/
      `RenderBudget`, 224 `WorldTickProcess`/044 `SimulationClock`, 234 `ServerSaveLifecycle`/
      `SaveLoadBoundary`, 055 `SimulationHarness`) and that 236 `MultiClientLoadHarness` is
      unimplemented (specs-only) so the network domain is wired by contract.
- [ ] 1.3 Characterization: run a throwaway probe of `CANONICAL_SIM` (289 columns, 64 entities,
      1200 ticks) and `CANONICAL_WORLD_SNAPSHOT` / `CANONICAL_SAVE_DIRTY` timings on the host and
      record preliminary actuals (not yet asserted) to sanity-check the declared ceilings before
      finalizing them.

## 2. Release gate implementation & unit tests

- [ ] 2.1 Implement `src/simulation/ReleasePerformanceGate.ts`: closed `RELEASE_TIERS`
      (`Low | Medium | High | Ultra`), the domain/dimension type unions, `ReleaseBudgetConfig`,
      and `DEFAULT_RELEASE_BUDGETS` with the concrete matrix from `design.md`.
- [ ] 2.2 Implement `validateReleaseBudgetConfig(input)` — full-matrix shape validation and
      positive-finite value validation, throwing `ReleasePerformanceGate: <field>` on any
      missing/extra/unknown/non-positive/non-finite value.
- [ ] 2.3 Implement `ReleaseMeasurementBundle`, `ReleaseBudgetEntry`, `ReleaseGateReport`, and
      `evaluateReleaseGate(config, tier, bundle)` — per-dimension `actual <= budget` (sustained
      rates as `actual >= min`), boundary-equality-within, missing/non-finite/negative actuals as
      violations, unknown-tier throw, fail-closed overall verdict.
- [ ] 2.4 Unit tests for REQ-G1..REQ-G3: tier-set enumeration, invalid-tier rejection, full-matrix
      acceptance, missing/extra/unknown-field and non-positive/non-finite/non-numeric rejection
      naming the field.
- [ ] 2.5 Unit tests for REQ-G4..REQ-G6: all-within pass, single-violation fail, boundary equality,
      missing/malformed actual, per-tier row isolation, deterministic evaluation.

## 3. Domain measurement drivers & fixtures

- [ ] 3.1 Frame: measurement driver over 075 `RenderPerformanceMonitor` (`CANONICAL_RENDER`) and
      tests for REQ-F1..REQ-F4 (per-tier ceilings, bundle completeness, unbalanced-lifecycle throw
      with no measurement, frame-time/mesh-build overrun failures, scripted-clock determinism).
- [ ] 3.2 Tick: measurement driver over 224 `WorldTickProcess` (`CANONICAL_SIM`, `step(1200)`,
      wall-clock elapsed) and tests for REQ-T1..REQ-T4 (per-tier row, stopped-process invalidity,
      rate/run-ceiling failures, scripted determinism).
- [ ] 3.3 Load/save: timing `SaveLoadBoundary` wrapper over 234 `ServerSaveLifecycle`
      (`CANONICAL_WORLD_SNAPSHOT` load; `CANONICAL_SAVE_DIRTY` `flush()`+`saveAndClose()`) and tests
      for REQ-LS1..REQ-LS4 (per-tier rows, `'created'`/throwing-load invalidity, failed-drain
      invalidity, overrun failures).
- [ ] 3.4 Network: budget validation/evaluation with fixture bundles now (REQ-N1..REQ-N4); wire the
      236 `MultiClientHarness`/`MultiClientBudgets` measurement path by name and reconcile exact
      symbols/types per `SPEC_AUTHORING_PROTOCOL.md` once 236's implementation is present.

## 4. Integration, regression & final gate

- [ ] 4.1 Integration: produce a complete `ReleaseMeasurementBundle` for at least one tier per
      domain (frame, tick, load, save, network) and demonstrate a full `evaluateReleaseGate` verdict
      per domain; record actuals.
- [ ] 4.2 Update `openspec/PROGRAM_STATE.json` / `PROGRAM_STATE.md`, mark `tasks.md` checkboxes, and
      fill `verification.md` with actual evidence (including a full baseline-gate re-run).
- [ ] 4.3 Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`; confirm unit count grows by the 247 suites and e2e stays
      green.
