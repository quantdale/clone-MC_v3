# Proposal: 192-creative-mode

## Problem
191 can emit a `set_gamemode` effect but the game has no game-mode concept: nothing defines what
"creative" means, what a mode permits, or how a mode is stored, parsed, or validated. The
game-modes arc (192-195) needs a canonical mode model first.

## Goals
- `src/simulation/GameModeFramework.ts` (NEW), pure and headless-safe (no world access, no
  mutation):
  - **Canonical modes**: `GAME_MODES = ['survival', 'creative', 'adventure', 'spectator']` — the
    single definition of the mode set, asserted equal to 191's `CoreCommands.GAMEMODES`.
  - **Immutable state**: `GameModeState { mode }`; `createDefaultGameModeState()` is survival;
    `setGameMode` returns a NEW state on change and the IDENTICAL state on same-mode or invalid
    input (identity no-op).
  - **Text entry**: `parseGameMode(text)` — trim + lowercase, the four mode names accepted, `null`
    otherwise (191's `/gamemode` command consumes this).
  - **Creative behavior rules** (vanilla-inspired predicates of mode):
    - `canFly(mode)` — true for creative and spectator.
    - `instantBlockBreak(mode)` — true only for creative.
    - `depletesItems(mode)` — true for survival and adventure (creative/spectator: the creative
      inventory never runs down).
    - `survivalStatsDeplete(mode)` — true for survival and adventure (creative/spectator: no
      hunger/damage depletion).
  - **Persistence**: `serializeGameModeState` / `deserializeGameModeState` — version 1,
    validate-before-accept (exact shape, mode in the set, unknown keys rejected; descriptive
    throws, nothing partially accepted).

## Non-goals
- **No flight physics / block-break engine wiring** (later changes apply the rules), **no
  spectator interaction semantics** (193-195), **no `Game.ts` edit**, **no save-format change**
  (the serialized shape is new, not a migration).

## Preconditions
- Change 191 (`core-commands`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 191's `CoreCommands.GAMEMODES` as the consistency baseline (asserted, not imported — the command
  layer is downstream of the framework).

## Proposed change
1. `src/simulation/GameModeFramework.ts` (NEW): the mode tuple/types, state + get/set, text parse,
   the four behavior predicates, and versioned persistence.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Rule drift from vanilla**. Mitigation: every predicate is pinned per mode in a test table with
  the vanilla rationale documented in design.md.
- **Set divergence from 191's command values**. Mitigation: a consistency test deep-equals
  `GAME_MODES` with `CoreCommands.GAMEMODES`.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the mode tuple + default state; set with change and identity no-op; text parse
  (valid/invalid); the 4-mode × 4-predicate rules table; consistency with 191; persistence
  round-trip and every rejection (non-object, bad version, unknown mode, unknown key).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
