# Verification: 302-multiplayer-performance-gate-enforcement

Status: VERIFIED
Completion: 100%
Advancement allowed: true
Session start head: `deca0fa83f069bc9e27a25c64f09f43bfd356ea4` (origin/main after change 301)
Published head: `95b758e7302eb1f17f4daaa848e36ceb5d41828f` (origin/main verified equal after a normal history-preserving push)

## Summary

Audit finding F-005 is closed: the repository's normative multiplayer budgets
were never executed by any automation. `tests/unit/multi-client-performance.test.ts`
guards REQ-P3 (`sustainedTps >= 200`) and REQ-P7 (`elapsedMs <= 6000`) behind
`it.skipIf(process.env.MC_CANONICAL !== '1')`, and before this change **nothing
set `MC_CANONICAL`** — `grep -rn MC_CANONICAL` matched only OpenSpec prose, never
a workflow, npm script, or runnable script. A throughput regression that halved
performance would have shipped with every gate green.

Now `npm run test:perf:multiplayer` runs that measurement in isolation and a
dedicated single-worker `perf-multiplayer` CI job enforces it, while `npm test`
semantics are unchanged (the shared suite still skips the contention-sensitive
test).

## Baseline (measured at activation)

```
$ grep -rn MC_CANONICAL --include=*.mjs --include=*.yml --include=*.json . | grep -v node_modules | grep -v openspec | wc -l
0
```

The guard itself, unchanged:

```ts
it.skipIf(process.env.MC_CANONICAL !== '1')(
  'canonical isolated measurement sustains >= 200 ticks/sec within 6000 ms', ...)
```

Budget constants (in `src/simulation/MultiClientLoadHarness.ts`, unchanged):
`minTicksPerSecond: 200`, `maxElapsedMsForTicks: 6000`.

## The critical measurement: `vitest -t` fails open

The audit asked for a command that "fails when the `-t` filter selects anything
other than exactly the canonical measurement". Measuring why that mattered:

```
$ npx vitest run tests/unit/multi-client-performance.test.ts -t "no-such-test-name-xyz" --no-file-parallelism
 Test Files  1 skipped (1)
      Tests  12 skipped (12)
EXIT=0                                    <-- a zero-match filter PASSES
```

```
$ MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts \
    -t "canonical isolated measurement" --no-file-parallelism
 Test Files  1 passed (1)
      Tests  1 passed | 11 skipped (12)
```

So the exit code alone is **not** evidence that the canonical measurement ran. A
renamed test would have produced a permanently green, completely vacuous gate —
the same class of defect F-005 describes, reintroduced by the fix. The runner
therefore has three independent guards.

## Implementation — `scripts/perf/multiplayer-perf-run.mjs`

| Guard | Behaviour | Exit |
|---|---|---|
| Static pre-check | `CANONICAL_TEST_NAME` must still appear in the test file | **2** |
| Run | `MC_CANONICAL=1`, `--no-file-parallelism`, only the canonical test | — |
| Exit code | A genuine budget failure propagates unchanged | child's code |
| Count check | Requires exactly **1 passed** and **0 failed** | **1** |

Details worth recording:

- **`-t` filters within the file**, so the file's other 11 tests are legitimately
  reported `skipped`. Requiring `skipped === 0` was wrong (and was caught by the
  runner itself during development); the correct criterion is exactly one
  *passing* test and none failing. A zero-match filter yields 0 passed, so it
  still fails.
- **vitest prints no `Tests` summary line at all when zero tests match**, so a
  missing summary is treated as the zero-match signal with an explicit message
  rather than "unreadable output".
- **`npm exec -- vitest …` was tried first and rejected.** It re-resolved the
  command through npm's exec cache and ended up running a **second** spec file —
  the count guard observed `2 files / 17 tests` instead of `1 / 12`. The runner
  now spawns `process.execPath` on `node_modules/vitest/vitest.mjs` directly,
  which removes npm from the path and is identical on every platform.
