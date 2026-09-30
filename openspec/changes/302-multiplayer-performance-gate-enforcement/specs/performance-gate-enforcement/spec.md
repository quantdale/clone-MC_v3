# Spec: performance-gate-enforcement

## Contract

Every normative performance budget the repository defines MUST be evaluated
automatically on the continuous-integration boundary. A performance budget that
only runs when a human remembers an environment flag is not an enforced budget.

Budgets that are timing-sensitive and therefore invalid under CPU contention MUST
be measured in an isolated context by dedicated automation, and their measured
result MUST be recorded. The shared test suite's behaviour (skipping the isolated
measurement) MUST remain unchanged.

This capability governs enforcement of performance budgets. It does not change
any budget value, measurement logic, or product code.

## Definitions

- **Normative budget**: a `>=`/`<=` performance threshold stated as a MUST in an
  OpenSpec requirement (e.g. REQ-P3 sustained ticks/sec, REQ-P7 elapsed ms).
- **Canonical (isolated) measurement**: a measurement designed to run alone,
  without other test files competing for CPU, guarded by an environment flag so
  it is excluded from the shared full-suite run.
- **Enforcement context**: the automation (a dedicated CI job or an isolated
  invocation) where the budget is evaluated on every candidate.

## Invariants

- A normative performance budget MUST be evaluated in automation on every
  candidate commit.
- An isolated measurement MUST NOT be un-skipped inside the shared full-suite
  run (that would make it contention-sensitive and flaky).
- The measured result of an enforced budget MUST be recorded as evidence.
- No budget value is changed by this capability.

## ADDED Requirements

### Requirement: Normative performance budgets run in automation

Every normative performance budget defined by an OpenSpec requirement MUST be
evaluated by a command that is invoked automatically on the continuous-integration
boundary, so a regression that violates the budget fails the build.

Budgets that require an uncontended environment MUST be invoked in isolation (a
dedicated job, or a dedicated single-file/single-test invocation with a single
worker), not inside the shared full-suite run.

#### Scenario: Throughput budget is enforced

- **GIVEN** a candidate build whose sustained multiplayer throughput falls below
  the normative minimum ticks-per-second
- **WHEN** the enforcement command runs on the candidate
- **THEN** the command exits non-zero and the reported sustained ticks-per-second
  is below the minimum
- **AND** the build fails

#### Scenario: Wall-clock budget is enforced

- **GIVEN** a candidate build whose canonical measurement elapsed time exceeds
  the normative ceiling
- **WHEN** the enforcement command runs
- **THEN** the command exits non-zero and the reported elapsed milliseconds
  exceeds the ceiling

#### Scenario: Isolation

- **WHEN** the enforcement command runs
- **THEN** it executes only the canonical measurement test(s), not the full unit
  suite
- **AND** it runs with a single worker so no other test competes for CPU

### Requirement: A single documented command reproduces the measurement

The repository MUST expose one command that sets the required environment and
runs the canonical measurement in isolation, usable both locally and by
continuous integration. The command MUST be cross-platform (it MUST work on
Windows as well as POSIX shells without requiring a POSIX-only env-var prefix).

#### Scenario: The command runs the canonical measurement

- **WHEN** the command is invoked
- **THEN** the canonical measurement test executes and is not skipped
- **AND** the measured throughput and elapsed time are printed

#### Scenario: Cross-platform invocation

- **GIVEN** a Windows shell and a POSIX shell
- **WHEN** the command is invoked in each
- **THEN** it sets the environment and runs the same canonical measurement in
      both, without requiring the caller to set the environment manually

### Requirement: The shared suite behaviour is unchanged

The canonical measurement MUST remain excluded from the shared full-suite run by
its existing environment guard. The change MUST NOT cause the canonical
measurement to execute inside `npm test`.

#### Scenario: Shared run still skips the canonical test

- **WHEN** `npm test` is executed without the canonical environment
- **THEN** the canonical measurement is reported as skipped, exactly as before the
  change
- **AND** no other test's status changes

#### Scenario: No contention-induced flake in the shared run

- **GIVEN** the shared suite runs under normal load
- **WHEN** `npm test` completes
- **THEN** no test fails because of the canonical measurement being un-skipped

## Error and failure behavior

- If the canonical measurement cannot run (missing harness, environment error),
  the enforcement command MUST exit non-zero with a message naming the cause. It
  MUST NOT report success when the measurement did not execute.
- The enforcement command MUST propagate the measurement's failure exit code.
- If the shared-suite run unexpectedly executes the canonical measurement, that is
  a regression and MUST fail a guard test (see verification).

## Performance and resource bounds

- The enforcement command MUST run a single test file and MUST complete within its
  declared test timeout (the canonical measurement declares a 180 s timeout).
- Enforcement MUST NOT lengthen the shared full-suite run; the canonical
  measurement remains excluded from it.
- The added continuous-integration job/step MUST have a bounded timeout.

## Compatibility and migration

- No product code or measurement-logic change.
- `package.json` gains one command (and possibly one small cross-platform runner
  script).
- The continuous-integration configuration gains one dedicated job or isolated
  step; existing jobs are unchanged.
- No new runtime dependency is introduced; the cross-platform env setting MUST use
  an existing dependency or a node-builtins runner.

## Security and integrity

- An unenforced performance budget allows a regression that could degrade the
  live experience to merge while every automated gate stays green. Wiring the
  budget closes that gap.
- The runner MUST NOT shell out through an unvalidated path or interpolate
  untrusted input; it spawns a fixed command with a fixed argument list.

## Observability

- The command MUST print the measured sustained ticks-per-second, elapsed
  milliseconds, and the budget verdict (the harness already emits a
  `[236 BASELINE_LOAD canonical]` line; the runner MUST surface it).
- The continuous-integration job name MUST identify that it is the isolated
  multiplayer performance measurement.

## Verification mapping

| Requirement | Verification |
|---|---|
| Normative budgets run in automation | Inspect the CI workflow for a dedicated enforcement invocation; confirm it fails on a synthetic over-budget run |
| Single documented command | Invoke the npm command on the current build; confirm it runs the canonical measurement and prints the verdict; confirm it works from a Windows shell |
| Shared suite unchanged | `npm test` still reports the canonical measurement as skipped and the total test set unchanged |
| Recorded evidence | The measured throughput/elapsed values and the CI run reference are recorded in `verification.md` |
