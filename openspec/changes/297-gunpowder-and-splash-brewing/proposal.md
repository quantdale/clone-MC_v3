# Proposal: 297-gunpowder-and-splash-brewing

## Problem

Splash potions exist as live thrown entities (295) and their effects now tick
(296), but a player can only get one through the test-only
`testGrantSplashPotion` seam. Vanilla turns any potion into its splash
variant by brewing it with **gunpowder** in a brewing stand, and gunpowder
drops from creepers, witches and ghasts. The clone has none of this: there is
no `gunpowder` item, no mob drops it, the brewing context has no gunpowder
recipe, and `BrewingStandBlockEntity.applyMatch` rebuilds `potion_contents`
without its `kind`, so even a splash bottle that is brewed further silently
turns back into a NORMAL potion.

## Inspection findings (base `fdba42d`)

- `ItemRegistry`: 72 legacy ids (last `Smoker = 72`), no gunpowder. Atlas
  tiles 0–79 exist; tile 75 is unused. Tiles use a per-tile seeded PRNG,
  and the atlas uses no mipmaps, so painting tile 75 cannot change any other tile.
- Brewing (123/260): `BrewingContext.match(base, ingredient)`, blaze powder
  fuel 1200 ticks, 400-tick brews, starter table water→awkward (nether wart),
  awkward + redstone/glowstone/… → speed/strength/healing. Brewing state
  persists through `LiveBlockEntityHost.persistChunk` (289 durable path) with
  the bottle's components verbatim.
- Mobs: creeper and ghast are not live mobs. Creeper exists only as an
  `EntityType` definition, and ghast does not exist at all. The only live
  witches are raid-wave witches (284/288/295). They die through
  `RaiderCombatSystem.damageRaider` from player melee, splash harming or the
  `debugDamageRaidEntity` seam, and they drop **nothing** today. No looting
  enchantment exists.
- Crafting: a TNT item/block exists (`ItemId.Tnt`) but it has no crafting recipe. The
  `#crafting` panel renders **every** recipe as a button, and that panel is
  captured by the `container-ui` visual goldens (6 cells). A TNT recipe would
  add a visible row and shift those cells, so it is **not trivial**. It is
  deferred (see design).
- Drinking: normal potions are **not drinkable**. `tryEatSelected` only
  handles food, and right-click only throws SPLASH potions. There is no glass
  bottle or water bottle item either, so a potion *base* can still only be
  obtained through the 260 `testGrantAwkwardBottle` seam.

## Goals

1. `gunpowder` item (`ItemId.Gunpowder = 73`, `minecraft:gunpowder`, stack
   64, icon tile 75 with original grey-powder art; no existing tile moves).
2. Pure `src/simulation/GunpowderMobDrops.ts` with the vanilla tables:
   - creeper: gunpowder uniform 0–2, plus uniform 0–looting (data + unit
     tests only; there is no live creeper);
   - witch: 1–3 rolls over glowstone_dust / sugar / redstone / spider_eye /
     glass_bottle / gunpowder (weight 1 each) and stick (weight 2), each with
     count uniform 0–2 plus 0–looting. Rolls that land on items the
     registry lacks are rolled and discarded, which keeps the gunpowder odds exactly vanilla.
   - ghast: absent; documented as not present.
3. Live raid witch deaths (every `damageRaider` death path) spawn the witch
   table as real item entities at the witch's position. Looting is 0. There is
   an injectable drop RNG plus the test seam `debugSetMobDropRandomSequence`,
   and the observability seam `getLastMobDrops`.
4. Brewing: `match(base, ingredient, kind?)`. Gunpowder converts any
   NORMAL potion into SPLASH with base and effects preserved; an already
   SPLASH/LINGERING potion does not match. `applyMatch` preserves the
   bottle's kind for every other recipe (vanilla: splash awkward + redstone →
   splash speed). The existing blaze-powder fuel and 400-tick rules are unchanged.
   The kind rides the persisted `potion_contents`.
5. `testGrantSplashPotion` stays as a **test-only** seam. Its doc is updated
   because a survival path now exists.
6. Unit tests (drop tables, witch wiring, brewing conversion/kind
   preservation, persistence round-trip). A browser E2E kills a raid witch,
   picks up the dropped gunpowder by walking onto it, brews awkward+redstone
   then +gunpowder in a real stand, collects the splash potion, throws it and
   sees the speed effect.

## Non-goals

- TNT recipe (changes the container-ui goldens, as explained above), TNT ignition.
- Live creepers/ghasts, looting enchantment, pillager/vindicator/ravager
  drops, witch drinking/self-heal.
- Glass bottles, water bottles, drinkable potions, lingering potions
  (dragon's breath), new brewing ingredients beyond gunpowder.
- Any 258 headed work.

## Impact

`ItemRegistry`, `TextureAtlas`, `BrewingRecipes`, `BrewingStandBlockEntity`,
`RaiderCombatBehavior` (death info), `PillagerPatrol` (callback shape), `Game`
(witch drop wiring + seams), new `GunpowderMobDrops`, unit + E2E tests, docs.
