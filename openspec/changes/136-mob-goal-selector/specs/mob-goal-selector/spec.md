# Spec: mob-goal-selector

## Contract
This capability adds a generic, prioritized, interruptible AI goal scheduler: `GoalSelector` runs a
per-mob set of `Goal`s each tick, starting the highest-priority goal(s) that want to run and whose
`flags` don't conflict, interrupting a running lower-priority goal that loses a flag contest, and
calling the `start`/`tick`/`stop` lifecycle hooks in a well-defined order. No concrete goal
implementations and no `Game`/mob wiring — see the proposal's Non-goals.

## Definitions
- **Goal**: an object with `flags` (the `GoalFlag`s it needs while running), `canUse()` (may it
  start), optional `canContinueToUse()` (may it keep running; defaults to re-checking `canUse()`),
  and optional `start`/`tick`/`stop` lifecycle hooks.
- **Goal flag**: one of `Move`, `Look`, `Jump`, `Target` — a mutual-exclusion category.
- **Priority**: a number registered alongside a goal via `addGoal`; lower runs first when goals
  compete for the same flag. Ties are broken by `addGoal` call order.
- **Selected**: a goal chosen to run during one `tick()` call, per the flag-contention rule.
- **Running**: a goal whose `start()` has been called more recently than its `stop()`.

## Invariants
- Goals are evaluated in ascending-priority, then-insertion order, every `tick()` call.
- A goal is selected only when it wants to run (per its running/not-running check) AND none of its
  `flags` were already claimed by an earlier-evaluated (higher-priority-or-equal-priority-earlier-
  inserted) goal selected this tick.
- Every goal that was running but is not selected this tick has `stop()` called, before any newly
  selected goal's `start()`.
- Every goal that is running after this tick's start/stop transitions has `tick()` called.
- `getRunning()` always reflects exactly the currently-running goal set.

## Requirements

### Requirement: the highest-priority eligible goal is selected and started
`GoalSelector.tick()` MUST call `start()` on a goal that is not yet running, whose `canUse()` returns
`true`, and whose `flags` don't conflict with any higher-priority goal selected in the same tick.

#### Scenario: a single eligible goal starts
- **GIVEN** one goal with `canUse()` returning `true` and no competing goals
- **WHEN** `tick()` is called
- **THEN** the goal's `start()` is called once, then its `tick()` is called, and `getRunning()`
  includes it

### Requirement: a higher-priority goal interrupts a lower-priority running goal sharing a flag
When a lower-priority-number goal newly becomes eligible and shares a `GoalFlag` with an
already-running higher-priority-number (lower-precedence) goal, `GoalSelector.tick()` MUST call
`stop()` on the lower-precedence goal and `start()` on the higher-precedence one in the same `tick()`
call.

#### Scenario: a priority-0 goal interrupts a running priority-5 goal sharing Move
- **GIVEN** a priority-5 `Move`-flagged goal already running, and a priority-0 `Move`-flagged goal
  whose `canUse()` becomes `true`
- **WHEN** `tick()` is called
- **THEN** the priority-5 goal's `stop()` is called, the priority-0 goal's `start()` is called, and
  `getRunning()` contains only the priority-0 goal

### Requirement: goals with disjoint flags run simultaneously
`GoalSelector.tick()` MUST select and run two or more eligible goals at once when their `flags` sets
are disjoint, regardless of relative priority.

#### Scenario: a Move goal and a Look goal run together
- **GIVEN** a `Move`-flagged goal and a `Look`-flagged goal, both eligible
- **WHEN** `tick()` is called
- **THEN** both are started and both appear in `getRunning()`

### Requirement: a running goal stops when it no longer wants to continue
`GoalSelector.tick()` MUST call `stop()` on a running goal whose `canContinueToUse()` (or, when
absent, `canUse()`) now returns `false`, even when no other goal contests its flags.

#### Scenario: canContinueToUse turning false stops the goal alone
- **GIVEN** a running goal whose `canContinueToUse()` now returns `false`, with no competing goal
- **WHEN** `tick()` is called
- **THEN** its `stop()` is called and it is absent from `getRunning()` afterward

#### Scenario: absent canContinueToUse falls back to canUse
- **GIVEN** a running goal with no `canContinueToUse` whose `canUse()` now returns `false`
- **WHEN** `tick()` is called
- **THEN** its `stop()` is called

### Requirement: lifecycle ordering is stop-before-start, tick only for goals still running
`GoalSelector.tick()` MUST call every dropped goal's `stop()` before calling any newly selected
goal's `start()`, and MUST call `tick()` only on goals that are running after this tick's
start/stop transitions.

#### Scenario: stop is called before the interrupting goal's start
- **GIVEN** the interruption scenario above (priority-0 interrupts priority-5)
- **WHEN** `tick()` is called
- **THEN** the priority-5 goal's `stop()` is observed (via call-order recording) before the
  priority-0 goal's `start()`

#### Scenario: a goal that stopped this tick does not receive tick()
- **GIVEN** a goal that is stopped this tick (per either interruption or `canContinueToUse` failing)
- **WHEN** `tick()` is called
- **THEN** that goal's `tick()` is NOT called during this call

### Requirement: removeGoal and clear manage goal membership and running state correctly
`removeGoal(goal)` MUST call `stop()` on `goal` if it is currently running and remove it from future
selection; a goal never added is a no-op. `clear()` MUST call `stop()` on every currently running
goal and remove all goals from future selection.

#### Scenario: removing a running goal stops it
- **GIVEN** a running goal
- **WHEN** `removeGoal(goal)` is called
- **THEN** its `stop()` is called, it is absent from `getRunning()`, and a subsequent `tick()` never
  selects it again

#### Scenario: clear stops every running goal
- **GIVEN** two running goals with disjoint flags
- **WHEN** `clear()` is called
- **THEN** both `stop()`s are called and `getRunning()` is empty

## Error and failure behavior
- `GoalSelector` adds no error handling around a `Goal`'s own hooks; a throwing `canUse`/
  `canContinueToUse`/`start`/`tick`/`stop` propagates unmodified.
- `removeGoal` on a never-added goal and `clear()` on an empty selector are safe no-ops.

## Performance and resource bounds
- `tick()` is O(n) over the registered goal count per call (the priority list is kept sorted
  incrementally by `addGoal`, so `tick()` itself does not re-sort).

## Compatibility and migration
- One new, dependency-free file (`src/simulation/GoalSelector.ts`); no edits to any existing module.
  No schema/save-format change; no migration.

## Security and integrity
- All scheduling state (`running` set, priority list) is local to one `GoalSelector` instance; no
  shared mutable state exists between instances.

## Observability
- `getRunning()` exposes the exact running-goal set for inspection without additional
  instrumentation.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 highest-priority eligible goal starts | `tests/unit/GoalSelector.test.ts` single-goal case |
| REQ-2 higher-priority interrupts lower-priority sharing a flag | `tests/unit/GoalSelector.test.ts` interruption case |
| REQ-3 disjoint-flag goals run simultaneously | `tests/unit/GoalSelector.test.ts` disjoint-flags case |
| REQ-4 canContinueToUse/canUse stop a running goal | `tests/unit/GoalSelector.test.ts` continuation cases |
| REQ-5 stop-before-start, tick only for running | `tests/unit/GoalSelector.test.ts` lifecycle-order cases |
| REQ-6 removeGoal/clear manage membership | `tests/unit/GoalSelector.test.ts` removeGoal/clear cases |
