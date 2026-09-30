# Verification: 302-multiplayer-performance-gate-enforcement

Status: NOT VERIFIED
Completion: 0% (T1–T3 are pre-implementation evidence only; T4–T18 are open)
Advancement allowed: false

Authored by an audit campaign that is **forbidden from implementing code**. T1–T3
record the measured baseline. No passing evidence is pre-filled.

## Pre-implementation evidence captured at base `2ecf781`

### E1 — The normative verdict is behind an environment flag nobody sets

`tests/unit/multi-client-performance.test.ts:319`:

```ts
// Canonical isolated measurement: run alone via
//   MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts
// (no other test file competes for CPU), and enforce the normative throughput and
// elapsed budgets (REQ-P3/REQ-P7). The verdict is recorded in verification.md.
it.skipIf(process.env.MC_CANONICAL !== '1')(
  'canonical isolated measurement sustains >= 200 ticks/sec within 6000 ms',
  () => { /* asserts withinBudget, sustainedTps, elapsedMs */ },
  180000,
);
```

The always-run sibling test explicitly disclaims the verdict:

```ts
// Per-client-tick ceilings are structural (interest/tracked/queue sizes) and
// load-independent; the throughput/elapsed verdict lives in the canonical test below.
```

### E2 — Nothing in the repository sets the flag

```
$ grep -rln "MC_CANONICAL" . --include='*.yml' --include='*.json' --include='*.mjs' --include='*.md' \
    | grep -v node_modules
openspec/changes/236-multiplayer-load-tests/design.md
openspec/changes/236-multiplayer-load-tests/proposal.md
openspec/changes/236-multiplayer-load-tests/specs/multi-client-performance-fixtures/spec.md
openspec/changes/236-multiplayer-load-tests/verification.md
openspec/evidence/changes/236.md
openspec/hardening/2026-08-17-pre-241-repository-hardening/verification.md
openspec/PROGRAM_STATE.json
```

Matches appear **only** in OpenSpec documentation. There is **no** match in
`.github/workflows/*.yml`, **no** npm script that sets it, and **no** runnable
script that sets it.

### E3 — The normative budgets

`src/simulation/MultiClientLoadHarness.ts:256` defines `minTicksPerSecond: 200`.
`openspec/changes/236-multiplayer-load-tests/specs/multi-client-performance-fixtures/spec.md`
states:

* **REQ-P3** — sustained throughput `>= 200` ticks/sec over 1200 ticks.
* **REQ-P7** — `elapsedMs <= 6000` (`maxElapsedMsForTicks`), with
  `maxChunkAddedPerClient = 81`.

These are normative MUST requirements with **no automated enforcement**.

### E4 — The budget is healthy on the current build (measured)

```
$ MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts \
    -t "canonical isolated measurement"

[236 BASELINE_LOAD canonical] elapsedMs=2333.7 sustainedTps=514.2 withinBudget=true
 ✓ canonical isolated measurement sustains >= 200 ticks/sec within 6000 ms  2343ms
 Test Files  1 passed (1)
      Tests  1 passed | 11 skipped (12)
```

Measured margin: **514.2 tps vs a 200 floor (2.6×)** and **2333.7 ms vs a 6000 ms
ceiling (2.6× headroom)**; the whole file runs in 2.3 s. Enforcement is therefore
low-risk on the measurement itself, and the gap is purely the absence of
automation.

Note: this measurement was produced on the authoring host with **Vitest 3.2.7**
installed rather than the locked 4.1.11 (see change 299). The number is recorded
as an audit observation, not as repository evidence; the implementing agent MUST
re-measure under the locked toolchain.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Normative performance budgets run in automation | E1/E2 show REQ-P3/REQ-P7 are gated behind a flag nothing sets. T11 unimplemented. | NOT VERIFIED |
| Single documented, cross-platform command | No such command exists. T4/T6 unimplemented. | NOT VERIFIED |
| Shared suite behaviour unchanged | Currently true by construction; T10 must prove it after the change. | NOT VERIFIED |
| Measurement result recorded as evidence | E4 records an audit observation only, on a drifted toolchain. T13 unimplemented. | NOT VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `grep -rn "MC_CANONICAL" …` | documentation only | E2 |
| `MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts -t "canonical isolated measurement"` | **PASS** — `elapsedMs=2333.7 sustainedTps=514.2 withinBudget=true`, 1 passed / 11 skipped | E4 |
| `npm test` (canonical portion) | canonical test **skipped** | E1; re-proved at T10 |
| `npm run validate-state` | PASSED | see change 298 E1 |
| `npm run typecheck` | PASS | see change 298 E1 |
| `npm run lint` | PASS (0 errors / 85 warnings) | see change 298 E1 |
| `npm test` (whole suite) | FAIL (2 unit tests) | see change 298; unrelated to this change |
| `npm run test:perf:multiplayer` | **does not exist** | to be added at T6 |
| CI `perf-multiplayer` job | **does not exist** | to be added at T11 |
| `npm run build` / `npm run test:e2e` | NOT RUN | must PASS at T16 |

## Edge/adversarial validation (required at T7/T9/T12)

- [ ] Runner sets `MC_CANONICAL=1` in the child environment.
- [ ] Runner uses an explicit argv array with `shell: false`.
- [ ] Runner forwards the child's exit code.
- [ ] Runner exits non-zero with a named message when the vitest binary is
      missing.
- [ ] Runner exits non-zero when the `-t` filter matches **zero** tests.
- [ ] Runner exits non-zero when the `-t` filter matches **more than one** test.
- [ ] Renaming the canonical test in a throwaway worktree makes the command FAIL
      (not vacuously pass).
- [ ] An over-budget measurement makes the command FAIL with
      `withinBudget=false`.
- [ ] `npm test` still reports the canonical measurement as skipped, with the
      total test count unchanged apart from the new runner test.
- [ ] The command works from both a POSIX shell and a Windows shell without the
      caller setting the environment.

## Migration/compatibility validation

- [ ] `tests/unit/multi-client-performance.test.ts` is unmodified (the `skipIf`
      remains).
- [ ] `src/simulation/MultiClientLoadHarness.ts` budget constants unmodified.
- [ ] No new runtime dependency introduced (`cross-env` NOT added).
- [ ] The new CI job reuses the immutable action SHA pins from change 268.

## Performance/resource validation

- [ ] The command completes in seconds on the current build (measured 2.3 s).
- [ ] The shared full-suite run is not lengthened.
- [ ] The CI job has a bounded timeout.

## Regressions

- None by design: the change adds one npm script, one runner, one test file, and
  one CI job. No product or measurement logic changes.
- Known operational note to record: `AGENTS.md`'s baseline gate remains
  `npm test`; the multiplayer budget is enforced by a separate dedicated job, so
  a green local run does not by itself evidence the multiplayer budget.

## Incomplete tasks

T4–T18 (15 of 18 tasks). Completion **0%** by checkbox count.

## Advancement Exception

Not applicable: completion is below 90%; advancement is forbidden.

## Final decision

**NOT VERIFIED.** The normative multiplayer performance budgets REQ-P3
(`sustainedTps >= 200`) and REQ-P7 (`elapsedMs <= 6000`) are declared MUSTs whose
only enforcement lives in a test gated on `MC_CANONICAL=1`, an environment
variable that no workflow, npm script, or runnable script in the repository ever
sets. The budget itself is healthy (measured 514.2 tps / 2333.7 ms, 2.6× margin
on both axes), so enforcement is low-risk and high-value. T4–T18 must be
implemented and the dedicated CI job must be shown to fail on both a zero-test
selection and an over-budget measurement before this change may be marked
VERIFIED.
