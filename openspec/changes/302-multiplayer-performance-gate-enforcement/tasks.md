# Tasks: 302-multiplayer-performance-gate-enforcement

- [x] **T1.** Record the enforcement gap. Attach to `verification.md` the
  `skipIf(process.env.MC_CANONICAL !== '1')` site
  (`tests/unit/multi-client-performance.test.ts:319`), the "run alone via
  `MC_CANONICAL=1 …`" comment, and the `grep -rn "MC_CANONICAL"` result showing
  matches in **only** OpenSpec documentation and **no** match in any workflow,
  `package.json`, or script. **Evidence already captured at base `2ecf781`.**

- [x] **T2.** Record the normative budgets from the change-236 spec: REQ-P3
  `sustainedTps >= minTicksPerSecond (200)` and REQ-P7
  `elapsedMs <= maxElapsedMsForTicks (6000)`, with
  `maxChunkAddedPerClient = 81`, sourced from
  `src/simulation/MultiClientLoadHarness.ts:256`. **Evidence already captured.**

- [x] **T3.** Measure the canonical baseline on the current build with the
  documented manual command and record the margin:
  `[236 BASELINE_LOAD canonical] elapsedMs=2333.7 sustainedTps=514.2
  withinBudget=true` → 2.6× throughput headroom, 2.6× time headroom, 1 test
  passed / 11 skipped. **Evidence already captured at base `2ecf781`.**

- [ ] **T4.** Implement `scripts/run-canonical-multiplayer.mjs` on node builtins:
  set `MC_CANONICAL=1` in the child env, spawn vitest with an explicit argv
  array and `shell: false`, forward stdio, exit with the child's code, never
  interpolate untrusted input, and expose the spawn function for injection in
  tests.

- [ ] **T5.** Add the "exactly one test selected" guard to the runner: after the
  child exits, confirm the `-t` filter matched exactly the canonical measurement.
  If it matched zero or more than one test, exit non-zero with a message naming
  the expected test name. This prevents a renamed test from silently turning the
  gate into a no-op.

- [ ] **T6.** Add `"test:perf:multiplayer": "node scripts/run-canonical-multiplayer.mjs"`
  to `package.json` without altering existing scripts.

- [ ] **T7.** Add `tests/unit/CanonicalMultiplayerRunner.test.ts` covering: the
  env var is set to `1`; the argv is exactly
  `['run', 'tests/unit/multi-client-performance.test.ts', '-t', 'canonical isolated measurement']`
  (plus the vitest entry); `shell` is false; a zero-test selection exits non-zero;
  a multi-test selection exits non-zero; a spawn error exits non-zero with a
  message; the child's exit code is propagated.

- [ ] **T8.** Prove the command works from both a POSIX shell and a Windows
  shell (`cmd.exe`) on the authoring host, and that it does NOT require the
  caller to set the environment.

- [ ] **T9.** Prove the guard: in a throwaway worktree, rename the canonical
  test, run the command, and confirm it FAILS with the "expected exactly one
  test" message rather than passing vacuously. Restore the rename afterwards.

- [ ] **T10.** Confirm `npm test` behaviour is unchanged: the canonical
  measurement is still reported as skipped and the total test count matches the
  pre-change count (excluding the new runner test).

- [ ] **T11.** Add the dedicated `perf-multiplayer` job to
  `.github/workflows/ci.yml` using the same immutable action SHA pins established
  by change 268, `node-version: 20`, `npm ci`, then
  `npm run test:perf:multiplayer`, with `timeout-minutes: 15`.

- [ ] **T12.** Prove the CI job fails on an over-budget run. In a throwaway
  worktree, temporarily raise `minTicksPerSecond` far above the achievable value
  (or otherwise force an over-budget measurement) and confirm the local command
  exits non-zero with the harness's `withinBudget=false` line; then restore.

- [ ] **T13.** Record the CI evidence: canonical run URL, job id, and the
  `[236 BASELINE_LOAD canonical]` line from the job log, in `verification.md`.

- [ ] **T14.** Documentation: add the command to the `ONBOARDING.md` gate
  catalogue (coordinate with change 301) and add a multiplayer-performance note
  to `AGENTS.md` "Baseline verification" explaining that the normative budget is
  enforced by a dedicated isolated job, not by the shared suite.

- [ ] **T15.** Update the file-audit manifest for the added files and run
  `npm run verify:file-audit` (or `node scripts/validate-file-audit.mjs …`) to
  PASS.

- [ ] **T16.** Full mandatory gate on the candidate SHA: `npm run validate-state`,
  `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `node scripts/check-release-bundle.mjs`, `npm run test:e2e`, plus
  `npm run test:perf:multiplayer`. Lint MUST stay at 0 errors; the 85
  pre-existing warnings MUST NOT increase.

- [ ] **T17.** Documentation and state: add the post-terminal row to
  `CHANGE_SEQUENCE.md`; update `openspec/PROGRAM_STATE.json` / `.md` at
  activation with `session_start_head` / `published_head`.

- [ ] **T18.** Final reconciliation and publication: re-read all artifacts
  against the implemented result, confirm every MUST/SHALL in
  `specs/performance-gate-enforcement/spec.md` has evidence (especially T5/T7's
  exactly-one-test guard, T9's rename proof, and T12's over-budget proof),
  confirm 100% checkbox completion, inspect the diff for unrelated changes,
  commit, push to `origin/main`, verify the remote head, report `published_head`.
