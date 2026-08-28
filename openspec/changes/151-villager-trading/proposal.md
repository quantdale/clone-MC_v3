# Proposal: 151-villager-trading

## Problem
150 gave a villager a profession and a claimed workstation, but a profession has no consequence yet:
there are no trade offers, no way to exchange items with a villager, no use limits or restocking,
and no villager XP/level progression. The master plan's "17.5 Villagers" list names trading offers,
restocking, and progression as core to the subsystem.

## Goals
- A `TradeOffer` data model: two input items (the second optional, matching vanilla's two-slot
  trade), one result item, a `maxUses` limit, a `usesRemaining` counter, and an `xpReward`.
- A `VillagerTradeState` per villager: its offer list plus a villager level/XP pair.
- `createOffersForProfession(professionKey, level)`: a deterministic, data-driven offer table
  producing that profession's offers unlocked at or below `level`.
- `canAcceptTrade(offer, offeredA, offeredB)`: whether a supplied pair of input stacks satisfies an
  offer (correct items, sufficient counts, offer not exhausted).
- `applyTrade(state, offerIndex, offeredA, offeredB)`: pure — returns the resulting
  `{ state, result, consumedA, consumedB }`, decrementing `usesRemaining`, adding `xpReward` to the
  villager's XP, and leveling the villager up when its XP crosses the level threshold; rejects an
  ineligible trade without mutating anything.
- `restock(state)`: resets every offer's `usesRemaining` to `maxUses` (vanilla's workday restock),
  returning a new state.
- `buildTradeMenu(state, offerIndex, playerSlots)`: projects one offer into a 106 `ContainerMenu`
  (two input slots + one result slot, then the player region) so a future UI change can drive
  trading through the same transactional slot machinery every other container screen uses.

## Non-goals
- **No DOM trading UI.** 203 (`container-screen-framework`) is the titled change for reusable menu
  UI; `buildTradeMenu` produces the `ContainerMenu` *state* a screen would render, exactly as 120's
  `EnchantingTableSession` produced session state without its `EnchantingPanel` (an explicit,
  still-unbuilt non-goal of 120 to this day).
- **Not wired into `Game`.** No villager is ever spawned (150's own inherited blocker — no village/
  structure generation exists), so there is nothing to trade with; additive/unconsumed exactly like
  148/149/150.
- **No player-inventory integration** — `applyTrade` takes and returns plain stack values; deducting
  the inputs from and inserting the result into a real `Inventory` is the future UI/wiring change's
  job.
- **No gossip/reputation price modifiers, no demand-based price drift, no Hero-of-the-Village
  discount** — vanilla's price-adjustment layer is a separate, later concern; offers here have fixed
  costs.
- **No trade-offer persistence** — session-only, matching 145-150's identical non-persistence
  simplification.
- **No automatic timed restocking** — `restock` is an explicit call; the workday-schedule trigger
  (using 150's `scheduleForHour`) belongs to the future AI-wiring change.

## Preconditions
- Change 150 (`villager-professions`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/VillagerProfession.ts` (150, profession keys), `src/inventory/MenuTransaction.ts`
  (106, `ContainerMenu`/`MenuSlot`/`createContainerMenu`), `src/inventory/ItemRegistry.ts`
  (`ItemId`/`ItemTypeRegistry` for stack caps and item identity).

## Proposed change
1. `src/simulation/VillagerTrading.ts` (NEW): `TradeItem`, `TradeOffer`, `VillagerTradeState`
   interfaces; `VILLAGER_MAX_LEVEL`, `XP_PER_VILLAGER_LEVEL` constants;
   `createOffersForProfession`; `createVillagerTradeState`; `canAcceptTrade`; `applyTrade`;
   `restock`; `buildTradeMenu`.

## Compatibility and migration
- One new, additive file. No existing module edited; no `Game.ts` edit; no schema/save-format
  change; no migration.

## Risks
- **`buildTradeMenu` produces a `ContainerMenu` whose result slot is not write-protected** — 106's
  `applyMenuTransaction` has no read-only-slot concept, so a future UI must gate result-slot
  interaction itself (documented in design.md, flagged rather than silently assumed).

## Rollback strategy
One additive file; reverting fully removes the feature with no other impact.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: `createOffersForProfession` level-gating and per-profession content;
  `canAcceptTrade` accept/reject (wrong item, insufficient count, exhausted offer, missing optional
  second input); `applyTrade` success (result returned, uses decremented, villager XP added, level
  raised at the threshold, capped at `VILLAGER_MAX_LEVEL`) and rejection (state untouched);
  `restock` resets uses; `buildTradeMenu` slot layout/counts.
- Full gate green: typecheck, lint, unit, build (module count unchanged — additive/unconsumed,
  mirroring 148/149/150's identical evidence), e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
