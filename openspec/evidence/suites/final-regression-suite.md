# Final Regression & Performance Suite — Change 250-final-program-verification

Run date: 2026-08-21 · Head: `502d0215f88f31868f6bc7067efe4326d2f7fb26` (current checkout;
`src/` and `tests/` are byte-identical to baseline `b56529e` — verified via
`git diff b56529e HEAD --stat -- src tests`, empty) · Executor: change 250 implementing agent

## Overall result: **PASS**

Every baseline-gate command and every release performance budget passed. **Documented
exceptions: none.**

## Baseline gate (FRS-1)

| Command | Result | Evidence |
|---|---|---|
| `npm run typecheck` | **PASS** | Re-run by 250 at head `502d021`: `tsc --noEmit` clean, exit 0. |
| `npm run lint` | **PASS** | Re-run by 250 at head `502d021`: `eslint .` clean, exit 0. |
| `npm test` | **PASS** | Re-run by 250 at head `502d021`: **292 test files passed, 3827 tests passed + 1 skipped** (vitest, exit 0) — identical to the recorded entry-gate baseline. Includes the release-gate measurement suite cited below. |
| `npm run build` | **PASS** | Cited from the entry-gate run on the byte-identical tree: dist emitted at baseline `b56529e` (`src/`/`tests/` unchanged since — `git diff b56529e HEAD -- src tests` is empty), recorded in `openspec/changes/249-whole-codebase-adversarial-audit/verification.md` gate table. |
| `npm run test:e2e` | **PASS** | Cited from the same run on the byte-identical tree: **40/40 passed (12.8m)**, recorded in the same gate table. |

Provenance note: build/e2e are cited rather than re-run per the archive's no-duplication rule;
the citation is valid because the tree's `src/` and `tests/` inputs are byte-identical between
`b56529e` and this change's head, so the recorded results describe exactly this code state.

## Release performance gate (FRS-2, change-247 budgets)

The budget matrix is `DEFAULT_RELEASE_BUDGETS` in `src/simulation/ReleasePerformanceGate.ts`
(247); evaluation is fail-closed (any violated dimension fails the report). The canonical
measurement drivers run in the unit suite executed above —
`tests/unit/ReleaseGateMeasurements.test.ts`, all four tests **PASS** within the 3827:

- `measureCanonicalTickRun()` — real 224 tick process over CANONICAL_SIM (289 columns,
  64 entities, 1200 ticks): completes unstopped with positive sustained rate.
- `measureCanonicalLoad()` — real world-snapshot load through the lifecycle: outcome `loaded`.
- `measureCanonicalSaveFlush()` — real dirty-set flush to a closed, drained lifecycle: drained.
- Full 14-entry Medium-tier gate report built from those real actuals plus the contract
  frame/network fixtures: `evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'Medium', bundle)` —
  every entry within budget.

Medium-tier budgets checked (tick/load/save measured against real drivers; frame/network via
the 247 contract fixtures; structural network ceilings are tier-independent constants):

| Domain | Budget dimension | Medium-tier budget | Result |
|---|---|---|---|
| frame | maxDrawCalls / maxMeshBuildMillis / maxFrameTimeMillis / maxGeometryMemoryBytes / maxRenderDistanceChunks | 1000 / 6 ms / 16.7 ms / 256 MiB / 12 chunks | **PASS** (within budget) |
| tick | minSustainedTicksPerSecond | ≥ 120 | **PASS** (measured > 0 and within budget by the passing gate report) |
| tick | maxCanonicalTickRunMs | ≤ 10000 ms | **PASS** |
| load | maxLoadMs | ≤ 600 ms | **PASS** (real lifecycle load, outcome `loaded`) |
| save | maxSaveFlushMs | ≤ 750 ms | **PASS** (real flush drained to closed) |
| network | sustained ticks / run ceiling / chunk-added / entity-spawned / inventory-accepted ceilings | tier minimums; 81 / 1024 / 40 structural ceilings | **PASS** (contract fixture values within ceilings) |

Per FRS-2.3 each measured value was checked against its named budget by the fail-closed
evaluator inside the passing test assertions; the 247 requirement rows (REQ-G1..G6,
REQ-F/T/LS/N domains) additionally all record PASS in
`openspec/changes/247-performance-release-gate/verification.md`.

Known measurement-scope caveats, already recorded as non-blocking accepted findings in
`../parity/final-parity-audit.md`: budgets are evaluated from headless software-WebGL drivers
rather than physical release hardware (matrix row C247 `approx`), and the tick workload uses
the canonical synthetic systems (249-PE-002). These are documented deviations, not failures:
no budget failed.

## Documented exceptions

None. No baseline command failed and no budget was exceeded.
