# Design: 190-command-parser

## Context/current state
- 188/189 built the knob/rules layers; 191 will implement the commands themselves. 190 provides the
  pure parsing layer they dispatch through.

## Target state
- `src/simulation/CommandParser.ts` holding the spec types, the tokenizer, `splitCommand`,
  `parseCommand`, and `hasCommandPermission`.

## Invariants
- Input may start with `/`; names match case-insensitively; arguments are whitespace-separated with
  quote grouping.
- Typed parsing per the documented grammar; integers are `-?\d+` (safe), floats accept integers,
  booleans are case-insensitive, targets accept any bare token.
- Arity is checked against the spec (required args default true); every failure yields a
  descriptive error; empty input yields `null`.
- `hasCommandPermission(level, required)` is `level >= required`.

## API and data model
```ts
// src/simulation/CommandParser.ts (new)
export type CommandArgumentType = 'string' | 'integer' | 'float' | 'boolean' | 'target';
export interface CommandArgumentSpec { name: string; type: CommandArgumentType; required?: boolean; }
export interface CommandSpec { name: string; permissionLevel: number; args: readonly CommandArgumentSpec[]; }
export type CommandArgumentValue = string | number | boolean;
export interface ParsedCommand { name: string; args: readonly CommandArgumentValue[]; }
export type CommandParseResult = { ok: true; command: ParsedCommand } | { ok: false; error: string };
export function hasCommandPermission(level: number, required: number): boolean;
export function splitCommand(input: string): { name: string; tokens: string[] } | null;
export function parseCommand(input: string, spec: CommandSpec): CommandParseResult | null;
```

## Control/data flow
1. 191's command registry holds `CommandSpec`s; a caller splits input (`splitCommand`), looks up the
   spec by name, checks `hasCommandPermission`, then `parseCommand` yields the typed args.
2. The command handler consumes the parsed args; all parsing is pure.

## Detailed behavior
- The tokenizer groups `"..."`/`'...'` spans (an unclosed quote extends to end of input) and drops
  empty tokens.
- Missing-argument errors name the first missing spec arg by position; extra tokens are reported as
  `unexpected argument '<token>'`.

## Failure modes
- `parseCommand` returns `null` only for empty input; every other failure is a structured
  `{ ok: false, error }` — no throws.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Tokenization and parsing are O(input length).

## Testing seams
- Tests use example specs (gamemode/gamerule/tp/say) exercising every type and failure class.

## Observability/debugging
- Parse errors are human-readable strings; `splitCommand` exposes the raw token stream.

## Affected files/symbols
- `src/simulation/CommandParser.ts` (new).
- Tests: `tests/unit/CommandParser.test.ts` (new). No other files.

## Rejected alternatives
- **Regex-only tokenization**: rejected — a small state-machine tokenizer is clearer about quoting
  and empty tokens.
- **Throwing parse errors**: rejected — structured results make the headless-safe contract explicit.

## Downstream dependencies
- 191 (`core-commands`) registers specs and executes handlers; 233 (chat) routes player input here;
  242's e2e drives commands through this parser.
