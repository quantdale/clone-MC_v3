# Spec: game-mode-framework

## Contract
This capability adds the canonical game-mode model: the mode set shared with 191's commands,
immutable mode state with identity no-op updates, a text entry point, four vanilla-inspired
creative-behavior predicates (flight, instant block break, creative inventory, no survival
depletion), and versioned validate-before-accept persistence — all pure and headless-safe.

## Definitions
- **Mode**: one of `survival`, `creative`, `adventure`, `spectator` (the canonical `GAME_MODES`).
- **Creative inventory**: modes that do not deplete items on use/place (`depletesItems` false).
- **Survival depletion**: hunger/resource drain and avoidable damage (`survivalStatsDeplete` true).

## Invariants
- No world access, no mutation, no side effects; fully deterministic given the inputs.
- The mode set MUST be exactly `['survival', 'creative', 'adventure', 'spectator']` and MUST stay
  equal to 191's `CoreCommands.GAMEMODES`.
- `setGameMode` MUST return the identical state on same-mode or invalid input and a new state on
  change.
- `parseGameMode` MUST be case-insensitive and trim input; failures MUST be `null`.
- Deserialization MUST validate the entire payload before accepting anything and MUST throw
  descriptive errors on any violation (no partial acceptance).
- Behavior predicates MUST follow the vanilla table: canFly = creative, spectator;
  instantBlockBreak = creative only; depletesItems = survival, adventure;
  survivalStatsDeplete = survival, adventure.

## Requirements

### Requirement: the canonical mode set and default state
`GAME_MODES` MUST be exactly `['survival', 'creative', 'adventure', 'spectator']` in that order,
`createDefaultGameModeState()` MUST return `{ mode: 'survival' }`, and `GAME_MODES` MUST deep-equal
191's `CoreCommands.GAMEMODES`.

#### Scenario: mode set
- **GIVEN** `GAME_MODES`, `createDefaultGameModeState()`, and `CoreCommands.GAMEMODES`
- **THEN** `GAME_MODES` is `['survival', 'creative', 'adventure', 'spectator']`, the default state
  is `{ mode: 'survival' }`, and `GAME_MODES` deep-equals `GAMEMODES`

### Requirement: setGameMode is immutable with identity no-op
`setGameMode(state, mode)` MUST return a NEW state object when `mode` differs from the current
mode, and MUST return the IDENTICAL state when `mode` equals the current mode.

#### Scenario: set and no-op
- **GIVEN** `createDefaultGameModeState()` and `setGameMode(state, 'creative')`
- **THEN** the result is `{ mode: 'creative' }` and not the same object; `setGameMode(result,
  'creative')` returns the identical object

### Requirement: text parsing
`parseGameMode(text)` MUST accept the four mode names case-insensitively with surrounding
whitespace trimmed, and MUST return `null` for anything else including empty input.

#### Scenario: parse
- **GIVEN** `'creative'`, `'  CREATIVE '`, `'hard'`, `''`
- **THEN** the results are `'creative'`, `'creative'`, `null`, `null`

### Requirement: flight rule
`canFly(mode)` MUST be true exactly for `creative` and `spectator`.

#### Scenario: flight table
- **GIVEN** each mode in order
- **THEN** `canFly` is false, true, false, true for survival, creative, adventure, spectator

### Requirement: instant break rule
`instantBlockBreak(mode)` MUST be true exactly for `creative`.

#### Scenario: instant break table
- **GIVEN** each mode in order
- **THEN** `instantBlockBreak` is false, true, false, false for survival, creative, adventure,
  spectator

### Requirement: creative inventory rule
`depletesItems(mode)` MUST be true exactly for `survival` and `adventure` (creative and spectator
never run their inventory down).

#### Scenario: depletion table
- **GIVEN** each mode in order
- **THEN** `depletesItems` is true, false, true, false for survival, creative, adventure, spectator

### Requirement: no survival depletion in creative
`survivalStatsDeplete(mode)` MUST be true exactly for `survival` and `adventure` (creative and
spectator suffer no hunger/damage depletion).

#### Scenario: survival depletion table
- **GIVEN** each mode in order
- **THEN** `survivalStatsDeplete` is true, false, true, false for survival, creative, adventure,
  spectator

### Requirement: versioned persistence
`serializeGameModeState(state)` MUST produce `{ version: 1, mode }`; `deserializeGameModeState`
MUST round-trip it and MUST throw a descriptive `Error` for a non-object payload, an unsupported
version, a mode outside the set, and unknown extra keys — accepting nothing partially.

#### Scenario: persistence
- **GIVEN** a state, its serialization, `42`, `{ version: 1, mode: 'hard' }`,
  `{ version: 0, mode: 'creative' }`, and `{ version: 1, mode: 'creative', extra: true }`
- **THEN** the round-trip equals the original state; the other five inputs each throw an error
  mentioning `expected an object`, `unknown mode`, `unsupported version`, and `unknown key`
  respectively

## Error and failure behavior
- State/rules APIs never throw; `parseGameMode` returns `null`; `setGameMode` identity-no-ops.
- Only `deserializeGameModeState` throws (invalid persisted data must never be silently accepted).

## Performance and resource bounds
- All operations O(1); predicates are membership checks on a 4-element tuple.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions with immutable state; no side channels, no partial persistence acceptance.

## Observability
- State is a plain immutable object; parse failures are `null`; persistence failures name the
  offending field.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 mode set/default/191 equality | `tests/unit/GameModeFramework.test.ts` › mode set |
| REQ-2 setGameMode immutability | › setGameMode |
| REQ-3 text parsing | › text parsing |
| REQ-4 flight rule | › behavior rules |
| REQ-5 instant break rule | › behavior rules |
| REQ-6 creative inventory rule | › behavior rules |
| REQ-7 survival depletion rule | › behavior rules |
| REQ-8 persistence | › persistence |
