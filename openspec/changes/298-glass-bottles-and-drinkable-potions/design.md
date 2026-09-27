# Design: 298-glass-bottles-and-drinkable-potions

## D1. Glass bottle item and icon

- `ItemId.GlassBottle = 74` (the next legacy id; existing save identity numbers are unchanged).
  Definition: `{ id: 74, resourceId: minecraft:glass_bottle, key: 'glass_bottle',
  name: 'Glass Bottle', iconTile: TILE_INDEX.glassBottle (76), stackSize: 64 }`.
  It is not placeable, not food, and has no durability.
- `TILE_INDEX.glassBottle = 76`, painted last with original art: an empty clear
  bottle silhouette with a cork and a specular streak, and no liquid. Why this
  cannot change any golden:
  - `drawTile` paints only its own 16×16 cell and seeds a per-tile PRNG.
  - The texture uses Nearest filtering with no mipmaps.
  - The creative menu lists placeable items only.
  - No default inventory holds bottles.
- Water bottle = the existing `potion` item (stack 1) carrying
  `potion_contents { base: 'minecraft:potion/water', kind: 'NORMAL', customEffects: [] }`
  (`WATER_BASE` from `BrewingRecipes`). There is no separate item: vanilla uses
  `minecraft:potion` with water contents too.

## D2. Bottle sources and the crafting-panel golden rule

The vanilla recipe is 3 glass in a V → 3 bottles. The clone's crafting is
shapeless ingredient-count (`CURRENT_RECIPE_SPECS`), so the recipe would be
`glass ×3 → glass_bottle ×3`. `CraftingPanel` is captured by the 6 `container-ui`
golden cells, so the user's rule applies:

1. Capture `container-ui` twice on the unchanged tree into throwaway golden
   directories (`VISUAL_GOLDEN_ENV=exp298-before{,2}`, `UPDATE_SNAPSHOTS=1`,
   `SCREEN_FILTER=container-ui`). This measures the capture noise floor.
2. Temporarily add the recipe, then capture `exp298-after`.
3. Diff every cell pixel-by-pixel (channel tolerance 24, the visual gate's
   tolerance). Record the changed-pixel bounding boxes, crops and diff images
   under `/workspace/298-golden-experiment/`, and summarise them in
   `verification.md`.
4. **Decision rule:**
   - The recipe is kept, and only the 6 `container-ui` goldens are re-pinned,
     iff every changed region lies inside the new recipe row.
   - If anything else changes (in particular the ingredient summary line,
     which lists every ingredient item and would gain "Glass: 0", or rows
     shifting), the recipe is **not** added.
   - Either way the experiment directories are deleted and the temporary
     recipe reverted before commit.
5. Sources that exist regardless of the decision:
   - Raid witches drop `glass_bottle` from the 297 vanilla table (ticket 4,
     count 0–2). It was discarded as a missing item before; now it drops as a
     real item entity. No code change is needed beyond the item.
   - Drinking a potion returns a bottle (D5).

## D3. Base-only potion contents (legacy alignment)

`createPotionContents` and `potionContentsComponentType.validate` accept
`customEffects: []` **iff** `base` is a non-empty string. A contents object
with neither effects nor base stays invalid (the 122/123 "no-op potion" guard
still holds). Consequences:

- The 123 starter recipe water + nether wart → awkward (`customEffects: []`)
  now completes. `applyMatch` builds `{base: 'minecraft:potion/awkward',
  kind, customEffects: []}`, which validates, so the bottle becomes awkward.
  The 123 "pause" rule remains for truly invalid outputs.
- Tests that pinned the old rule are updated. This is recorded as a
  legacy alignment in verification.
- `getEffectiveEffects` is unchanged: a base-only potion has no effects.

## D4. Filling (`src/simulation/BottleFilling.ts`, pure)

- `fluidRaycast(origin, dir, reach, getBlock)`: a DDA (`raycastVoxel`) whose
  sampler treats every **non-air** cell as a hit. It returns the first hit
  cell and its block id.
  - Vanilla `ClipContext.Fluid.SOURCE_ONLY`: the first outline or source
    fluid stops the ray.
  - Every live water block is a source (no live flowing state), so a hit on
    `BlockId.Water` is fillable. Any other first hit (solid, glass, plants)
    blocks the fill.
  - Reach = `CONFIG.reach` (5). The origin is the player's eye position, and
    the direction comes from yaw/pitch (the same basis as throw aiming).
- `bottleFillDecision({canInteract, deathScreenOpen, gameMode(depletes),
  stackCount, isGlassBottle, hitWater, hasWaterBottle, canInsert})`:
  - Refused for spectators, the death screen, an empty hand, a held item
    that is not a glass bottle, or no water hit.
  - **Survival/adventure** (`depletes`): consume one bottle.
    - If the bottle stack becomes empty, the slot becomes the water bottle.
    - Otherwise the water bottle is inserted component-preserving.
    - If there is no room, the fill is **refused** (nothing consumed). Vanilla
      would drop it, but item entities cannot carry components here, so a
      dropped water bottle would lose its contents. Documented divergence.
  - **Creative**: the bottle stays. A water bottle is added only if the
    inventory does not already contain an identical one (vanilla
    `createFilledResult` prevent-duplicates); if none can be inserted,
    nothing changes.
