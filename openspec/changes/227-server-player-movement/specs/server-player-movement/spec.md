# Spec: server-player-movement

## Contract

A pure headless server-authoritative movement authority: it owns the authoritative position,
validates each client intent against a per-tick Euclidean speed bound and a strict tick
ordering, and returns a teleport correction on violation. Malformed inputs throw. No world
collision, no IO.

## Definitions

- **Authoritative position**: the server-believed `Position`.
- **Displacement**: Euclidean 3D distance between the submitted intent position and the
  current authoritative position.
- **Tick ordering**: an intent is valid only when its tick is strictly greater than the
  last accepted tick (`t > lastTick`).

## Invariants

- The authoritative `position` is always finite.
- Acceptance requires `t > lastTick` AND `displacement <= maxSpeedPerTick` (inclusive).
- A correction reports the authoritative position without changing it.
- Rule violations return a correction; malformed inputs throw and change nothing.
- `lastTick` starts at 0; before spawn every intent is rejected as stale.
- `reset()` returns to the pristine pre-spawn state.

## Requirements

### Requirement: construction and option validation

`new MovementAuthority(options)` MUST construct with `maxSpeedPerTick` as a positive finite
number; it MUST reject non-positive or non-finite `maxSpeedPerTick` with a descriptive
`MovementAuthority: <detail>` throw naming the field. A fresh authority MUST have
`position {0,0,0}`, `lastTick 0`, `acceptedCount 0`, and `lastRejection null` (and behave as
not-yet-spawned).

#### Scenario: default construction
- **GIVEN** `maxSpeedPerTick: 1`
- **WHEN** `new MovementAuthority({ maxSpeedPerTick: 1 })` is evaluated
- **THEN** `position` is `{0,0,0}`, `lastTick` is 0, `acceptedCount` is 0, `lastRejection`
  is null

#### Scenario: invalid max speed
- **GIVEN** `maxSpeedPerTick: 0` and `maxSpeedPerTick: -2` and `maxSpeedPerTick: 1.5` (no —
  valid), `maxSpeedPerTick: Infinity`
- **WHEN** the authority is constructed
- **THEN** a `MovementAuthority: ...` error is thrown for the non-positive and
  non-positive/non-finite cases, and `1.5` is accepted

### Requirement: spawn placement

`spawn(position, tick)` MUST validate finite coordinates and a non-negative safe-integer
`tick`, throwing `MovementAuthority: <detail>` otherwise and changing nothing. On success
it MUST set the authoritative position and `lastTick`, reset `acceptedCount` to 0, clear
`lastRejection`, and mark the authority spawned. A second `spawn` MUST re-place the
authority (equivalent to a fresh teleport at the given tick).

#### Scenario: spawn sets state
- **GIVEN** a fresh authority
- **WHEN** `spawn({x:10, y:64, z:20}, 5)` is called
- **THEN** `position` is `{10,64,20}`, `lastTick` is 5, `acceptedCount` is 0, `lastRejection`
  is null

#### Scenario: malformed spawn is rejected
- **GIVEN** a fresh authority
- **WHEN** `spawn({x:Infinity, y:0, z:0}, 5)` or `spawn({x:0, y:0, z:0}, -1)` is called
- **THEN** a `MovementAuthority: ...` error is thrown and `position` is unchanged
  (`{0,0,0}`, `lastTick` 0)

### Requirement: intent acceptance

`submitIntent(position, tick)` MUST validate finite coordinates and a non-negative
safe-integer `tick` (throwing `MovementAuthority: <detail>` on malformed input without state
change). When the tick is strictly newer than `lastTick` and the Euclidean displacement from
the authoritative position is `<= maxSpeedPerTick` (inclusive), it MUST accept: update the
authoritative position, advance `lastTick` to `tick`, increment `acceptedCount`, and clear
`lastRejection`, returning `{ accepted: true, position }` with the new position.

#### Scenario: accept an in-bounds newer tick
- **GIVEN** an authority with `maxSpeedPerTick: 1` after `spawn({0,0,0}, 0)`
- **WHEN** `submitIntent({x:0.5, y:0, z:0}, 1)` is called
- **THEN** the result is accepted, `position` is `{0.5,0,0}`, `lastTick` is 1,
  `acceptedCount` is 1, `lastRejection` is null

#### Scenario: accept at the exact speed boundary
- **GIVEN** an authority with `maxSpeedPerTick: 2` after `spawn({0,0,0}, 0)`
- **WHEN** `submitIntent({x:2, y:0, z:0}, 1)` is called
- **THEN** the result is accepted (displacement 2 <= 2)

#### Scenario: accept 3D displacement
- **GIVEN** an authority with `maxSpeedPerTick: 1` after `spawn({0,0,0}, 0)`
- **WHEN** `submitIntent({x:0.57735, y:0.57735, z:0.57735}, 1)` is called (displacement ≈ 1)
- **THEN** the result is accepted

### Requirement: intent corrections

`submitIntent` MUST return a correction (with `correction` equal to the authoritative
position and `reason`) instead of accepting when: the tick is `<= lastTick` (reason
`'stale tick'`), or the displacement exceeds `maxSpeedPerTick` (reason `'speed limit'`).
A corrected intent MUST NOT change the authoritative position, `lastTick`, or
`acceptedCount`, and MUST record `lastRejection` with the tick and reason. Before spawn,
every intent MUST be rejected as stale against `lastTick` 0.

