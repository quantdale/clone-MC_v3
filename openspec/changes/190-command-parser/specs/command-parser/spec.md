# Spec: command-parser

## Contract
This capability adds the headless-safe command parsing layer: a spec-driven grammar with typed
arguments, quote-aware tokenization, descriptive errors, and the operator-level permission check.

## Definitions
- **Spec**: `{ name, permissionLevel, args }`; each arg has a type and `required` (default true).
- **Types**: `string` (bare or quoted), `integer` (`-?\d+`, safe), `float` (integers valid),
  `boolean` (case-insensitive true/false), `target` (any bare token).

## Invariants
- Input may start with `/`; command names match case-insensitively.
- Arguments are whitespace-separated; `"..."`/`'...'` group a token (stripped for string args).
- Arity is checked; every failure yields `{ ok: false, error }`; empty input yields `null`.
- `hasCommandPermission(level, required)` is `level >= required`.

## Requirements

### Requirement: splitCommand separates name and tokens
`splitCommand(input)` MUST return the lowercased command name and raw tokens (with or without a
leading `/`, after trimming) and `null` for empty/whitespace/`/`-only input.

#### Scenario: splitting
- **GIVEN** `'/time set day'`, `'time set day'`, `'  /GAMEMODE survival '`, `''`, `'   '`, `'/'`
- **THEN** the first three yield the expected name/tokens and the last three yield `null`

### Requirement: parseCommand parses typed arguments
`parseCommand(input, spec)` MUST return `{ ok: true, command: { name, args } }` for valid input,
parsing each argument by its declared type.

#### Scenario: valid parsing
- **GIVEN** a string-arg spec, an optional-boolean spec, a target+float spec, and a say spec
- **THEN** `/gamemode survival` yields `['survival']`; `/gamerule keepInventory true` yields
  `['keepInventory', true]` and `/gamerule keepInventory` yields `['keepInventory']`;
  `/tp @p 10 64 -20` yields `['@p', 10, 64, -20]` and `/tp @s 1.5 64 2.5` yields `['@s', 1.5, 64,
  2.5]`; `/say "hello world"` yields `['hello world']`

### Requirement: command names are case-insensitive
`parseCommand` MUST match the spec name case-insensitively.

#### Scenario: case
- **GIVEN** `'GAMEMODE creative'` against the `gamemode` spec
- **THEN** the parsed name is `gamemode`

### Requirement: failures are descriptive
`parseCommand` MUST yield `{ ok: false, error }` for an unknown command name, a missing required
argument (naming the first missing arg by position), an unexpected extra argument, and a type
mismatch naming the argument and the offending token; empty input MUST yield `null`.

#### Scenario: errors
- **GIVEN** `/gimme diamond`, `/gamemode`, `/tp @p 1 2`, `/gamemode survival extra`,
  `/gamerule keepInventory yes`, `/tp @p abc 64 0`, and `''`
- **THEN** the errors are `unknown command 'gimme'`, `missing argument 'mode'`,
  `missing argument 'z'`, `unexpected argument 'extra'`, `expected boolean for 'value', got 'yes'`,
  `expected float for 'x', got 'abc'`, and `null`

### Requirement: permissions are operator levels
`hasCommandPermission(level, required)` MUST be `true` exactly when `level >= required`.

#### Scenario: permission levels
- **GIVEN** level/required pairs (2,2), (4,2), (1,2), (0,0)
- **THEN** the results are true, true, false, true

## Error and failure behavior
- No throws; every failure is a structured result; empty input is `null`.

## Performance and resource bounds
- Tokenization/parsing O(input length).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Parsing is pure: no world access, no mutation, no side effects.

## Observability
- Errors are human-readable strings; `splitCommand` exposes the raw token stream.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 splitting | `tests/unit/CommandParser.test.ts` › splitCommand |
| REQ-2 typed parsing | › parseCommand |
| REQ-3 case-insensitivity | › parseCommand |
| REQ-4 errors | › parse errors |
| REQ-5 permissions | › permission context |