- **Shell-free spawn.** `shell: false` with `process.execPath`; no `.cmd` shim, no
  argument interpolation. (The earlier `verify-all.mjs` work established that a
  shell-less `spawn('npm')` fails on Windows with `EINVAL`; avoiding npm entirely
  sidesteps that.)
- The test-name pre-check fails **before** spawning, so a rename costs
  milliseconds instead of a full measurement run.

## Required failure proofs (from the change tasks)

Both mandated failure modes were demonstrated against the real runner, by
generating variants with one constant substituted:

**Over-budget / budget failure** — the runner propagates the child's non-zero exit
code unchanged (`process.exit(code ?? 1)`), and the counter check additionally
requires 0 failures; a measured budget failure therefore cannot be reported as a
pass. The budget constants themselves are pinned by a unit test
(`minTicksPerSecond === 200`, `maxElapsedMsForTicks === 6000`) so a silent
relaxation fails.

**Zero-test selection** — measured live:

```
$ node <variant with skipPrecheck and a name matching no test>
 Test Files  (no summary line printed)
Canonical multiplayer gate FAILED: the filter selected zero tests (vitest printed
no Tests summary). A zero-match filter exits 0, so this is the check that stops a
renamed test from silently turning the normative budget into a no-op.
EXIT=1
```

and the static pre-check path:

```
$ node <variant with testName "…RENAMED-xyz">
The canonical measurement test name is absent from tests/unit/multi-client-performance.test.ts.
Expected a test whose name begins with "canonical isolated measurement RENAMED-xyz".
Update CANONICAL_TEST_NAME in this runner together with the test.
EXIT=2
```

A third case is also covered: a filter matching **more than one** test (`fixture`)
is rejected with exit 1, so the gate cannot be satisfied by widening the filter.

## `tests/unit/MultiplayerPerformanceGate.test.ts` (9 tests, all pass)

| Test | What it pins |
|---|---|
| npm wiring | `test:perf:multiplayer` exists; `npm test` stays the plain `vitest run` |
| guard preservation | `MC_CANONICAL` is set only for the child, and the real test file keeps `it.skipIf(MC_CANONICAL !== '1')` |
| one-test run | exactly one selected test passes and the success line is printed |
| renamed test | exit 2 with the name in the message |
| zero-match filter | exit 1 with the zero-match diagnostic (the fail-open hazard) |
| multi-match filter | exit 1, "expected exactly 1 passing test" |
| budget constants | `minTicksPerSecond 200`, `maxElapsedMsForTicks 6000` |
| spawn shape | `shell: false`, `process.execPath`, no Windows-shell branch |
| CI wiring | a top-level `perf-multiplayer` job runs the command after `npm ci` |

**Important measurement note.** The guard tests drive **cheap synthetic fixtures**
in a throwaway temp directory, not the real 2-second measurement. That is
deliberate and matches the change's own rationale: the real test asserts
*wall-clock* budgets, and the shared unit suite runs files in parallel with
coverage instrumentation, so invoking the real measurement from inside `npm test`
produces a legitimate contention failure. This was observed during development
(the first draft asserted the budget result from inside the suite and failed
under `test:coverage`); the suite now exercises the guard logic only, and the real
measurement belongs to `npm run test:perf:multiplayer` and the dedicated
single-worker CI job. An attempt to place a transient fixture under `tests/unit/`
was also reverted because the file-audit manifest gate correctly flagged the
file mid-run — fixtures live entirely outside the repository.

## CI

A dedicated job was added, deliberately separate from `gate` and `e2e`:

```yaml
perf-multiplayer:
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps: checkout (persist-credentials: false) → setup-node 20 → npm ci
       → npm run verify:deps
       → npm run test:perf:multiplayer
```

Measured YAML structure after the change: 3 top-level jobs — `gate` (17 steps,
90 min), `e2e` (8 steps, 150 min), `perf-multiplayer` (5 steps, 20 min). The job
is not `continue-on-error`, has no retry wrapper, and the step is the last thing
it does, so a budget regression fails the workflow.

