# Spec: core-commands

## Contract
This capability adds the first command implementations over 190's parser: a five-command registry
(`time`, `weather`, `gamemode`, `give`, `tp`) whose handlers emit pure effect descriptors, with
operator-level permission gating and semantic validation, all headless-safe and deterministic.

## Definitions
- **Effect**: a pure descriptor `{ kind, ... }` that a future wiring applies — never mutated here.
- **Target**: an opaque selector/name string (`@p`, `@s`, player names) carried through untouched.
- **Result**: `{ status: 'ok', effect }` | `{ status: 'error', error }` | `{ status: 'denied',
  command }`.

## Invariants
- No world access, no mutation, no side effects; fully deterministic given the input string and
  permission level.
- All five commands require operator level 2; permission is checked BEFORE parsing, so a denied
  command never reports parse errors.
- Semantic validation (value sets, count positivity, time actions) runs after typed parsing.
- Every failure is a structured result; no throws; empty input is `error 'empty command'`.

## Requirements

### Requirement: the registry exposes five level-2 commands
`coreCommandSpecs()` MUST return exactly the specs `time`, `weather`, `gamemode`, `give`, `tp`,
each with `permissionLevel` 2, and the exported `GAMEMODES` / `WEATHERS` value sets MUST be the
documented vanilla sets.

#### Scenario: registry shape
- **GIVEN** `coreCommandSpecs()`, `GAMEMODES`, `WEATHERS`
- **THEN** the names are `['time', 'weather', 'gamemode', 'give', 'tp']`, every permissionLevel is
  2, `GAMEMODES` is `['survival', 'creative', 'adventure', 'spectator']`, and `WEATHERS` is
  `['clear', 'rain', 'thunder']`

### Requirement: time sets and adds
`executeCoreCommand('/time set <int>', level)` MUST yield `{ status: 'ok', effect: { kind:
'set_time', value } }` and `'/time add <int>'` MUST yield `{ kind: 'add_time', amount }`.

#### Scenario: time commands
- **GIVEN** `'/time set 1000'` and `'/time add 100'` at level 2
- **THEN** the effects are `set_time` (value 1000) and `add_time` (amount 100)

### Requirement: time semantic validation
A `time` action other than `set`/`add` MUST yield `error` naming the action; a non-integer value
MUST yield the parser's type-mismatch error.

#### Scenario: time failures
- **GIVEN** `'/time reset 100'` and `'/time set abc'` at level 2
- **THEN** the errors are `unknown time action 'reset'` and
  `expected integer for 'value', got 'abc'`

### Requirement: weather sets and validates
`'/weather <w>'` for `clear|rain|thunder` MUST yield `{ kind: 'set_weather', weather: w }`; any
other value MUST yield `error` naming it.

#### Scenario: weather commands
- **GIVEN** `'/weather clear'`, `'/weather rain'`, `'/weather thunder'`, `'/weather sunny'`
- **THEN** the first three yield `set_weather` effects and the last yields
  `unknown weather 'sunny'`

### Requirement: gamemode sets and validates
`'/gamemode <m>'` for `survival|creative|adventure|spectator` MUST yield `{ kind: 'set_gamemode',
mode: m }`; any other value MUST yield `error` naming it.

#### Scenario: gamemode commands
- **GIVEN** `'/gamemode creative'`, `'/gamemode survival'`, `'/gamemode hard'`
- **THEN** the first two yield `set_gamemode` effects and the last yields
  `unknown gamemode 'hard'`

### Requirement: give defaults the count to 1 and requires positivity
`'/give <target> <item>'` MUST yield `{ kind: 'give_item', target, item, count: 1 }`; an explicit
count MUST be used when present; a count <= 0 MUST yield `error 'count must be positive'`.

#### Scenario: give commands
- **GIVEN** `'/give @p diamond 5'`, `'/give @p diamond'`, `'/give @p diamond 0'` at level 2
- **THEN** the first yields `give_item` with count 5, the second with count 1, and the third yields
  `count must be positive`

### Requirement: tp requires three coordinates
`'/tp <target> <x> <y> <z>'` MUST yield `{ kind: 'teleport', target, x, y, z }` with float
coordinates (integers valid); a missing coordinate MUST yield the parser's positional error.

#### Scenario: tp commands
- **GIVEN** `'/tp @p 1.5 64 2.5'` and `'/tp @p 1 2'` at level 2
- **THEN** the first yields `teleport` with (1.5, 64, 2.5) and the second yields
  `missing argument 'z'`

### Requirement: permission gates before parsing
`executeCoreCommand` with a permission level below 2 MUST yield `{ status: 'denied', command }`
for any of the five commands, EVEN when the input is well-formed; level >= 2 MUST proceed.

#### Scenario: permission
- **GIVEN** `'/gamemode creative'` at level 1 and `'/give @p diamond'` at level 2
- **THEN** the first is `denied` (command `gamemode`) and the second is `ok`

### Requirement: dispatch errors
An unknown command name MUST yield `error 'unknown command '<name>''`; empty input MUST yield
`error 'empty command'`.

#### Scenario: dispatch failures
- **GIVEN** `'/gimme diamond'` and `''` at level 2
- **THEN** the errors are `unknown command 'gimme'` and `empty command`

## Error and failure behavior
- No throws; every failure is a structured `error` or `denied` result with a human-readable
  message.

## Performance and resource bounds
- O(input length) parsing plus a linear scan over five specs.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure and headless-safe: effects are descriptors only; nothing is applied, so no state can be
  corrupted. Permission gating prevents lower-level callers from reaching handlers.

## Observability
- Errors are human-readable strings; `coreCommandSpecs()` exposes the registry.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registry | `tests/unit/CoreCommands.test.ts` › core command registry |
| REQ-2 time set/add | › time command |
| REQ-3 time validation | › time command |
| REQ-4 weather | › weather command |
| REQ-5 gamemode | › gamemode command |
| REQ-6 give | › give command |
| REQ-7 tp | › tp command |
| REQ-8 permission | › permissions and dispatch |
| REQ-9 dispatch | › permissions and dispatch |
