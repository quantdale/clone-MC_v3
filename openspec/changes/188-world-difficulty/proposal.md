# Proposal: 188-world-difficulty

## Problem
187 closed meta-progression, but nothing tunes the *world*: hostile spawns can't be disabled,
damage/hunger are flat constants, and no difficulty can be persisted. Difficulty is the first knob
system 138's spawn rules, 141/116's damage resolution, and 124's food runtime consult.

## Goals
- `src/simulation/WorldDifficulty.ts` (NEW), pure and deterministic:
  - `DIFFICULTY_LEVELS` (`peaceful`/`easy`/`normal`/`hard`) and `DEFAULT_DIFFICULTY = 'normal'`.
  - `DifficultyDefinition` with vanilla knobs per level:
    - `hostileSpawns` — peaceful `false`, others `true`;
    - `hostileDamageMultiplier` — 0 / 0.5 / 1 / 1.5 (mob→player);
    - `hungerDepletionMultiplier` — 0 / 0.5 / 1 / 1.5;
    - `canStarve` — peaceful `false`, others `true`.
  - Accessors: `difficultyDefinition`, `difficultyAllowsHostileSpawns`,
    `difficultyHostileDamageMultiplier`, `difficultyHungerDepletionMultiplier`, `difficultyCanStarve`.
  - `parseDifficultyLevel(text)` — trimmed, case-insensitive; `null` for unknown/null input (the
    caller decides the fallback; 191's `/difficulty` command consumes this).
  - Persistence: versioned `serializeDifficulty`/`deserializeDifficulty` (unknown level or wrong
    version throws).

## Non-goals
- **No integration into 138/141/116/124** (wiring changes consult the accessors), **no command**
  (191), **no lock-on-hardcore** (193), **no `Game`/`World` wiring**.

## Preconditions
- Change 187 (`statistics-framework`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (a standalone framework).

## Proposed change
1. `src/simulation/WorldDifficulty.ts` (NEW): the constants, types, table, accessors, parser, and
   persistence pair.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change (the serialized difficulty is a new additive shape).

## Risks
- **Multiplier drift from vanilla** (wrong 0.5/1/1.5 values). Mitigation: every knob pinned by a
  test per level.
- **Case/whitespace parsing surprises for commands**. Mitigation: `parseDifficultyLevel` trims and
  lowercases; both `'  HARD '` and `'Normal'` parse, and unknown/null inputs return `null`.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed constants/functions implemented per design.md/spec.md.
- Unit tests cover: the four levels; the full peaceful definition; easy/normal/hard knobs; every
  accessor; parsing (case/trim/unknown/null); persistence round-trip; malformed rejection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
