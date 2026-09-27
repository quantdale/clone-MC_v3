# Proposal: 298-glass-bottles-and-drinkable-potions

## Problem

Survival potions are still open at both ends. Brewing (123/260), splash
brewing (297) and splash throwing (295) all work, but they only start from
the 260 `testGrantAwkwardBottle` seam, and a brewed normal potion does nothing
when used:

- there is no glass bottle and no water bottle;
- `potion_contents` rejects base-only potions (empty `customEffects`), so the
  vanilla water → awkward brew pauses on completion;
- right-click only throws SPLASH potions, so NORMAL potions cannot be drunk.

## Inspection findings (base `2ecf781`)

- `ItemRegistry`: 73 legacy ids (last `Gunpowder = 73`). Atlas tile 76 is
  unused (tiles 0–79 exist; nothing references 76).
- **Glass** exists (`ItemId.Glass`, placeable, smelted/crafted from sand,
  default hotbar slot 7 with count 0).
- **Crafting**: `CraftingPanel` renders a button for every recipe, plus a
  summary line listing **every item used as a recipe ingredient** as
  "Name: count" in registry order (today: Stone, Sand, Wood Log, Oak Planks,
  Cobblestone, Stick). The `container-ui` visual goldens (6 cells) capture
  that panel. Glass is not an ingredient today, so a glass-bottle recipe
  (3 glass → 3 bottles) would add "Glass: 0" to the summary line **and** a
  recipe row.
- **Nether wart** exists as an item and crop block (`ItemId.NetherWart = 59`),
  but there is no Nether, so survival players have no source. Creative
  players and setup can get it.
- **Water**: water blocks are non-solid and have no selection shape, so the
  interaction raycast passes through them. There is no live flowing-fluid
  state (`FluidState` is unused), so every live water block is a source.
- **Potion contents**: `createPotionContents` and the component read guard
  both require a non-empty `customEffects`. The starter recipe
  water + nether wart → awkward outputs `customEffects: []`, so the engine
  pauses at completion (the 123 pinned rule).
- **Witch drops (297)**: the vanilla witch table already carries
  `glass_bottle` (weight 1, count 0–2). It is discarded today only because the
  item is missing.
- **Use input**: `PlayerInteraction` calls `onUseItem` on right-click (wired to
  splash throwing). `InputManager.isUseHeld()` reports a held right button.
  A raised offhand shield drains place requests (`blockUse`).
- **Eating** is instant (`tryEatSelected`). `buildConsumePayload` in
  `PotionItemData` is unused.
- **Milk / bucket / glowstone dust / fermented spider eye**: none exist.
- **Durable saves (289)**: `savePlayerStateDurable()` persists the inventory
  snapshot, including stack components.

## Goals

1. `glass_bottle` item (`ItemId.GlassBottle = 74`, `minecraft:glass_bottle`,
   stack 64, icon tile 76 with original art; no existing tile moves).
2. Bottle sources:
   - The vanilla crafting recipe (3 glass → 3 bottles) is added **only if** a
     controlled golden experiment shows the `container-ui` diff is solely the
     new recipe row (the user's re-pin rule). Otherwise the recipe is not added
     and the gap is documented.
   - Either way, raid witches drop glass bottles from the existing vanilla
     table, and drinking returns bottles.
3. Filling: using a glass bottle while looking at water in reach (a fluid
   raycast that stops at the first non-air cell) yields a water bottle
   (`potion` + `potion_contents {base minecraft:potion/water, NORMAL, []}`).
   - Survival/adventure consume one bottle.
   - Creative keeps the bottle and adds a water bottle only if none is already
     held (vanilla `createFilledResult`).
   - Spectators cannot fill.
   - The inventory is saved durably.
4. Base-only potions: `potion_contents` accepts an empty `customEffects` iff
   `base` is a non-empty string (vanilla water/awkward/mundane). The real
   water + nether wart brew then completes to an awkward potion with no seam.
   Awkward + redstone → speed and + gunpowder → splash keep working.
5. Drinking: holding use on a NORMAL potion drinks it over vanilla's
   **32 ticks**. Releasing use (or switching slot, changing the stack, opening
   a menu, dying, changing to spectator) cancels it with nothing consumed.
   - On completion, instant health/harming apply immediately at full
     potency, and duration effects apply at full duration.
   - Survival/adventure get an empty glass bottle back. Creative keeps the
     potion and gets no bottle. Spectators cannot drink.
   - A water bottle has no effect but still returns a bottle.
   - The inventory is saved durably.
   - A drinkable potion in the mainhand takes priority over raising an
     offhand shield (vanilla mainhand-first use).
6. Milk: absent (no milk, bucket or cow milking). Documented as a gap, not
   implemented.
7. Unit tests plus a browser E2E: a witch drops bottles → pick up → fill at
   water → brew water + wart → awkward → + redstone → speed in a real stand →
   hold right-click to drink → speed effect plus an empty bottle; also
   cancel mid-drink, creative behaviour and reload persistence.

## Non-goals

- Milk buckets and buckets in general, cauldrons, dispensers, lingering
  potions, dragon's breath, glowstone dust, fermented spider eyes, a survival
  nether wart source (no Nether), drinking movement slowdown, drink
  particles/sounds beyond the existing audio set.
- TNT recipe, live creepers, any 258 headed work.

## Impact

`ItemRegistry`, `TextureAtlas`, `PotionItemData`, possibly `RecipeRegistry`
(experiment-gated), new `src/simulation/PotionDrinking.ts` and
`src/simulation/BottleFilling.ts`, `Game` (use dispatcher, drink tick,
shield priority, durable saves, seams), unit and E2E tests, docs.
