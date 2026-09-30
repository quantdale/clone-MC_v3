# Proposal: 302-multiplayer-performance-gate-enforcement

## Problem

The repository contains a **normative multiplayer performance budget** that is
**never executed by any automation**. Change 236 (`236-multiplayer-load-tests`)
defined hard requirements — sustained throughput `>= 200 ticks/sec` (REQ-P3) and
an elapsed ceiling `<= 6000 ms` for 1200 ticks (REQ-P7) — and implemented them
as the *canonical* test that only runs when an environment flag is set:

```ts
// tests/unit/multi-client-performance.test.ts:319
it.skipIf(process.env.MC_CANONICAL !== '1')(
  'canonical isolated measurement sustains >= 200 ticks/sec within 6000 ms',
  () => { /* REQ-P3 / REQ-P7 verdict */ },
  180000,
);
```

That is the **only** test that asserts the throughput and elapsed verdicts.
Nothing sets `MC_CANONICAL`:

* not `.github/workflows/ci.yml` (grep returns no match),
* not `package.json` (no script sets it),
* not `scripts/` (no script sets it).

The always-run test in the same file explicitly disclaims the verdict
("the throughput/elapsed verdict lives in the canonical test below") and checks
only the structural per-client ceilings. Net effect: **the multiplayer
throughput/wall-clock budget is a documented MUST that nothing ever enforces.**
A performance regression that drops sustained ticks below 200 — or a wall-clock
regression past 6 s — merges green.

This is a specific instance of a general pattern (also seen in the visual gate,
change 300, and the un-wired scripts, change 301): the repository writes
excellent, normative performance and correctness gates, then leaves the *run
them automatically* step to human memory.

## Inspection findings (base `2ecf781`)

- `tests/unit/multi-client-performance.test.ts:319` — the canonical REQ-P3/REQ-P7
  test is gated on `process.env.MC_CANONICAL === '1'`.
- The comment immediately above it documents the invocation as a manual step:
  `"run alone via MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts
  (no other test file competes for CPU)"`.
- `grep -rn "MC_CANONICAL" .` (excluding `node_modules`) matches **only
  OpenSpec documentation** — `openspec/changes/236-multiplayer-load-tests/*`,
  `openspec/evidence/changes/236.md`, `openspec/hardening/…/verification.md`,
  `openspec/PROGRAM_STATE.json`. It appears in **no CI workflow, no npm script,
  and no runnable script**.
- The normative budgets from the change-236 spec
  (`openspec/changes/236-multiplayer-load-tests/specs/multi-client-performance-fixtures/spec.md`):
  - REQ-P3 (`>= minTicksPerSecond = 200`),
  - REQ-P7 (`<= maxElapsedMsForTicks = 6000`, `maxChunkAddedPerClient = 81`,
    `maxEntitySpawnedPerClient`, `maxInventoryAcceptedPerClient`).
- The always-run structural test (same file, ~line 280–311) asserts only the
  per-client structural ceilings and prints the throughput line without asserting
  it.

## Goals

1. Make the normative multiplayer throughput and wall-clock budgets
   (REQ-P3, REQ-P7) **actually enforced on the continuous-integration boundary**
   in a way that isolates CPU contention (the reason the test was made canonical
   in the first place).
2. Keep the verdict reproducible and non-flaky on shared CI runners by isolating
   the measurement.
3. Provide a single documented command that reproduces the canonical measurement
   for local use and for change verification evidence.

## Non-goals

- No change to the multiplayer simulation, budget constants, or the measurement
  code.
- No raising or lowering `minTicksPerSecond` / `maxElapsedMsForTicks`.
- No 258 headed hardware-WebGL work.
- No change to the shared/CI unit job's runtime budget beyond adding one
   dedicated job for the isolated measurement.

## Preconditions

- 298 and 301 recommended predecessors (a trustworthy gate surface and a
  documented command catalogue) so the new job is consistent with the rest of
  the automation.

## Dependencies

- **301**: the new npm script and CI job should be registered in the same
  catalogue; coordinate so both changes do not edit `package.json`/`ci.yml`
  without ordering.
