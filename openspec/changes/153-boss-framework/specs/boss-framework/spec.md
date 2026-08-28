# Spec: boss-framework

## Contract
This capability adds a reusable boss framework: a validated boss-definition registry, an immutable
health/phase/arena-lifecycle state machine, a boss-bar HUD projection, and a strict
serialize/deserialize codec. No boss entity types, no AI/attacks, no arena block generation, no HUD
rendering, no event-bus wiring, no persistence store, no `Game` wiring — see the proposal's
Non-goals.

## Definitions
- **Definition**: a `BossDefinition` — identity, `maxHealth`, an ordered descending-threshold phase
  list, and a bar color.
- **Phase**: a `BossPhase` — a name and the health *fraction* at or below which it becomes active.
- **Defeated**: a `BossState` whose `status` is `DEFEATED` (reached at `health === 0`).

## Invariants
- Every transition returns a new state and never mutates its input.
- `health` stays within `[0, maxHealth]`; `phaseIndex` is always a valid index into `phases` and
  always matches `phaseForHealthFraction` for the current health.
- `status` progresses `SPAWNING → ACTIVE → DEFEATED` only; a `DEFEATED` boss is never changed again.
- A registered definition always has `maxHealth > 0`, at least one phase, thresholds in `[0, 1]`
  strictly descending, and `phases[0].healthThreshold === 1`.
- `bossBarSnapshot(...).progress` is always in `[0, 1]`.

## Requirements

### Requirement: BossRegistry validates every definition before registering it
`BossRegistry`'s constructor MUST throw for a definition with a non-positive `maxHealth`, an empty
phase list, a `healthThreshold` outside `[0, 1]`, non-strictly-descending thresholds, or a first
threshold other than `1`; and MUST register and finalize valid definitions.

#### Scenario: the default registry builds and looks up by key
- **GIVEN** `createDefaultBossRegistry()`
- **WHEN** `getByKey('ender_dragon')` is called
- **THEN** it returns a definition with `maxHealth > 0` and at least two phases, and the registry
  reports `finalized === true`

#### Scenario: a non-positive maxHealth is rejected
- **GIVEN** a definition with `maxHealth: 0`
- **WHEN** a `BossRegistry` is constructed with it
- **THEN** it throws

#### Scenario: an empty phase list is rejected
- **GIVEN** a definition with `phases: []`
- **WHEN** a `BossRegistry` is constructed with it
- **THEN** it throws

#### Scenario: ascending thresholds are rejected
- **GIVEN** a definition whose phase thresholds ascend (e.g. `1` then `1`, or `0.5` then `0.8`)
- **WHEN** a `BossRegistry` is constructed with it
- **THEN** it throws

#### Scenario: a first threshold below 1 is rejected
- **GIVEN** a definition whose first phase threshold is `0.9`
- **WHEN** a `BossRegistry` is constructed with it
- **THEN** it throws

### Requirement: phaseForHealthFraction resolves the correct phase
`phaseForHealthFraction(definition, fraction)` MUST clamp `fraction` into `[0, 1]` and return the
index of the last phase whose `healthThreshold` is `>=` that fraction.

#### Scenario: full health resolves to the first phase
- **GIVEN** a definition with phases at `1`, `0.6`, `0.25`
- **WHEN** `phaseForHealthFraction(definition, 1)` is called
- **THEN** it returns `0`

#### Scenario: a fraction at a threshold enters that phase
- **GIVEN** the same definition
- **WHEN** `phaseForHealthFraction(definition, 0.6)` is called
- **THEN** it returns `1`

#### Scenario: a fraction below the last threshold resolves to the last phase
- **GIVEN** the same definition
- **WHEN** `phaseForHealthFraction(definition, 0)` is called
- **THEN** it returns `2`

#### Scenario: an out-of-range fraction is clamped
- **GIVEN** the same definition
- **WHEN** `phaseForHealthFraction` is called with `5` and with `-5`
- **THEN** they return `0` and `2` respectively

### Requirement: startBossFight produces a full-health SPAWNING boss
`startBossFight(definition)` MUST return a state with `status: 'SPAWNING'`, `health` equal to
`maxHealth`, `phaseIndex: 0`, and `ticks: 0`.

#### Scenario: a fight starts at full health in phase 0
- **GIVEN** any valid definition
- **WHEN** `startBossFight` is called
- **THEN** the state is `SPAWNING` at `maxHealth`, phase `0`, tick `0`

### Requirement: damageBoss reduces health, recomputes the phase, and reports transitions
`damageBoss` MUST reduce `health` by `amount` floored at `0`, recompute `phaseIndex`, set
`status: 'DEFEATED'` when health reaches `0`, and report `phaseChanged`/`defeated`. It MUST be a
no-op (both flags `false`) for a non-positive/non-finite amount or an already-`DEFEATED` boss.

