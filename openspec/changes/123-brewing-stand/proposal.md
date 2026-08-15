# Proposal: 123-brewing-stand

## Problem

The game has no brewing mechanics. Change 122 defined potion *contents* as an item
component, but nothing yet brews one potion from another plus an ingredient, consumes
fuel, tracks brew timing, or persists the stand's progress. Without this, potions
cannot be produced from the data 122 established.

## Goals

- Define brewing recipes as data: a deterministic table matching a bottle's current
  base potion + an ingredient item to a result (new base name and/or new effects).
- Implement a `BrewingStand` block-entity core: three logical slots (one bottle, one
  fuel, one ingredient), fuel-driven timing, a brew progress timer, recipe application
  on completion, ingredient/fuel consumption, and an immutable per-tick state machine.
- Provide persistence (serialize/deserialize) and `BlockEntityInstance` integration,
  mirroring the 109 furnace pattern.
- Reuse the 122 `potion_contents` component to read the bottle's current potion and to
  write the brewed result; no new component is introduced.

## Non-goals

- No placement/breaking of the brewing-stand block, no `Game` tick wiring, no menu UI
  (those are downstream; this change is the tick engine + data + persistence).
- No full vanilla recipe catalog. A small, deterministic starter table is provided;
  more recipes are additive data in `createDefaultBrewingContext`.
- No experience from brewing (out of scope for this change).
- No splash/lingering conversion of brewed bottles (downstream consumer concern).

## Preconditions

- Change 122 (`potion-item-data`) is VERIFIED and published; `POTION_CONTENTS_COMPONENT`,
  `PotionContents`, `createPotionContents`, `potionContentsComponentType` exist.
- The 109 furnace block-entity pattern exists (`FurnaceBlockEntity`, `BlockEntityInstance`,
  `MenuSlot` with an optional `components` field) as the structural precedent.

## Dependencies

- 122 `PotionItemData` (component read/write + factory) for bottle contents.
- 109 `FurnaceBlockEntity` / `BlockEntityManager` for the block-entity integration shape.
- `MenuTransaction` (`MenuSlot`) for slot typing; `MenuSlot.components` MUST be extended
  to carry per-slot item components (optional, additive).

## Proposed change

Add:

- `src/inventory/BrewingRecipes.ts` — `BrewingContext` (recipe `match(base, ingredient):
  BrewingRecipeOutput | null` + `fuelBurnTicks(item)` + `brewTicks()`), `BrewingRecipeOutput`
  (`{ base?: string; customEffects?: PotionEffectData[] }`), and
  `createDefaultBrewingContext()` with a small starter table (water+nether_wart →
  awkward; awkward+redstone → extended; awkward+glowstone → strong; awkward+fermented_
  spider_eye → mundane; awkward+speed_reagent → speed potion; awkward+strength_reagent →
  strength potion; awkward+healing_reagent → healing potion). Blaze powder is fuel.
- `src/world/BrewingStandBlockEntity.ts` — `BrewingState` (slots `bottle`, `fuel`,
  `ingredient`; timers `brewTime`/`brewTimeTotal`; `fuelBurnTime`/`fuelBurnTimeTotal`),
  strict `validateBrewingState`, pure `tickBrewing`, `serializeBrewingState` /
  `deserializeBrewingState`, block-entity factory/read/update, and progress helpers.
- Extend `MenuSlot` (`src/inventory/MenuTransaction.ts`) with an optional `components?`
  field (record of component id string → value), defaulting to undefined; additive and
  backward compatible with 109.

## Compatibility and migration

- `MenuSlot.components` is optional; all existing furnace/chest code that constructs or
  spreads `MenuSlot` keeps working (existing slots have `components === undefined`).
- `BrewingState` is a new self-contained envelope; no existing persisted schema field is
  modified. Serialization is lossless and re-validated on read.
- Bottle contents travel through the existing `potionContentsComponentType`; the 122
  contract is unchanged.

## Risks

- A bottle whose `potion_contents` value fails `potionContentsComponentType.validate` is
  treated as "no valid potion" (cannot brew from it), rather than throwing mid-tick, so a
  malformed stored potion pauses brewing safely.
- A recipe that would produce a potion the bottle cannot represent (e.g. invalid effect
  data) is caught by `createPotionContents` at application time; the tick treats a failed
  application as a paused brew (no consumption), preserving determinism.

## Rollback strategy

- Additive: one new engine file, one new recipes file, a one-field additive extension to
  `MenuSlot`, and registry/block-entity type constants. Reverting the commit removes them
  with no impact on prior changes.

## Definition of Done

- `BrewingContext` matches known recipes and returns null for unknown pairs.
- `tickBrewing` consumes fuel only when brewing can progress, advances `brewTime`, and on
  completion consumes one ingredient, writes the brewed `PotionContents` into the bottle
  via `potion_contents`, and resets timers.
- State machine is immutable (returns a new state; never mutates input) and deterministic.
- Serialize/deserialize round-trips and re-validates.
- Unit tests cover recipe matching, fuel-light, brew completion, modifier (redstone)
  extension, invalid/missing potion handling, and 109/122 regression.
- Full baseline gate green (typecheck, lint, `npm test`, build, e2e).

## Advancement gate

Target 100%. Floor 90% with an explicit Advancement Exception if any non-blocking task
is incomplete. Required tests MUST pass and no MUST/SHALL may be unmet.
