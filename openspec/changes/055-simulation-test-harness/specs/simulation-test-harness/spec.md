# Spec: simulation-test-harness

## Contract

Headless simulation tests MUST be able to step a set of systems deterministically on an integer tick
counter, snapshot/restore their combined state for deterministic replay, step until a condition with a
bound, and reset scoped sessions. A `SimulationHarness` MUST tick `HarnessSystem`s in registration
order with exact tick numbers, MUST round-trip `snapshot`/`restore` such that replay produces
identical results, MUST bound `stepUntil`, and MUST reject malformed snapshots without mutation.

## Definitions

- **HarnessSystem**: `tick(tick)` + `snapshot()`/`restore(state)` (system-owned serializable state).
- **HarnessSnapshot**: `{ tick, systems: unknown[] }`.

## Invariants

- `step(n)` advances the counter by exactly `n` and ticks systems in registration order with the exact
  tick number.
- `snapshot`/`restore` round-trip exactly; replay from equal snapshots produces equal results.
- `stepUntil` stops at the first tick where the predicate holds, never exceeding `maxSteps`.
- `reset()` restores `initialTick` and each system's initial snapshot.
- `restore` with a malformed snapshot throws without mutating the harness.

## Requirements

### Requirement: exact stepping
`step(n)` MUST advance the tick counter by exactly `n` and tick each system with the exact tick
numbers, in registration order.

#### Scenario: two systems
- **GIVEN** systems A and B (registration order) and `initialTick = 0`
- **WHEN** `step(3)` runs
- **THEN** `tick` is `3`, A's recorded ticks are `[1, 2, 3]`, and B's are `[1, 2, 3]` (A before B per
  tick).

### Requirement: deterministic replay
`snapshot` → step → `snapshot'`; `restore(snapshot)` → step → MUST produce `snapshot'` again.

#### Scenario: replay equality
- **GIVEN** a harness stepped to tick 2
- **WHEN** `snapshot()` is taken, then 5 more steps run and a second snapshot is taken; the first
  snapshot is restored and 5 steps run again
- **THEN** the second and third snapshots are equal.

### Requirement: bounded stepUntil
`stepUntil(predicate, maxSteps)` MUST return the steps taken, stopping at the first true tick and
never exceeding `maxSteps`.

#### Scenario: predicate and bound
- **GIVEN** a predicate true at tick 4 and `maxSteps = 10`
- **WHEN** `stepUntil` runs
- **THEN** it returns `4` and `tick` is `4`; with `maxSteps = 2` it returns `2` and `tick` is `2`.

### Requirement: reset and scoped run
`reset()` MUST restore the initial tick and system states; `run(fn)` MUST leave the harness unchanged
afterward.

#### Scenario: sessions
- **GIVEN** a harness stepped to tick 7
- **WHEN** `reset()` runs, and separately `run((h) => h.step(3))` runs
- **THEN** after `reset()` `tick` is `initialTick` and systems are at their initial states; after
  `run`, `tick` is back to `7`.

### Requirement: snapshot validation
`restore` MUST reject malformed snapshots (wrong shape or system count) without changing the harness.

#### Scenario: malformed restore
- **GIVEN** a harness at some state
- **WHEN** `restore({ tick: 1, systems: [] })` (wrong count) and `restore(null)` run
- **THEN** each throws and the harness state is unchanged.

## Error and failure behavior

- Malformed snapshot → `Error`; harness unchanged.
- System exceptions propagate (test failures surface directly).

## Performance and resource bounds

O(systems × ticks) per step; snapshots O(systems).

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Validate-before-mutate restore prevents corrupt harness state; replay equality gives deterministic
tests.

## Observability

`tick` and snapshots expose the exact simulation position.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Exact stepping | tick count + per-system order/numbers |
| Deterministic replay | restore→step equals fresh snapshot |
| Bounded stepUntil | predicate stop + maxSteps bound |
| Reset and scoped run | reset restores; run leaves unchanged |
| Snapshot validation | malformed restore rejected, unchanged |
