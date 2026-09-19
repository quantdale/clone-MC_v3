# Proposal: 281-workstation-ui

## Problem

The playable game has a live furnace and brewing stand, but the workstation
catalog still has no faster food-style cooking station. The verified furnace
engine, menu transaction path, block-entity persistence, and procedural atlas
already provide the seams needed for a narrow workstation addition. A smoker
can therefore add useful playability without inventing a second container or
storage protocol.

## Goals

- Add a stable, placeable smoker block and item using original procedural art.
- Reuse the validated `FurnaceState`, menu transactions, XP handling, and
  `block-entities` snapshots rather than creating a parallel inventory shape.
- Run the same processing recipe catalog at exactly half the furnace cooking
  time (`ceil(base / 2)`, with a minimum of one tick for a valid recipe).
- Wire place, open, live fixed-tick processing, save/reload, close, walk-away,
  and break/drop behavior through the existing Game lifecycle.
- Reuse the furnace panel shell while making the active station name visible
  and stable for browser automation and assistive labels.
- Prove the integration with focused unit tests, a real browser journey, the
  baseline gates, file-audit/state validation, and an exact C281 parity row.

## Non-goals

- No blast furnace, new food recipes, recipe-catalog redesign, hopper/automation
  expansion, villager spawning, workstation POI claiming, village generation,
  raids, or villager schedule/restock behavior.
- No new persistence namespace or payload version. Smoker rows use the existing
  `block-entities` envelope and the already registered `smoker` type key.
- No multiplayer/network protocol work, raster asset import, render-pipeline
  rewrite, visual-golden re-pin, headed FPS/GPU work, or Change 258 activity.

## Preconditions

- Change 280 is VERIFIED and published; Changes 259–280 remain VERIFIED.
- Change 258 remains BLOCKED because headed hardware-WebGL certification is not
  available on this host.
- The furnace state/menu engine (109/110), live host (251), brewing UI (260),
  persistence facade/archive, interaction registry, and procedural atlas are
  the current authorities.

## Dependencies

- `FurnaceBlockEntity` and `FurnaceRecipes` for validated state, recipes, fuel,
  menu transactions, timers, and XP.
- `LiveBlockEntityHost` and `BlockEntityRecord` for one-instance ownership,
  quarantine, stale cleanup, and chunk snapshots.
- `FurnacePanel`, `Game`, `PlayerInteraction`, registries, and the existing
  block/item loot path for the player-facing integration.

## Proposed change

Register `BlockId.Smoker = 64` and `ItemId.Smoker = 72`, with a procedural
smoker tile and a pickaxe-harvestable solid block. Add a small smoker entity
adapter with type key `smoker` that serializes the exact furnace payload and a
pure `createSmokerContext` wrapper that halves only the cooking-time function;
fuel burn rules, result items, and XP remain the injected furnace rules.

Extend `LiveBlockEntityHost` with smoker placement, state reads, atomic menu
writes, fixed-tick advancement, hydration, experience draining, removal, and
stale-block cleanup. `Game` and `PlayerInteraction` dispatch smoker use and
placement into the shared furnace panel/session, while the panel displays
`Smoker` and closes/settles through the same one-container contract.

## Compatibility and migration

Existing furnace records remain byte-compatible and continue to use
`typeKey: "furnace"`. New smoker records use the existing schema version and
payload fields with `typeKey: "smoker"`; old clients that do not understand
that type will ignore it during hydration rather than reinterpret it as a
furnace. No existing save is migrated, rewritten, or given a new namespace.

All existing `LiveBlockEntityHost` callers remain valid because the smoker
context is additive/optional at the host boundary. Existing furnace panel
fixtures remain valid when the optional title element is absent.

## Risks

- Shared UI/session state could accidentally leave a smoker open as a furnace;
  an explicit station kind and DOM title test pin that identity.
- A stale smoker row could survive block removal or duplicate on reload; the
  host will use the same lazy stale cleanup, coordinate dedupe, and empty
  snapshot invalidation as furnaces.
- A menu transaction could lose an item when the block disappears; the shared
  furnace panel's existing validate-before-write and cursor-settlement rules
  must remain unchanged.

## Rollback strategy

Revert the 281 implementation and documentation commits. Existing furnace
records, item ids, and persistence namespaces are unchanged; no destructive
save migration is required.

## Definition of Done

- The complete 281 package is specified and validated before implementation.
- Smoker placement/opening visibly selects the smoker station and uses the
  shared menu atomically.
- A valid recipe completes in half the furnace cooking ticks, with exact
  result/XP/fuel and fixed-tick/non-simulating behavior preserved.
- Save/reload, walk-away, break, drop, stale cleanup, and duplicate placement
  have focused evidence; no record is silently lost or duplicated.
- Typecheck, lint, full unit, build, exact E2E, file-audit, state validation,
  and the C281 parity row are complete; 281 is VERIFIED and published.

## Advancement gate

Advance only at 100% task completion with every MUST/SHALL requirement covered,
all required commands green, no unresolved lifecycle/persistence/regression
blocker, Change 258 still BLOCKED, and `origin/main` verified at the published
release tip.
