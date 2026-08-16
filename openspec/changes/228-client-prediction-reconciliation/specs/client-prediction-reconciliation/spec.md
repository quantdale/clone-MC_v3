# Spec: client-prediction-reconciliation

## Contract

A pure headless client-side movement reconciler: it holds a local predicted position, a
confirmed tick, and a bounded buffer of pending movement intents. `predict` locally advances
the predicted position and buffers the intent; `reconcile` snaps to the authoritative server
position for that tick and replays newer buffered intents. Stale corrections are ignored.
Malformed inputs throw without mutating state. No render interpolation, no networking, no IO.

## Definitions

- **Predicted position**: the client-estimated `Position` reflecting local input.
- **Confirmed tick**: the newest authoritative tick acknowledged by the server.
- **Pending intent**: a `{ tick, position }` record of a locally-applied prediction awaiting server
  confirmation.
- **Reconciliation**: snapping to an authoritative position for a tick, dropping acknowledged
  intents (`tick <= authoritativeTick`), and replaying surviving intents (`tick > authoritativeTick`).

## Invariants

- The predicted `position` is always finite.
- `predict(position, tick)` requires `tick > confirmedTick` and finite coordinates.
- If pending intent buffer length reaches `maxPending`, `predict` throws before mutating state.
- `reconcile(authoritativePosition, authoritativeTick)` applies only when `authoritativeTick > confirmedTick`;
  stale corrections (`authoritativeTick <= confirmedTick`) are silent no-ops.
- On a newer correction, `predicted` snaps to `authoritativePosition`, then all surviving pending
  intents (`tick > authoritativeTick`) are re-applied in chronological tick order.
- Malformed inputs throw descriptive `MovementReconciler: <detail>` errors without mutating state.
- `reset()` restores pristine pre-prediction state.

## Requirements

### Requirement: construction and option validation

`new MovementReconciler(options?)` MUST construct with `maxPending` as an optional positive integer
(defaulting to 1024). It MUST reject non-positive, non-integer, or non-finite `maxPending` with a
descriptive `MovementReconciler: <detail>` throw naming the issue. A fresh reconciler MUST have
`predicted {x: 0, y: 0, z: 0}`, `confirmedTick 0`, `pendingCount 0`, and an empty `pending` array.

#### Scenario: default construction
- **GIVEN** no options provided
- **WHEN** `new MovementReconciler()` is evaluated
- **THEN** `predicted` is `{x: 0, y: 0, z: 0}`, `confirmedTick` is 0, `pendingCount` is 0, and
  `pending` is empty

#### Scenario: custom valid maxPending
- **GIVEN** `maxPending: 64`
- **WHEN** `new MovementReconciler({ maxPending: 64 })` is evaluated
- **THEN** the reconciler is created successfully with pristine state

#### Scenario: invalid maxPending
- **GIVEN** `maxPending: 0`, `maxPending: -5`, `maxPending: 1.5`, or `maxPending: Infinity`
- **WHEN** `new MovementReconciler({ maxPending: ... })` is called
- **THEN** a `MovementReconciler: ...` error is thrown

### Requirement: local prediction

`predict(position, tick)` MUST validate finite coordinates and a non-negative safe-integer `tick`
strictly greater than `confirmedTick` (`tick > confirmedTick`). If the pending buffer has reached
`maxPending`, it MUST throw `MovementReconciler: pending buffer full` BEFORE any state mutation.
On success, it MUST set `predicted` to a copy of `position` and append `{ tick, position }` to
the pending buffer.

#### Scenario: valid prediction advances predicted position and buffer
- **GIVEN** a pristine reconciler
- **WHEN** `predict({ x: 1, y: 64, z: 2 }, 1)` is called
- **THEN** `predicted` is `{ x: 1, y: 64, z: 2 }`, `pendingCount` is 1, and `pending` contains
  `{ tick: 1, position: { x: 1, y: 64, z: 2 } }`

#### Scenario: multiple sequential predictions
- **GIVEN** a reconciler after `predict({ x: 1, y: 0, z: 0 }, 1)`
- **WHEN** `predict({ x: 2, y: 0, z: 0 }, 2)` and `predict({ x: 3, y: 0, z: 0 }, 3)` are called
- **THEN** `predicted` is `{ x: 3, y: 0, z: 0 }`, `pendingCount` is 3, and `pending` lists all 3
  intents in order

#### Scenario: buffer full rejection
- **GIVEN** a reconciler created with `maxPending: 2` and already holding 2 pending intents at ticks 1 and 2
- **WHEN** `predict({ x: 3, y: 0, z: 0 }, 3)` is called
- **THEN** a `MovementReconciler: pending buffer full` error is thrown and `predicted` remains at the
  tick-2 position with `pendingCount` 2

### Requirement: reconciliation with authoritative corrections

`reconcile(authoritativePosition, authoritativeTick)` MUST validate finite coordinates and a
non-negative safe-integer `authoritativeTick`. If `authoritativeTick <= confirmedTick`, it MUST
be treated as a stale correction and result in a silent no-op. If `authoritativeTick > confirmedTick`,
it MUST:
1. advance `confirmedTick` to `authoritativeTick`;
2. snap `predicted` to `authoritativePosition`;
3. drop all pending intents with `tick <= authoritativeTick`;
4. replay each surviving pending intent (`tick > authoritativeTick`) in ascending tick order,
   updating `predicted` to each intent's position in turn.

