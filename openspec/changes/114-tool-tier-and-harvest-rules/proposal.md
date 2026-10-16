# Proposal: 114-tool-tier-and-harvest-rules

## Problem

The current harvest model (`src/player/PlayerInteraction.ts` `getBreakDuration`,
`src/world/BlockRegistry.ts` `preferredTool`, `src/inventory/ItemRegistry.ts`
`toolKind`/`toolPower`) implements only a single preferred-tool speed bonus. It
has no concept of **mining level / tool tier**, and it always drops a block's
loot regardless of the tool used. That diverges from Minecraft parity in two
ways:

1. A block that requires a tool (e.g. stone) currently drops even when broken
   by hand or by the wrong tool kind. In Minecraft such blocks drop **nothing**
   unless broken by a tool of the correct kind at or above the required tier.
2. Tool effectiveness is decided by a single hard-coded `preferredTool` enum
   field rather than by data-driven **tags** (`minecraft:mineable/<kind>`), which
   is the extensible mechanism used by data packs (change 212) and later
   progression changes.

## Goals

- Introduce a **mining level** on block definitions and a **tool tier** on tool
  item definitions.
- Express preferred-tool / mineable relationships through **tags**
  (`minecraft:mineable/pickaxe|axe|shovel`, `minecraft:tools/pickaxe|axe|shovel`)
  instead of a single enum field, while keeping `preferredTool` as the bootstrap
  source of truth for those tags.
- Apply the correct **break speed**: a tool only grants its `toolPower`
  multiplier when it is the effective tool (right kind, sufficient tier for
  blocks that require one).
- Apply the correct **drop rule**: a block yields loot only when harvestable;
  blocks requiring a tool yield nothing when broken without a sufficient-tier
  tool of the correct kind.
- Keep the behavior deterministic, registry-driven, and bootstrapped safely.

## Non-goals

- Durability damage/break/repair logic (change 115) — tools still take damage as
  before; no new durability math here.
- Armor protection (change 116) — unrelated.
- Enchantment mining-speed/fortune effects (change 119) — the multiplier hook is
  left intact but no enchantment behavior is added.
- New blocks, biomes, or world content (change 215+) — only the existing block
  and tool catalog is annotated with tiers/tags.
- Silk Touch / Fortune loot modifiers — loot-table conditions may be added later;
  this change only gates *whether* a drop occurs.

## Preconditions

- Change 113 (`equipment-slots`) is VERIFIED and the program has advanced to 114.
- `BlockRegistry`, `ItemRegistry`, and `TagRegistry` (change 005) exist and are
  stable.
- `LootTableRegistry` (change 011) routes block drops; `PlayerInteraction`
  consumes it.

## Dependencies

- Change 005 (tag registry) — provides the tag model used for mineable/tool tags.
- Change 004 / 008 / 009 — block/item registries and item-component model.
- Change 011 — loot tables that produce drops (this change only gates them).

## Proposed change

1. `BlockTypeDefinition` gains `miningLevel?: number` (default `0`). Blocks that
   require a tool set `miningLevel = 1`.
2. `ItemTypeDefinition` gains `toolTier?: number` (default `0`). Wooden tools
   = `1`, Stone tools = `2`.
3. New block-domain `TagRegistry` from `createDefaultBlockTags(blockRegistry)`
   with `minecraft:mineable/pickaxe|axe|shovel` tags built from each block's
   `preferredTool`.
4. New item-domain `TagRegistry` from `createDefaultItemTags(itemRegistry)` with
   `minecraft:tools/pickaxe|axe|shovel` tags built from each item's `toolKind`.
5. New `HarvestRules` (`src/world/HarvestRules.ts`) constructed from the two tag
   registries, exposing `isEffectiveTool`, `canHarvest`, and `getBreakDuration`.
6. `PlayerInteraction` accepts an optional `harvestRules` and gates drops on
   `canHarvest`; `getBreakDuration` is delegated to `HarvestRules` when present,
   with the legacy def-field path retained as a fallback.
7. `Game.ts` builds and injects the tag registries and `HarvestRules`.

## Compatibility and migration

- No persisted-data schema changes. `miningLevel`/`toolTier` are new optional
  registry fields defaulting to `0`, so saved worlds are unaffected.
- `preferredTool` is retained on `BlockTypeDefinition` and remains the source
  used to populate the mineable tags; the speed/drop decisions now read tags,
  not the raw enum.
- `PlayerInteraction`'s constructor gains an optional field; existing callers
  that do not pass `harvestRules` keep current behavior (always drop, legacy
  bonus) so all prior unit tests stay green.

## Risks

- **Regression in drop behavior**: gating drops could make blocks that previously
  always dropped now yield nothing when mined by hand. Mitigated by defaulting
  `miningLevel = 0` (drop with hand) for every current non-ore/non-stone block,
  and by only setting `miningLevel = 1` on blocks that genuinely require a tool
  (stone, ores, cobblestone, bricks, furnace).
- **Tag bootstrap failure**: building tags from the registry requires every
  referenced resource to exist. Mitigated by deriving tag members directly from
  the already-validated block/item registries and finalizing against the same
  registries' `hasByResourceId` checks.

## Rollback strategy

The change is additive (new fields, new optional wiring, new module). If a
regression is found, reverting the `harvestRules` injection in `Game.ts` and the
drop gate in `PlayerInteraction.finishBreak` restores prior behavior without
touching the data model.

## Definition of Done

- `BlockTypeDefinition.miningLevel` and `ItemTypeDefinition.toolTier` exist and
  are populated for the relevant blocks/tools.
- `createDefaultBlockTags` / `createDefaultItemTags` build and finalize tag
  registries derived from the block/item registries.
- `HarvestRules` correctly decides effective tool, harvestability, and break
  duration from tags + tiers.
- `PlayerInteraction` applies the correct speed and drop rules via `HarvestRules`
  in production, with the legacy path preserved for non-injected callers.
- Unit tests cover effective tool, insufficient tier, wrong kind, no-tool, and
  `miningLevel = 0` cases; an integration test verifies no-drop on wrong tool.
- Full baseline regression gate is green (typecheck, lint, unit, build, e2e).

## Advancement gate

100% task completion, all MUST/SHALL requirements verified by tests, and the
baseline regression gate (`npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run test:e2e`) fully green.