#### Scenario: stale tick is corrected
- **GIVEN** an authority after `spawn({0,0,0}, 5)`
- **WHEN** `submitIntent({x:0.1, y:0, z:0}, 5)` (equal tick) and `submitIntent({x:0.1, y:0, z:0}, 4)`
  (older tick) are called
- **THEN** both return `{ accepted: false, reason: 'stale tick', correction: {0,0,0} }`,
  `position` stays `{0,0,0}`, `acceptedCount` stays 0, `lastRejection` records the last
  reason

#### Scenario: speed limit is corrected
- **GIVEN** an authority with `maxSpeedPerTick: 1` after `spawn({0,0,0}, 0)`
- **WHEN** `submitIntent({x:3, y:0, z:0}, 1)` is called
- **THEN** the result is `{ accepted: false, reason: 'speed limit', correction: {0,0,0} }`,
  `position` stays `{0,0,0}`, `acceptedCount` stays 0

#### Scenario: pre-spawn intents are stale
- **GIVEN** a fresh authority
- **WHEN** `submitIntent({x:0, y:0, z:0}, 1)` is called
- **THEN** it returns `{ accepted: false, reason: 'stale tick', correction: {0,0,0} }`

### Requirement: malformed intent throws

`submitIntent` MUST throw a descriptive `MovementAuthority: <detail>` (and change nothing)
for non-finite coordinates or a non-integer/negative tick.

#### Scenario: malformed coordinates rejected
- **GIVEN** an authority after `spawn({0,0,0}, 0)`
- **WHEN** `submitIntent({x:NaN, y:0, z:0}, 1)` or `submitIntent({x:0, y:0, z:'nope'}, 1)`
  is called
- **THEN** a `MovementAuthority: ...` error is thrown and `position` / `acceptedCount` /
  `lastTick` are unchanged

#### Scenario: malformed tick rejected
- **GIVEN** an authority after `spawn({0,0,0}, 0)`
- **WHEN** `submitIntent({x:0, y:0, z:0}, -1)` or `submitIntent({x:0, y:0, z:0}, 1.5)` is
  called
- **THEN** a `MovementAuthority: ...` error is thrown and state is unchanged

### Requirement: teleport and reset

`teleport(position, tick)` MUST validate finite coordinates and a non-negative safe-integer
`tick` (throwing otherwise), then set the authoritative position and `lastTick` (a server
teleport may reset ordering). `reset()` MUST restore the pristine pre-spawn state (position
`{0,0,0}`, lastTick 0, acceptedCount 0, lastRejection null). Two authorities with identical
options and identical schedules MUST produce identical `position`/`lastTick`/
`acceptedCount`/`lastRejection` at every step.

#### Scenario: teleport repositions and resets ordering
- **GIVEN** an authority after `spawn({0,0,0}, 0)` and several accepted intents
- **WHEN** `teleport({x:100, y:80, z:100}, 50)` is called
- **THEN** `position` is `{100,80,100}`, `lastTick` is 50

#### Scenario: reset restores pristine state
- **GIVEN** an authority that has spawned, accepted, and been corrected
- **WHEN** `reset()` is called
- **THEN** it matches the pristine construction state (position `{0,0,0}`, lastTick 0,
  acceptedCount 0, lastRejection null)

#### Scenario: identical schedules produce identical state
- **GIVEN** two authorities with `maxSpeedPerTick: 1`
- **WHEN** both run `spawn({0,0,0}, 0)`, `submitIntent({0.5,0,0}, 1)`, `submitIntent({2,0,0}, 2)`
  (rejected), `teleport({10,64,10}, 20)`, then `submitIntent({10.5,64,10}, 21)`
- **THEN** both yield equal `position`, `lastTick`, `acceptedCount`, and `lastRejection` at
  each step

## Error and failure behavior

- Malformed inputs (non-finite coords, non-integer/negative tick): `MovementAuthority:
  <detail>` throws, no state change.
- Rule violations: correction result with exact reason; position intact; `lastRejection`
  recorded.

## Performance and resource bounds

- Each intent O(1) (one Euclidean distance); no arrays/allocation beyond result objects;
  memory O(1) state. No timers, IO, DOM, or network.

## Compatibility and migration

Additive: new exported names only; no registry, save format, or existing public API
changes. `lastTick` starts at 0 so pre-spawn intents are deterministically stale.

## Security and integrity

- No external inputs besides numbers; no storage or network access.
- Integrity: malformed intents cannot corrupt the authoritative state; corrections never
  move the authoritative position.

## Observability

- `position`, `lastTick`, `acceptedCount`, `lastRejection`, and exact
  `MovementAuthority: <detail>` error strings provide full passive observability.

## Verification mapping

| Requirement | Evidence |
|---|---|
| REQ construction and option validation | `tests/unit/MovementAuthority.test.ts` › construction |
| REQ spawn placement | › spawn |
| REQ intent acceptance | › acceptance |
| REQ intent corrections | › corrections |
| REQ malformed intent throws | › malformed |
| REQ teleport and reset | › teleport/reset |
