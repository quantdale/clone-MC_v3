# Proposal: 186-core-progression-advancements

## Problem
185 built the advancement framework but no advancements exist: the meta-progression layer has no
catalog. The survival→Nether→End journey — the game's core progression — has no in-game recognition.

## Goals
- `src/simulation/CoreProgressionAdvancements.ts` (NEW): the first advancement CATALOG as data over
  185's framework — a 7-advancement chain in play order:
  1. `minecraft:stone_age` (obtain wooden pickaxe)
  2. `minecraft:acquire_hardware` (obtain stone pickaxe)
  3. `minecraft:iron_tools` (obtain iron pickaxe)
  4. `minecraft:diamonds` (obtain diamond)
  5. `minecraft:enter_the_nether` (dimension_enter the_nether)
  6. `minecraft:enter_the_end` (dimension_enter the_end)
  7. `minecraft:free_the_end` (boss_defeat ender_dragon, reward experience 500 — vanilla)
- Accessors: `coreProgressionAdvancements()` (ordered), `getCoreProgressionAdvancement(key)`,
  `firstCoreProgressionAdvancement()`, `finalCoreProgressionAdvancement()`.
- Every definition uses only 185's typed criteria; rewards are definition data (185 models granting
  as wiring).

## Non-goals
- **No reward granting, no advancement UI** (202+), **no statistics** (187), **no expansion of
  185's criterion union** (count-based criteria can come later), **no `Game`/`World` wiring**.

## Preconditions
- Change 185 (`advancement-framework`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/AdvancementFramework.ts` (185), `src/data/ResourceId.ts` (002).

## Proposed change
1. `src/simulation/CoreProgressionAdvancements.ts` (NEW): the catalog and four accessors.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Chain-order drift** (an out-of-order catalog would mislead progression tracking). Mitigation:
  the ordered keys are pinned by a test, as are the arc endpoints (first = item, last = dragon).
- **Criteria payload typos** (a wrong item/dimension key silently never fires). Mitigation: a test
  asserts every criterion has a non-empty string payload and that both dimension criteria use the
  canonical keys.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- The 7-advancement chain defined; the four accessors implemented.
- Unit tests cover: chain order/arc; criterion validity; lookup (found/unknown); the vanilla
  experience reward; chain completion through 185's real framework (enter_the_nether, free_the_end,
  and the wrong-dimension identity no-op).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