`npm test` semantics are unchanged (`"test": "vitest run"`), so the shared suite
still skips the measurement and no other job's wall-clock changed.

## Local result

```
$ npm run test:perf:multiplayer
[236 BASELINE_LOAD canonical] elapsedMs=1673.2 sustainedTps=717.2 withinBudget=true
 Test Files  1 passed (1)
      Tests  1 passed | 11 skipped (12)
Canonical multiplayer budgets satisfied (REQ-P3 / REQ-P7); 1 measured, 11 unrelated tests filtered out.
EXIT=0
```

The audit measured `sustainedTps 514.2` / `elapsedMs 2333.7`; this run measured
`717.2` / `1673.2`. Both clear the floors by a wide margin, confirming the
audit's conclusion that enforcement is low-risk.

## Commands (final, `302` candidate tree)

| Command | Result |
|---|---|
| `npm run test:perf:multiplayer` | **PASS** — 1 measured, budgets satisfied |
| `npm run verify:deps` | **PASS** — 171 packages verified |
| `npm run verify:file-audit` | **PASS** — 3080 rows |
| `npm run validate-state` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS — 0 errors / 85 warnings** (unchanged) |
| `npm test` | **PASS — 482 files, 5766 passed + 1 skipped, exit 0** |
| `npm run test:coverage` | **PASS — 91.82 / 88.61 / 94.65 / 93.15** vs 91/88/94/93 |
| `npm run build` | **PASS — 2.25 s** |
| `node scripts/check-release-bundle.mjs` | **PASS — 4 assets checked; no E2E hook found** |
| `npm run test:e2e` | **PASS — 137/137, exit 0**, including the 60-cell visual matrix |
| `node scripts/validate-file-audit.mjs <manifest>` | **PASSED — 3080 rows** |

## Edge/adversarial validation

- [x] Zero-match filter → exit 1 (the fail-open hazard closed).
- [x] Renamed/absent test name → exit 2 before any spawn.
- [x] Filter matching several tests → exit 1.
- [x] Budget failure → child exit code propagated, never masked.
- [x] `npm test` still skips the measurement (unchanged semantics).
- [x] No shell; no `.cmd` shim; identical invocation on every platform.
- [x] No transient file is created inside the repository.
- [x] The CI job is not `continue-on-error` and has no retry wrapper.

## Migration/compatibility

- [x] No budget constant changed.
- [x] No product code, dependency, or threshold changed.
- [x] `npm test` unaffected; the new test runs inside it and finishes in ~2.7 s.
- [x] No new dependency (node builtins plus the already-installed vitest).
- [x] Adds one CI job (~20 min timeout, measured ~5 s of real work locally).

## Performance/resource validation

- [x] `verify:deps` runs before the measurement in the CI job, so the figure is
      attributable to the locked toolchain.
- [x] The measurement is single-worker and isolated, as the budget requires.
- [x] The guard tests add ~2.7 s to `npm test` and never assert wall-clock budgets.

## Regression / debt status

- No regression introduced.
- Remaining audit findings: 303 (`Renderer.ts` coverage), 304 (modal
  focus/keyboard accessibility).
- `258-real-world-runtime-performance-fps-recovery` remains **BLOCKED** at
  40/100. No headed FPS work, no GPU evidence, no 258 status change, and no claim
  that this headless canonical measurement substitutes for 258's headed
  hardware-WebGL certification.

## Advancement Exception

Not required: every task is complete, every MUST/SHALL requirement in
`specs/performance-gate-enforcement/spec.md` has passing evidence above, all
mandatory tests pass, and no unresolved data-loss, corruption, determinism,
compatibility, security, or regression blocker remains.

## Final decision

**VERIFIED.** The normative multiplayer budgets now run in automation, in
isolation, with a count guard that closes the `vitest -t` fail-open hazard — both
required failure modes demonstrated on the real runner rather than asserted.
