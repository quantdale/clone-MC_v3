# Design: 191-core-commands

## Context/current state
- 190 provided the typed parser (`CommandParser`) but nothing dispatches through it. 191 adds the
  first command implementations — a pure registry of specs plus handlers that emit effect
  descriptors; 192's creative-mode arc consumes the `gamemode` effect.

## Target state
- `src/simulation/CoreCommands.ts` holding the five `CommandSpec`s, the `CommandEffect` union,
  `coreCommandSpecs()`, and `executeCoreCommand(input, permissionLevel)`.

## Invariants
- Every command is pure and headless-safe: no world access, no mutation, no side effects.
- All five specs require operator level 2 (`hasCommandPermission(level, 2)`).
- Permission is checked before parsing: a denied command returns `denied` even when malformed.
- Semantic validation happens after typed parsing; every failure is a structured result, no throws.
- `give` count defaults to 1 and must be positive; `time` action is `set` or `add`; weather and
  gamemode values are validated against the documented sets.

## API and data model
```ts
// src/simulation/CoreCommands.ts (new)
export const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'] as const;
export type GameMode = (typeof GAMEMODES)[number];
export const WEATHERS = ['clear', 'rain', 'thunder'] as const;
export type WeatherKind = (typeof WEATHERS)[number];

export type CommandEffect =
  | { kind: 'set_time'; value: number }
  | { kind: 'add_time'; amount: number }
  | { kind: 'set_weather'; weather: WeatherKind }
  | { kind: 'set_gamemode'; mode: GameMode }
  | { kind: 'give_item'; target: string; item: string; count: number }
  | { kind: 'teleport'; target: string; x: number; y: number; z: number };

export type CoreCommandResult =
  | { status: 'ok'; effect: CommandEffect }
  | { status: 'error'; error: string }
  | { status: 'denied'; command: string };

export function coreCommandSpecs(): readonly CommandSpec[];
export function executeCoreCommand(input: string, permissionLevel: number): CoreCommandResult;
```

## Control/data flow
1. `executeCoreCommand` splits the input; `null` -> `error 'empty command'`.
2. Spec lookup by lowercased name; unknown -> `error 'unknown command '<name>''`.
3. `hasCommandPermission(level, spec.permissionLevel)`; false -> `denied`.
4. `parseCommand(input, spec)` yields typed args; failure -> `error` with the parser's message.
5. `runHandler` applies semantic validation and returns `{ effect }` or `{ error }`.
6. The effect descriptor is returned as `{ status: 'ok', effect }`; the wiring applies it later.

## Detailed behavior
- `time`: action `set` -> `set_time`, `add` -> `add_time`; anything else -> `unknown time action
  '<a>'`.
- `weather`: `clear|rain|thunder` -> `set_weather`; else `unknown weather '<w>'`.
- `gamemode`: the four vanilla modes -> `set_gamemode`; else `unknown gamemode '<m>'`.
- `give`: optional count defaults to 1; `count <= 0` -> `count must be positive`.
- `tp`: all four args required (parser reports missing ones by position); floats accept integers.

## Failure modes
- Structured results only, no throws: `error` covers empty input, unknown command, parse failures,
  and semantic failures; `denied` covers permission failures and carries the command name.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- O(input length) plus constant-time spec lookup (linear scan over five specs).

## Testing seams
- Tests drive `executeCoreCommand` with raw input strings and permission levels, asserting exact
  result objects (status + effect/error) and exact error text.

## Observability/debugging
- Errors are human-readable strings; `coreCommandSpecs()` exposes the registry for introspection.

## Affected files/symbols
- `src/simulation/CoreCommands.ts` (new).
- Tests: `tests/unit/CoreCommands.test.ts` (new). No other files.

## Rejected alternatives
- **Handlers mutating the world**: rejected — the pure effect-descriptor design keeps 191
  headless-safe and lets a later wiring apply effects deterministically.
- **One spec per action (`time-set`, `time-add`)**: rejected — vanilla dispatches on the first
  argument; one `time` spec with semantic validation mirrors the parser's grammar.

## Downstream dependencies
- 192 (`creative-mode`) consumes the `set_gamemode` effect; the command wiring applies effects to
  `World`; 233 (chat) routes player input here; 242's e2e drives commands through this module.