- Game: `tryFillSelectedBottle()` → `hotbar.render()`, `audio.play('pop')`
  (an existing sound), then `savePlayerStateDurable()` (289 durable path).

## D5. Drinking (`src/simulation/PotionDrinking.ts`, pure)

- `DRINK_DURATION_TICKS = 32` (vanilla `PotionItem.getUseDuration`).
- `drinkStartDecision({canInteract, deathScreenOpen, depletesItems,
  stackCount, isPotionItem, contents})` → `{start: true, consume}` or a refusal:
  `NO_INTERACT` (spectator), `DEATH_SCREEN`, `EMPTY_HAND`, `NOT_POTION`, or
  `NOT_DRINKABLE` (kind other than NORMAL).
- `DrinkState { slot, itemId, contentsKey (JSON), ticksUsed }`.
  `tickDrink(state, frame)` returns `continue`, `cancel(reason)` or `finish`:
  - `released`: use is not held.
  - `unlocked`: pointer lock lost or a menu is open.
  - `slot-changed` or `stack-changed`: a different slot, id or contents.
  - `no-interact`: now a spectator.
  - `death-screen`.
  - Otherwise `ticksUsed + 1`, and `finish` when it reaches 32.
- `resolveDrinkOutcome(contents, depletes)` → `{heal, damage, effects[],
  returnBottle, consumePotion}`:
  - instant health adds `4 << amp` heal and instant harming adds `6 << amp`
    damage (vanilla `applyInstantenousEffect` at health multiplier 1.0);
  - every other effect with `duration > 0` applies at full duration (seconds)
    and amplifier;
  - duplicate ids cannot occur (the contents guard);
  - `consumePotion = returnBottle = depletes`.
- Game:
  - `onUseItem` becomes a dispatcher: fill bottle → start drinking →
    splash throw (existing behaviour).
  - `tickDrinking()` runs on the unpaused fixed tick (the same place as the
    splash step).
  - On finish, the survival stack shrinks by 1: potion stack size is 1, so the
    slot becomes the glass bottle; a larger stack would insert the bottle and
    drop it if full (plain bottles carry no components, so dropping is safe).
  - Effects go through `playerEffects.add` (unregistered ids skipped),
    healing through `survival.heal`, and damage through
    `hurtPlayer(dmg, 'magic')` (265 creative exemption kept).
  - Then `hud.setSurvival`, `hotbar.render`, `audio.play('eat')` and
    `savePlayerStateDurable()`.
  - Cancel leaves everything unchanged.
- Shield priority: `updateShieldRaised` passes `interactionAvailable = false`
  while the mainhand holds a drinkable NORMAL potion or a drink is active, so
  right-click drinks instead of blocking (vanilla uses the mainhand first).
- Water bottle: contents with base water and no effects give no effect, and
  the bottle is returned.
- Not implemented: movement slowdown while drinking and drink particles.
  Documented.

## D6. Brewing (no engine changes beyond D3)

water (`WATER_BASE`) + nether wart → awkward (base-only). awkward + redstone →
speed 480/1. + gunpowder → SPLASH (297). Blaze powder fuel and the 400-tick
brew time are unchanged. Glowstone dust does not exist (the recipe string is
unreachable), and neither does a fermented spider eye; both are documented.
Nether wart exists (creative/setup only; there is no Nether), which is
documented as a survival-source gap. No seam is needed for the wart step
because the item is real. `testGrantAwkwardBottle` stays test-only and its
doc is updated.

## D7. Milk

There is no milk, bucket or cow-milking path, so nothing is implemented. This
is documented, and milk + buckets are listed as a candidate.

## D8. Persistence (289)

- Fill and drink completion each call `savePlayerStateDurable()`. That writes
  the player snapshot, including every inventory stack's components (water
  bottle contents, returned glass bottle).
- In-progress drink state is transient; vanilla doesn't persist use progress.
  A reload mid-drink leaves the potion unconsumed.

## D9. Seams

- `getDrinkState()` returns `{active, ticksUsed, slot, durationTicks}` or
  null, and `getLastDrinkOutcome()` returns the last completed drink
  (read-only).
- `debugFillSelectedBottle()` / `debugUseSelectedItem()` are **not** added.
  The E2E uses real right-click input.
- Existing seams reused for setup: raid start, drop RNG, position, brewing
  state, effects, game mode.

## D10. Tests

- Unit:
  - `GlassBottleItem.test.ts`: registry, tile isolation, and witch drops now
    include bottles.
  - `BottleFilling.test.ts`: raycast and decision matrix.
  - `PotionDrinking.test.ts`: start/tick/cancel/outcome.
  - `BasePotionContents.test.ts`: D3 and the real water→awkward→speed→splash
    engine chain.
  - A Game source-guard test.
  - Updated 297 witch-table tests: glass_bottle is present now.
- E2E `glass-bottles-drinkable-potions.spec.ts`:
  1. A witch drops bottles; walk onto them to pick up.
  2. Place water and fill with a real right-click.
  3. Brew water + wart → awkward, then + redstone → speed, in a real stand.
  4. Hold right-click for 32+ ticks to drink: speed effect plus an empty
     bottle.
  5. Cancel mid-drink (mouseup): nothing consumed.
  6. Creative: the potion is kept and no bottle is given.
  7. Reload: the water bottle/bottles persist.
