# Proposal: 190-command-parser

## Problem
189 built the rules layer but there is no way to *command* the game headlessly: no command syntax,
no typed arguments, no permission context. 191's core commands need a parser to build on.

## Goals
- `src/simulation/CommandParser.ts` (NEW), pure and headless-safe (no world access, no mutation):
  - **Grammar**: optional leading `/`; command name matched case-insensitively; whitespace-separated
    tokens with `"double"`/`'single'` quoting (quotes stripped for string args).
  - **Typed arguments**: `string` (bare or quoted), `integer` (`-?\d+`), `float`
    (`-?\d+(\.\d+)?`, integers valid), `boolean` (true/false case-insensitively), `target` (any
    bare token — `@p`-style selectors or names).
  - **Specs**: `CommandSpec { name, permissionLevel, args }` with per-argument
    `required` (default true).
  - **Parse result**: `{ ok: true, command: { name, args } }` or `{ ok: false, error }` with
    descriptive errors for unknown commands, missing/unexpected arguments, and type mismatches;
    `null` for empty input.
  - **Permissions**: `hasCommandPermission(level, required)` = `level >= required` (vanilla-style
    operator levels 0..4).
  - `splitCommand(input)` — name + raw tokens for dispatch.

## Non-goals
- **No command implementations** (191), **no command registry/help text** (191), **no chat UI**
  (233), **no `Game`/`World` wiring**.

## Preconditions
- Change 189 (`gamerule-framework`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (a standalone parser).

## Proposed change
1. `src/simulation/CommandParser.ts` (NEW): the types, tokenizer, `splitCommand`,
   `parseCommand`, `hasCommandPermission`.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Tokenizer edge cases** (unclosed quotes, empty tokens). Mitigation: the tokenizer groups quoted
  spans and drops empty tokens; unclosed quotes simply extend to the end of input (documented);
  quoted-token and bare-token cases are both tested.
- **Arity/type error drift**. Mitigation: every failure class (unknown command, missing arg,
  unexpected arg, boolean/float mismatch) has a dedicated test with the exact error text.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed functions implemented per design.md/spec.md.
- Unit tests cover: split (slash/no-slash/case/trim/empty); string/optional-boolean/target+numeric/
  quoted parsing; case-insensitive names; unknown command; missing args (correct positional
  message); unexpected args; type mismatches; empty-input null; permission levels.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