#### Scenario: damage reduces health without changing phase
- **GIVEN** a boss at full health whose first phase spans well above the damage taken
- **WHEN** `damageBoss` is called with a small amount
- **THEN** health drops by that amount, `phaseChanged` is `false`, and `defeated` is `false`

#### Scenario: crossing a threshold reports a phase change
- **GIVEN** a boss at full health
- **WHEN** enough damage is applied to fall below the second phase's threshold
- **THEN** `phaseChanged` is `true` and the state's `phaseIndex` increased

#### Scenario: lethal damage defeats the boss exactly once
- **GIVEN** a boss with health remaining
- **WHEN** `damageBoss` is called with more than its remaining health, then called again
- **THEN** the first call returns `health: 0`, `status: 'DEFEATED'`, `defeated: true`; the second
  returns the same state with `defeated: false`

#### Scenario: a non-positive amount is a no-op
- **GIVEN** any active boss
- **WHEN** `damageBoss` is called with `0`, a negative amount, or `NaN`
- **THEN** the state is unchanged and both flags are `false`

### Requirement: healBoss restores health without reviving a defeated boss
`healBoss` MUST increase `health` capped at `maxHealth`, recompute `phaseIndex`, ignore
non-positive/non-finite amounts, and return a `DEFEATED` boss unchanged.

#### Scenario: healing restores an earlier phase
- **GIVEN** a damaged boss in a later phase
- **WHEN** it is healed back above that phase's threshold
- **THEN** `phaseIndex` returns to the earlier phase

#### Scenario: healing is capped at maxHealth
- **GIVEN** a boss at partial health
- **WHEN** it is healed by far more than its missing health
- **THEN** `health` equals `maxHealth`

#### Scenario: a defeated boss is never revived
- **GIVEN** a `DEFEATED` boss
- **WHEN** `healBoss` is called
- **THEN** the returned state is unchanged and still `DEFEATED`

### Requirement: tickBossFight promotes SPAWNING to ACTIVE and stops when defeated
`tickBossFight` MUST advance `ticks`, promote a `SPAWNING` boss to `ACTIVE` once `ticks` reaches
`BOSS_SPAWN_TICKS`, and return a `DEFEATED` boss unchanged.

#### Scenario: the boss becomes active after the spawn delay
- **GIVEN** a freshly started boss
- **WHEN** `tickBossFight` is called `BOSS_SPAWN_TICKS` times
- **THEN** the final state's `status` is `ACTIVE`

#### Scenario: a defeated boss ignores ticks
- **GIVEN** a `DEFEATED` boss
- **WHEN** `tickBossFight` is called
- **THEN** the returned state is unchanged

### Requirement: bossBarSnapshot projects renderable bar data
`bossBarSnapshot(state, definition)` MUST return the definition's `name`/`barColor`, a `progress`
equal to `health / maxHealth` within `[0, 1]`, and the current phase's name.

#### Scenario: a half-health boss reports half progress
- **GIVEN** a boss at exactly half its `maxHealth`
- **WHEN** `bossBarSnapshot` is called
- **THEN** `progress` is `0.5` and `phaseName` matches the phase for that fraction

### Requirement: serializeBoss/deserializeBoss round-trip and reject malformed input
`serializeBoss` MUST emit a `schemaVersion: 1` envelope; `deserializeBoss` MUST reconstruct an equal
state and MUST throw for a bad version, an unknown status, a non-finite/negative health, or a
negative `phaseIndex`/`ticks`.

#### Scenario: a valid state round-trips
- **GIVEN** any `BossState`
- **WHEN** it is serialized then deserialized
- **THEN** the result equals the original

#### Scenario: a malformed payload is rejected
- **GIVEN** a payload with `schemaVersion: 2`, or an unknown `status`, or a negative `health`
- **WHEN** `deserializeBoss` is called
- **THEN** it throws

## Error and failure behavior
- `BossRegistry`'s constructor throws for an invalid definition.
- `deserializeBoss` throws for a malformed/unsupported payload.
- No other function throws for well-formed inputs.

## Performance and resource bounds
- Every function is O(phases) at worst over a 2-3 entry list; no unbounded loops.

## Compatibility and migration
- One new, additive file; no existing module edited; no schema/save-format change (codec only).

## Security and integrity
- All inputs are caller-supplied plain values; `deserializeBoss` fully validates untrusted payloads
  before returning.

## Observability
- `bossBarSnapshot` is a human-readable state dump; `serializeBoss` a machine-readable one.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registry validation + lookup | `tests/unit/BossFramework.test.ts` registry cases |
| REQ-2 phaseForHealthFraction resolution | phase-lookup cases |
| REQ-3 startBossFight initial state | startBossFight case |
| REQ-4 damageBoss health/phase/defeat reporting | damageBoss cases |
| REQ-5 healBoss cap + no revival | healBoss cases |
| REQ-6 tickBossFight spawn promotion | tickBossFight cases |
| REQ-7 bossBarSnapshot projection | snapshot case |
| REQ-8 codec round-trip + rejection | serialize/deserialize cases |
