# Proposal: 180-end-dimension-type

## Problem
179 completed the Nether's content, but the End — the final progression destination — has no
canonical `DimensionType`: no bounds, no skylight/ambient rules, no time lock, no save-namespace
entry. 181's End world generation and 182's portal progression have nothing to target, mirroring the
exact gap 175 filled for the Nether.

## Goals
- `END_DIMENSION_TYPE` in `src/data/DimensionTypes.ts` — `minecraft:the_end`, minY 0, height 256
  (16 sections), logicalHeight 256, **no skylight**, **not ultrawarm**, non-natural, and
  `fixedTime 6000` (vanilla locks the End at 6000 ticks — its perpetual dawn).
- Save namespace: `dimensionSaveNamespace('minecraft:the_end')` passes (the rule is already
  key-generic; the End key is a legal resource id).
- Registration through 174's `DimensionManager` under `minecraft:the_end` with a fresh queue.

## Non-goals
- **No End world generation** (181), **no End portal/dragon progression** (182-184), **no End
  content** (dragon etc. in 183/218) — later changes consume this type.
- **No `Game`/`World` wiring.**

## Preconditions
- Change 179 (`nether-content-baseline`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/data/DimensionType.ts` (025), `src/data/DimensionTypes.ts` (175), 174's `DimensionManager`.

## Proposed change
1. `src/data/DimensionTypes.ts` (EDIT): add `END_DIMENSION_TYPE` and extend the module doc.

## Compatibility and migration
- One additive constant in an existing data module; zero registry changes, zero characterization
  updates, no `Game.ts` edit, no schema/save-format change.

## Risks
- **Parameter drift from vanilla** (wrong fixedTime/bounds). Mitigation: every field is pinned by a
  test, including exact `containsY` edges and the 6000-tick time lock.

## Rollback strategy
One additive constant + doc edit; reverting removes the feature cleanly.

## Definition of Done
- `END_DIMENSION_TYPE` defined with vanilla parameters.
- Unit tests cover: all fields (bounds, sections, skylight, ultrawarm, natural, fixedTime 6000,
  containsY edges); manager registration under `minecraft:the_end`; save-namespace pass-through.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