- **298**: a green local unit gate makes a "green except the canonical
  multiplayer test is skipped locally" state legible.

## Proposed change

### 1. Expose the canonical measurement as a command

Add an npm script that runs the canonical measurement in isolation, so it no
longer depends on a human remembering an ad-hoc command line:

```
"test:perf:multiplayer": "cross-env MC_CANONICAL=1 vitest run tests/unit/multi-client-performance.test.ts -t 'canonical isolated measurement'"
```

On Windows (the authoring host) `MC_CANONICAL=1 vitest …` does not work as a
POSIX prefix; use the repo's existing cross-platform approach (either
`cross-env`, or a tiny node runner that sets `env` before spawning vitest, or
vitest's `--` env handling). Prefer a small `scripts/run-canonical-multiplayer.mjs`
that sets the env and spawns vitest, to avoid adding a dependency.

### 2. Add a dedicated CI job for the isolated measurement

Add a third job to `.github/workflows/ci.yml` (or a step in the existing `gate`
job that runs the file **exclusively**):

```
- run: npm ci
- run: npm run test:perf:multiplayer
```

Rationale for isolation: the canonical measurement is meaningless under CPU
contention ("no other test file competes for CPU"). Running it inside the
full 5700-test suite would reintroduce exactly the contention the `skipIf`
was created to avoid. Therefore it MUST run as a **dedicated job** (or a
dedicated `vitest run <file> -t '<canonical>'` invocation) with `workers: 1`,
not as part of `npm test`. This job is fast (one file, one test, 180 s timeout).

### 3. Keep `npm test` semantics unchanged

The canonical test remains `skipIf(MC_CANONICAL !== '1')` so that the normal
full-suite run is unchanged and does not become flaky. The enforcement happens
via the dedicated job/command, not by un-skipping it in the shared run.

### 4. Document and surface the result

- Record the measured `sustainedTps` / `elapsedMs` in the change's
  `verification.md` and cite the CI run.
- Add the command to the `ONBOARDING.md` gate catalogue (change 301) and to
  `AGENTS.md` "Baseline verification" as a multiplayer-specific note.

## Compatibility and migration

- No product code or data change.
- `package.json` gains one script (plus possibly a tiny runner script).
- CI gains one job or one isolated step; existing `gate` and `e2e` jobs are
  unchanged.
- The dedicated job adds a small amount of CI wall-clock (one test file, bounded
  by a 180 s timeout).

## Risks

- **CI runner contention still makes the verdict flaky.** The measurement is
  timing-based; a busy runner could drop below 200 tps even with correct code.
  Mitigation: run with `workers: 1` in a dedicated job; if it proves flaky on
  hosted runners, add a documented small margin below the budget **only** with
  recorded evidence, or mark the job `continue-on-error` with a **tracked**
  follow-up — never silently green it.
- **Accidentally un-skipping in the shared run.** Mitigation: `skipIf` remains;
  the new path is a separate command. A regression test can assert the shared
  `npm test` still reports the canonical test as skipped.

## Rollback strategy

Remove the npm script, the runner (if any), and the CI job. The `skipIf` in the
test file is untouched by this change, so behaviour reverts cleanly.

## Definition of Done

- `npm run test:perf:multiplayer` runs the canonical REQ-P3/REQ-P7 measurement and
  reports a verdict on the current build.
- CI runs that command in isolation and fails the build when sustained ticks fall
  below `minTicksPerSecond` (200) or elapsed time exceeds `maxElapsedMsForTicks`
  (6000).
- `npm test` still skips the canonical test (unchanged shared-suite behaviour).
- The measured `sustainedTps` and `elapsedMs` are recorded in `verification.md`
  with a CI run reference.
- The command is listed in the gate catalogue / `ONBOARDING.md`.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run validate-state`, `npm run test:e2e` all PASS.

## Advancement gate

The canonical multiplayer measurement must PASS on the candidate SHA in CI. A
build where REQ-P3 or REQ-P7 fails MUST NOT advance; fix or explicitly
re-baseline with evidence. Completion target 100%.
