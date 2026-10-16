# Spec: hardcore-framework

## Contract
This capability adds the hardcore world setting: immutable state with identity-no-op updates, a
vanilla-style difficulty lock (`effectiveDifficulty` always `'hard'` when enabled), death-world
semantics (permanent death; the post-death mode is always `'spectator'` when enabled), and
versioned validate-before-accept persistence — all pure and headless-safe.

## Definitions
- **Hardcore state**: `{ hardcore: boolean }` — a world-level setting, independent of the player's
  game mode.
- **Difficulty lock**: when hardcore is enabled, the effective difficulty is hard regardless of the
  configured level (188's `DifficultyLevel`).
- **Death-world semantics**: when hardcore is enabled, death is permanent — the player returns as
  a spectator (`'spectator'`), observing without interacting.

## Invariants
- No world access, no mutation, no side effects; fully deterministic given the inputs.
- `setHardcore` MUST return the identical state on the same boolean and a new state on change.
- When enabled, `effectiveDifficulty` MUST be `'hard'` for every configured level and
  `respawnModeAfterDeath` MUST be `'spectator'` for every current mode.
- When disabled, both functions MUST return their input verbatim.
- Deserialization MUST validate the entire payload before accepting anything and MUST throw
  descriptive errors on any violation (no partial acceptance).

## Requirements

### Requirement: default and immutable state
`createDefaultHardcoreState()` MUST return `{ hardcore: false }`; `setHardcore` MUST return a NEW
state when the boolean changes and the IDENTICAL state when it does not.

#### Scenario: state transitions
- **GIVEN** `createDefaultHardcoreState()` and `setHardcore(state, true)`
- **THEN** the result is `{ hardcore: true }` and not the same object; `setHardcore(result, true)`
  returns the identical object; `setHardcore(result, false)` returns `{ hardcore: false }`

### Requirement: difficulty lock
`locksDifficulty(state)` MUST be true exactly when hardcore is enabled.
`effectiveDifficulty(state, level)` MUST return `'hard'` for every configured level when enabled,
and the configured level verbatim when disabled.

#### Scenario: locked difficulty
- **GIVEN** an enabled state and configured levels `peaceful`, `easy`, `normal`, `hard`
- **THEN** `locksDifficulty` is true and every `effectiveDifficulty` result is `'hard'`; with a
  disabled state and level `easy`, `locksDifficulty` is false and `effectiveDifficulty` is `easy`

### Requirement: death-world semantics
`forcesPermanentDeath(state)` MUST be true exactly when hardcore is enabled.
`respawnModeAfterDeath(state, currentMode)` MUST return `'spectator'` for every current mode when
enabled, and the current mode verbatim when disabled.

#### Scenario: permanent death
- **GIVEN** an enabled state and current modes `survival`, `creative`, `adventure`, `spectator`
- **THEN** `forcesPermanentDeath` is true and every `respawnModeAfterDeath` result is `'spectator'`;
  with a disabled state and mode `survival`, `forcesPermanentDeath` is false and
  `respawnModeAfterDeath` is `survival`

### Requirement: versioned persistence
`serializeHardcoreState(state)` MUST produce `{ version: 1, hardcore }`;
`deserializeHardcoreState` MUST round-trip it and MUST throw a descriptive `Error` for a
non-object payload, an unsupported version, a non-boolean flag, and unknown extra keys —
accepting nothing partially.

#### Scenario: persistence
- **GIVEN** both states, their serializations, `'yes'`, `{ version: 1, hardcore: 'yes' }`,
  `{ version: 0, hardcore: true }`, and `{ version: 1, hardcore: true, extra: 1 }`
- **THEN** both round-trips equal the original states; the four invalid inputs each throw an error
  mentioning `expected an object`, `hardcore must be a boolean`, `unsupported version`, and
  `unknown key` respectively

## Error and failure behavior
- The state/rules API never throws; `setHardcore` identity-no-ops on same value.
- Only `deserializeHardcoreState` throws (invalid persisted data must never be silently accepted).

## Performance and resource bounds
- All operations O(1).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions with immutable state; no side channels, no partial persistence acceptance.

## Observability
- State is a plain immutable object; persistence failures name the offending field.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 state transitions | `tests/unit/HardcoreFramework.test.ts` › state transitions |
| REQ-2 difficulty lock | › difficulty lock |
| REQ-3 death-world semantics | › death-world semantics |
| REQ-4 persistence | › persistence |