#### Scenario: authoritative confirmation matches prediction
- **GIVEN** predictions at tick 1 (`{1,0,0}`) and tick 2 (`{2,0,0}`)
- **WHEN** `reconcile({ x: 1, y: 0, z: 0 }, 1)` is called
- **THEN** `confirmedTick` becomes 1, the tick-1 intent is removed, the tick-2 intent is replayed,
  `predicted` remains `{2,0,0}`, and `pendingCount` is 1

#### Scenario: authoritative correction snaps and replays newer intents
- **GIVEN** predictions at tick 1 (`{10,0,0}`) and tick 2 (`{20,0,0}`)
- **WHEN** the server corrects tick 1 to `{ x: 5, y: 0, z: 0 }` via `reconcile({ x: 5, y: 0, z: 0 }, 1)`
- **THEN** `confirmedTick` becomes 1, tick-1 is dropped, tick-2 is replayed setting `predicted` to
  `{20,0,0}`, and `pendingCount` is 1

#### Scenario: authoritative correction with no surviving intents
- **GIVEN** predictions at tick 1 (`{10,0,0}`) and tick 2 (`{20,0,0}`)
- **WHEN** `reconcile({ x: 15, y: 0, z: 0 }, 2)` is called
- **THEN** `confirmedTick` becomes 2, all pending intents are dropped (`pendingCount` 0), and
  `predicted` is `{15,0,0}`

#### Scenario: stale correction is ignored
- **GIVEN** a reconciler with `confirmedTick` 5 and `predicted` `{10,0,0}`
- **WHEN** `reconcile({ x: 0, y: 0, z: 0 }, 5)` (equal tick) or `reconcile({ x: 0, y: 0, z: 0 }, 3)`
  (older tick) is called
- **THEN** state is untouched (`confirmedTick` 5, `predicted` `{10,0,0}`)

### Requirement: malformed input validation

`predict` and `reconcile` MUST throw a descriptive `MovementReconciler: <detail>` error and leave
state completely unchanged when supplied with:
- Non-finite coordinates (`NaN`, `Infinity`, non-number);
- Non-integer or negative ticks;
- For `predict`: `tick <= confirmedTick`.

#### Scenario: malformed coordinates rejected
- **GIVEN** a reconciler
- **WHEN** `predict({ x: NaN, y: 0, z: 0 }, 1)` or `reconcile({ x: 0, y: Infinity, z: 0 }, 1)` is called
- **THEN** a `MovementReconciler: ...` error is thrown and state is unchanged

#### Scenario: malformed tick rejected
- **GIVEN** a reconciler
- **WHEN** `predict({ x: 0, y: 0, z: 0 }, -1)` or `reconcile({ x: 0, y: 0, z: 0 }, 1.5)` is called
- **THEN** a `MovementReconciler: ...` error is thrown and state is unchanged

#### Scenario: prediction tick not newer than confirmed tick rejected
- **GIVEN** a reconciler with `confirmedTick` 3
- **WHEN** `predict({ x: 1, y: 0, z: 0 }, 3)` or `predict({ x: 1, y: 0, z: 0 }, 2)` is called
- **THEN** a `MovementReconciler: ...` error is thrown and state is unchanged

### Requirement: reset and determinism

`reset()` MUST restore the reconciler to its pristine pre-prediction state (`predicted {0,0,0}`,
`confirmedTick 0`, `pendingCount 0`, `pending []`). Two reconcilers with identical options and
identical schedules of `predict` and `reconcile` calls MUST produce identical `predicted`,
`confirmedTick`, `pendingCount`, and `pending` snapshots at every step.

#### Scenario: reset restores pristine state
- **GIVEN** a reconciler with multiple predictions and reconciliations
- **WHEN** `reset()` is called
- **THEN** `predicted` is `{0,0,0}`, `confirmedTick` is 0, `pendingCount` is 0, and `pending` is empty

#### Scenario: identical schedules produce identical state
- **GIVEN** two reconcilers constructed with default options
- **WHEN** both execute the exact same sequence of `predict` and `reconcile` operations
- **THEN** both yield identical `predicted`, `confirmedTick`, `pendingCount`, and `pending` snapshots
  at every step

## Error and failure behavior

- Malformed inputs: `MovementReconciler: <detail>` throws; no state change.
- Buffer overflow: `MovementReconciler: pending buffer full` throws; no state change.
- Stale corrections: silent no-op; position and buffer intact.

## Performance and resource bounds

- `predict` is O(1) time complexity.
- `reconcile` is O(P) where P <= maxPending is the number of pending intents in the buffer.
- Memory is bounded by O(maxPending).
- Zero timers, IO, DOM, or network operations.

## Compatibility and migration

Additive: new exported types and classes in `src/simulation/MovementReconciler.ts`. No registry,
save format, or existing public API modifications.

## Security and integrity

- All inputs are strictly checked for numeric validity and bounds.
- Malformed intents or corrections cannot corrupt the reconciler state.
- Buffer is bounded preventing unbounded memory consumption.

## Observability

- `predicted`, `confirmedTick`, `pendingCount`, and `pending` getters provide complete passive
  observability.
- Exact `MovementReconciler: <detail>` error messages.

## Verification mapping

| Requirement | Evidence |
|---|---|
| REQ construction and option validation | `tests/unit/MovementReconciler.test.ts` › construction |
| REQ local prediction | › prediction |
| REQ reconciliation with authoritative corrections | › reconciliation |
| REQ malformed input validation | › malformed |
| REQ reset and determinism | › reset and determinism |
