# Proposal: 120-enchanting-table

## Problem
Change 118 delivered the enchantment *registry* and 119 delivered *effect
application* (mining/durability/armor pathways read enchantments off an
`ItemStack`). But there is still no way for a player to *acquire* enchantments:
no enchanting table block, no lapis/book items, no mechanism to spend XP and
lapis, and no cost/offer generation. Enchanted items therefore cannot be produced
in-game, so 119's effects are unreachable by normal play.

## Goals
- Register the missing data: `enchanting_table` + `bookshelf` blocks, `lapis_lazuli`
  + `book` items, and a per-item `enchantability` flag used by cost math.
- Add an XP-spend primitive to `ExperienceSystem` (the 117 system only rises).
- Implement a deterministic, seed-driven enchanting-table core that, given the
  held item, the nearby bookshelf count, the player's level, and the world seed,
  generates three costed offers (the "table interaction" contract).
- Implement the payment: applying an offer consumes the matching XP levels and
  lapis and attaches the enchantments via `setStackEnchantments` (119).
- Wire a logic-level interaction hook so right-clicking an `enchanting_table`
  opens a session for the targeted block; expose offers and an `apply` action.

## Non-goals
- **DOM enchanting UI panel.** The pure `EnchantingTableSession` contract + the
  `Game` `use`-interaction hook are the interaction deliverable for 120. A
  rendered `EnchantingPanel` (mirroring `CraftingPanel`) is a presentation-layer
  follow-up change so 120 stays narrow and fully testable without a half-built UI.
- **Bookshelf world-scanning geometry.** The core consumes a `bookShelves: number`
  (already clamped 0..15 by the caller); the caller computes it from the world.
  The exact 5×5×? occlusion scan is simplified to a count check (see design).
- **Treasure / curse enchantments, anvil, grindstone, mending.** Out of scope;
  later changes reuse the same core + `setStackEnchantments`.
- **Enchantment persistence across reload.** Same `StackComponentMap` JSON gap as
  119; `InventorySnapshot.version` stays `1`.

## Preconditions
- `118-enchantment-registry` VERIFIED (`EnchantmentRegistry`, `EnchantmentInstance`,
  `validateEnchantmentList`, `createDefaultEnchantmentRegistry`).
- `119-enchantment-application` VERIFIED (`setStackEnchantments`, `getStackEnchantments`,
  effect primitives).
- `117-player-experience` VERIFIED (`ExperienceSystem`).
- `MenuTransaction` (106) and `SeedRng` (054) available for deterministic streams.

## Dependencies
- `118-enchantment-registry` (registry + validation).
- `119-enchantment-application` (`setStackEnchantments` write path).
- `117-player-experience` (`ExperienceSystem`, needs new spend primitive).
- `054-deterministic-rng-streams` (`SeedRng` / `createNamedRng`).

## Proposed change
1. **Data** (`ItemRegistry.ts`, `BlockRegistry.ts`): add `lapis_lazuli` (27→28),
   `book` (28→29), `bookshelf` (29→30) item ids and `enchanting_table` (21),
   `bookshelf` (22) block ids; register definitions; add `enchantability?: number`
   to `ItemTypeDefinition` and seed it on enchantable items (existing
   `WoodenPickaxe`/`StonePickaxe`/`WoodenAxe` + the new `book`).
2. **XP spend** (`ExperienceSystem.ts`): `spendLevels(n)` removes `n` levels
   (clamped, keeps `xp` consistent via `computeXpToNext`), no-op on bad input;
   `snapshot`/`restore` unchanged.
3. **Core** (`src/inventory/EnchantingTable.ts`, NEW): pure, deterministic
   `slotCost`, `generateEnchantments`, `enchantCosts`, `countBookshelves`
   (caller-supplied or world scan helper), and `createSession` returning an
   `EnchantingTableSession` with `offers` + `apply`.
4. **Interaction** (`PlayerInteraction.ts`, `Game.ts`): add a `use`/interact
   branch; right-clicking `enchanting_table` opens a session for the held item +
   nearby bookshelves; `apply(offerIndex)` spends XP/lapis and enchants.

## Compatibility and migration
- Item/block ids are dense additions; cross-registry `finalize` checks still pass.
- `enchantability` is optional → backward compatible with existing items.
- `ExperienceSystem.spendLevels` is additive; `snapshot` shape (`version:1`) unchanged.
- `InventorySnapshot.version` stays `1`; no persisted field added.

## Risks
- Exact Minecraft cost/level numbers are not reproduced (independent, procedural
  algorithm). The contract is deterministic, bounded, and tested — not byte-faithful.
- Without a DOM panel the feature is logic-complete but not yet player-facing;
  explicitly deferred, not silently dropped.

## Rollback strategy
- Each piece is additive (new module, new optional field, new input branch);
  reverting 120 returns to 119 behavior (no enchantment acquisition).

## Definition of Done
- `enchanting_table`/`bookshelf` blocks and `lapis_lazuli`/`book` items registered
  and cross-validated.
- `ExperienceSystem.spendLevels` spends deterministically with invariants intact.
- `EnchantingTable` generates three deterministic, costed offers; `apply` consumes
  XP + lapis and attaches valid, conflict-free, applicable enchantments.
- `use` interaction opens a session for the table; offers/apply exercised by tests.
- Full gate green: typecheck, lint, unit, build, e2e.

## Advancement gate
- Target 100% task completion plus all MUST/SHALL requirements and tests passing;
  the DOM panel is an explicit non-goal (not a missing requirement).
