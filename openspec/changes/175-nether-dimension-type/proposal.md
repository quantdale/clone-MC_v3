# Proposal: 175-nether-dimension-type

## Problem
174 added the multi-dimension container but registered no real dimension types: the only
`DimensionType` instances in tests are throwaway fixtures. The Nether — vanilla's first
non-overworld dimension — has precise bounds and ambient rules: 0..255 (16 sections), **no
skylight**, ultrawarm (constant warmth), non-natural, and a fixed time of 18000 ticks (noon). It
also needs a save namespace distinct from the overworld. Without a canonical definition, 176's
Nether world generation and 177-178's portals have nothing to target.

## Goals
- `src/data/DimensionTypes.ts` (NEW):
  - `OVERWORLD_DIMENSION_TYPE` — `minecraft:overworld`, minY −64, height 384 (24 sections),
    logicalHeight 384, skylight, natural, no fixed time (vanilla 1.18+ parameters; defined here so
    the standard dimensions share one module).
  - `NETHER_DIMENSION_TYPE` — `minecraft:the_nether`, minY 0, height 256 (16 sections),
    logicalHeight 256, **no skylight**, ultrawarm, non-natural, `fixedTime 18000`.
  - `dimensionSaveNamespace(key)` — the save-namespace rule: a dimension's storage namespace IS its
    key; the function validates that the key is a legal full resource id (`namespace:path`) and
    returns it unchanged, throwing `INVALID_ID` for malformed keys so a bad key can never reach the
    persistence layer.

## Non-goals
- **No Nether world generation** (176), **no portal blocks/linking** (177-178), **no Nether content**
  (179), **no End type** (180) — later changes consume these types.
- **No persistence-layer changes** — `dimensionSaveNamespace` is the namespace contract; the stores
  (034-042) adopt it when dimension-aware saves arrive.
- **No `Game`/`World` wiring.**

## Preconditions
- Change 174 (`dimension-manager`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/data/DimensionType.ts` (025), `src/data/ResourceId.ts` (002, `tryParseResourceId`),
  `src/data/Registry.ts` (`RegistryError`), and 174's `DimensionManager` (integration test).

## Proposed change
1. `src/data/DimensionTypes.ts` (NEW): the two canonical `DimensionType` constants and
   `dimensionSaveNamespace`.

## Compatibility and migration
- One new data module; zero registry changes, zero characterization updates, no `Game.ts` edit, no
  schema/save-format change. Existing code untouched.

## Risks
- **Parameter drift from vanilla** (wrong minY/height/fixed time would poison every downstream
  change). Mitigation: every parameter is pinned by a dedicated test, including the exact
  `containsY` boundaries and section counts.
- **The save-namespace rule being bypassed** (a malformed key reaching persistence). Mitigation:
  `dimensionSaveNamespace` is the only namespace entry point and rejects malformed keys with
  `INVALID_ID`; tests cover empty, whitespace, empty-path, and un-namespaced inputs.

## Rollback strategy
One new data module with no other changes; reverting removes the feature cleanly.

## Definition of Done
- Both canonical types defined with vanilla parameters; the Nether registers through 174's
  `DimensionManager` under `minecraft:the_nether` with a fresh queue.
- Unit tests cover: overworld bounds/rules (minY −64, 24 sections, skylight, natural, no fixed
  time); Nether bounds/rules (minY 0, 16 sections, no skylight, ultrawarm, non-natural,
  fixedTime 18000, exact containsY edges); manager registration; save-namespace valid/invalid keys.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
