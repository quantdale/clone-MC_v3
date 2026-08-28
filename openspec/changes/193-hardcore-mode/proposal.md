# Proposal: 193-hardcore-mode

## Problem
192 defined the mode model and creative behaviors, but there is no hardcore concept: nothing locks
difficulty to hard, and nothing defines the permanent-death world semantics that distinguish a
hardcore world from a normal one.

## Goals
- `src/simulation/HardcoreFramework.ts` (NEW), pure and headless-safe (no world access, no
  mutation):
  - **Immutable state**: `HardcoreState { hardcore: boolean }`;
    `createDefaultHardcoreState()` is `{ hardcore: false }`; `setHardcore(state, enabled)` returns
    a NEW state on change and the IDENTICAL state on same value (identity no-op).
  - **Difficulty lock**: `locksDifficulty(state)` (true when enabled) and
    `effectiveDifficulty(state, level)` — when enabled the effective level is ALWAYS `'hard'`,
    regardless of the configured level (vanilla hardcore lock; consumes 188's `DifficultyLevel`).
  - **Death-world semantics**: `forcesPermanentDeath(state)` (true when enabled) and
    `respawnModeAfterDeath(state, currentMode)` — when enabled the post-death mode is ALWAYS
    `'spectator'` (the player can only observe the dead world; vanilla hardcore behavior);
    otherwise the current mode is preserved.
  - **Persistence**: `serializeHardcoreState` / `deserializeHardcoreState` — version 1,
    validate-before-accept (object shape, version, boolean flag, exact key set; descriptive
    throws, nothing partially accepted).

## Non-goals
- **No death/respawn engine wiring** (later changes apply the rules), **no world-deletion on
  death**, **no hardcore world creation flow** (world options), **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 192 (`creative-mode`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 192's `GameMode` type (for the spectator post-death mode) and 188's `DifficultyLevel` (for the
  difficulty lock) — both consumed as types, no reverse dependencies.

## Proposed change
1. `src/simulation/HardcoreFramework.ts` (NEW): the state + get/set, the difficulty-lock rules,
   the death-world rules, and versioned persistence.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Rule drift from vanilla**. Mitigation: the lock and death semantics are pinned per state value
  in tests with the vanilla rationale documented in design.md.
- **Type coupling drift** (GameMode/DifficultyLevel). Mitigation: the module consumes the
  published types by import; a typecheck failure surfaces any drift immediately.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the default state; set with change and identity no-op; the difficulty lock
  (locks flag + effective level for every configured level); the death-world rules (permanent-death
  flag + post-death mode for both states); persistence round-trip and every rejection (non-object,
  bad version, non-boolean flag, unknown key).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
