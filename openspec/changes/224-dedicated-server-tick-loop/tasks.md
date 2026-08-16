# Tasks: 224-dedicated-server-tick-loop

## Group 1: Implementation and focused tests

- [x] Implement `src/simulation/WorldTickProcess.ts` — `TickSystem`, `WorldTickProcessOptions`,
      and `WorldTickProcess` with options validation (`WorldTickProcess: <detail>` throws),
      clock defaulting/injection, `update`/`step`/`runTicks`, tick counter, `isRunning`/
      `isStopped`/`lastError` getters, and `reset()`.
- [x] Unit tests: construction — default options, empty systems, valid single/multiple systems,
      every option-rejection class (non-array systems, non-tickable entry with index, invalid
      clock).
- [x] Unit tests: update-driven ticking — first-call anchoring (returns 0), batching several
      ticks in one call with correct return, registration order, exactly-once semantics,
      1-based tick numbers, non-finite timestamp no-op.
- [x] Unit tests: bounded catch-up — injected clock with `maxTicksPerFrame: 2`, cap respected,
      remainder capped (next small advance yields at most one tick).
- [x] Unit tests: stepping — `step()`/`step(n)` counts and tick numbers, `step(0)`,
      `step(-2)`, `step(2.5)` no-ops, interleaving `update`/`step` keeps numbers monotonic.
- [x] Unit tests: counter/clock/reset — `tick` equals completed ticks, `isRunning` follows
      the clock, `reset()` zeroes counter, clears stopped/error, re-anchors the clock, and
      restarts numbering at 1.
- [x] Unit tests: failure behavior — mid-tick throw stops the process, failed tick not
      counted, later systems skipped, error rethrown, subsequent driving calls rethrow the
      same value until `reset()`, ticking resumes after reset.
- [x] Unit tests: determinism — identical systems + identical scripted schedules produce
      identical recorded call sequences; empty-systems process ticks without error.

## Group 2: Integration and regression

- [x] `npm run typecheck` and `npm run lint` clean.
- [x] Full unit suite `npm test` green (expect 2872 + new count; document any transient
      grid-sweep load-flake re-pass in isolation as before).
- [x] `npm run build` and `npm run test:e2e` green (22/22).

## Group 3: State, docs, publication

- [x] Update `openspec/PROGRAM_STATE.json` (currentChange 224 VERIFIED, completedTasks,
      validationResults entry with the feature head) and `openspec/PROGRAM_STATE.md`
      (checkpoint block + "What 224 implemented" section; next 225-connection-lifecycle).
- [x] Commit feature + state advance, push to `origin/main`, verify published head matches
      local HEAD, and report the session.
