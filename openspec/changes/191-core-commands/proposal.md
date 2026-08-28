# Proposal: 191-core-commands

## Problem
190 built the parsing layer but there is still no way to *command* the game headlessly: no command
registry, no implementations, no semantic validation, no permission-gated dispatch. 192's
creative-mode arc needs at least `gamemode` to drive game modes.

## Goals
- `src/simulation/CoreCommands.ts` (NEW), pure and headless-safe (no world access, no mutation):
  - **Registry**: five `CommandSpec`s over 190's typed grammar, all operator level 2:
    `time set <value:int>` / `time add <amount:int>`, `weather clear|rain|thunder`,
    `gamemode survival|creative|adventure|spectator`, `give <target> <item> [count:int]`,
    `tp <target> <x:float> <y:float> <z:float>`.
  - **Dispatch**: `executeCoreCommand(input, permissionLevel)` runs split -> spec lookup ->
    permission check -> typed parse -> semantic validation -> effect.
  - **Pure effects**: `CommandEffect` descriptors (`set_time`, `add_time`, `set_weather`,
    `set_gamemode`, `give_item`, `teleport`) that a future wiring applies; commands never mutate.
  - **Semantic validation**: `time` actions restricted to `set`/`add`; weather restricted to
    `clear`/`rain`/`thunder`; gamemodes to the four vanilla values; `give` count defaults to 1 and
    must be positive.
  - **Structured results**: `{ status: 'ok', effect }` | `{ status: 'error', error }` |
    `{ status: 'denied', command }`; denied happens before parsing (permission-gated).

## Non-goals
- **No world mutation/wiring** (later change applies effects), **no chat UI** (233), **no tab
  completion**, **no selector resolution** (`@p` is carried through as an opaque target string).

## Preconditions
- Change 190 (`command-parser`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 190's `CommandParser` (`splitCommand` / `parseCommand` / `hasCommandPermission` / `CommandSpec`).

## Proposed change
1. `src/simulation/CoreCommands.ts` (NEW): the spec registry, effect types, semantic validation,
   and `executeCoreCommand`.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Semantic/parse error drift**. Mitigation: every error class (unknown action, unknown weather,
  unknown gamemode, unknown command, parse mismatch, non-positive count, empty input) is pinned
  with its exact error text in tests.
- **Permission order confusion**. Mitigation: the denied-before-parse order is explicit in the
  code and tested (level-1 user gets `denied` even for a perfectly formed command).

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: registry shape (five commands, level 2); time set/add + failures; each weather;
  each gamemode; give default/explicit/positive count; tp floats + missing arg; permission denial
  before parse; unknown command; empty input.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
