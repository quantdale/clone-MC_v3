# Design: 297-gunpowder-and-splash-brewing

## D1. Gunpowder item and icon

- `ItemId.Gunpowder = 73` (the next legacy id; save identity numbers are unchanged).
  Definition: `{ id: 73, resourceId: minecraft:gunpowder, key: 'gunpowder',
  name: 'Gunpowder', iconTile: TILE_INDEX.gunpowder (75), stackSize: 64 }`.
  It is not placeable, not food and has no durability.
- `TILE_INDEX.gunpowder = 75`, painted last in `generateAllTiles` with
  original art: a grey powder mound with dark and light specks drawn from
  the tile's own PRNG (`75 * 7919 + 13`).
- Why the goldens are safe:
  - `drawTile` translates into the tile's own 16×16 cell and seeds a
    per-tile PRNG, so no other pixel changes.
  - The texture is Nearest with no mipmaps, so nothing bleeds between tiles.
  - The creative menu lists only placeable items, so gunpowder does not appear there.
  - Gunpowder is not in any default inventory, so the hotbar and container
    goldens never show it.

## D2. Mob drop tables (`src/simulation/GunpowderMobDrops.ts`)

Pure module. `RandomSource = () => number` in [0,1).
`uniformInt(rng, min, max) = min + floor(rng() * (max - min + 1))`, clamped.

```
CREEPER: gunpowder count = uniformInt(0,2) + uniformInt(0, looting)
WITCH:   rolls = uniformInt(1,3)
         each roll: weighted pick over
           glowstone_dust 1, sugar 1, redstone 1, spider_eye 1,
           glass_bottle 1, gunpowder 1, stick 2      (total 8)
         count = uniformInt(0,2) + uniformInt(0, looting)
```

Looting uses vanilla `looting_enchant` semantics (`+uniform(0, level)` per
entry). The `lootingLevel` argument is clamped to an integer in [0, 10]. The
game always passes 0 because no looting enchantment exists. When the looting
level is 0, the looting term makes no rng draw.

`resolveMobGunpowderDrops(typeKey, registry, rng, looting)` returns
`{ stacks: {item, count}[], rolls: {itemKey, count, dropped}[] }`:
- Counts of 0 are skipped.
- Entries whose `minecraft:<key>` is missing from the item registry are
  recorded with `dropped: 'missing-item'` and emit no stack.
- Stacks of the same item merge.
- Unknown mob types (including `ghast`, which is not present) return empty.
- The RNG draw order is fixed and documented (roll count, then per roll:
  weight pick, count, looting), so a scripted RNG sequence can pin outcomes.

Constants are exported for tests: `CREEPER_GUNPOWDER_MAX = 2`,
`WITCH_ROLLS_MIN = 1`, `WITCH_ROLLS_MAX = 3`, `WITCH_LOOT_ENTRIES`, and
`WITCH_TOTAL_WEIGHT = 8`.

Vanilla odds: gunpowder is one of 8 weight units. Present items today are
redstone, gunpowder and stick; the other entries are discarded, not re-rolled.

## D3. Witch death wiring

- `RaiderCombatSystem.damageRaider(id, amount, onDied)`: `onDied(id, death)`
  now also receives `RaiderDeathInfo { typeKey, x, y, z }`, captured before
  the entity is removed. `RaiderCombatTickInput.onRaiderDied(id, death?)`
  gets the same info. Existing single-argument callers stay valid.
- In `Game`, all three raid death sites call `this.onRaidEntityRemoved(id)`
  and then `this.dropRaiderLoot(death)`:
  - melee tick
  - splash harming
  - `debugDamageRaidEntity`
- `dropRaiderLoot` applies only to `typeKey === 'witch'` and only when the
  death was actually consumed (`onRaidEntityRemoved` returned true), so drops
  happen exactly once. It resolves the witch table with
  `this.mobDropRandom` (default `Math.random`), then
  `itemEntities.spawnLootStacks(stacks, x, y + 0.5, z, Math.random)`, and
  records `lastMobDrops` for observability.
- Patrol pillagers and the other raiders drop nothing (out of scope).
- Seams:
  - `debugSetMobDropRandomSequence(values: number[] | null)`: a scripted
    RNG that cycles through the values and is cleared by `null`. Values must
    be finite and in [0,1), otherwise the call returns false.
  - `getLastMobDrops()` returns `{ typeKey, x, y, z, stacks }` or null.
- Real gameplay picks drops up through the existing `collectPlayerDrops`
  path (walk within 1.5 blocks after the 10-tick pickup delay).

## D4. Splash brewing

- `GUNPOWDER_ITEM = 'minecraft:gunpowder'` in `BrewingRecipes`.
- `BrewingRecipeOutput` gains `kind?: PotionKind`.
- `BrewingContext.match(base, ingredient, kind?)`. The default context checks
  gunpowder first:
  `ingredient === GUNPOWDER_ITEM` → `(kind ?? 'NORMAL') === 'NORMAL' ?
  { kind: 'SPLASH' } : null`. This works for any base, including an absent
  base (vanilla: every potion, water bottle included, can be splashed). All
  other ingredients use the unchanged starter table, independent of kind.
- `BrewingStandBlockEntity.tickOnce` passes `bottleState.contents.kind`.
  `applyMatch` builds `createPotionContents({ base, kind: match.kind ??
  contents.kind, customEffects })`.
  - The base and effects are unchanged by the gunpowder output, so
    durations and amplifiers are preserved exactly. Vanilla keeps the same
    duration for a splash potion.
  - Other recipes keep the bottle's kind. This fixes the latent reset to
    NORMAL.
- Fuel: blaze powder 1200 burn ticks and 400-tick brews are unchanged.
  Gunpowder is one ordinary ingredient consumed per brew.
- Persistence: the bottle's `potion_contents` (including `kind`) is already
  serialized verbatim in the brewing envelope and in inventory stack
  components. The unit tests pin the round-trip through
  `serializeBrewingState`/`deserializeBrewingState` and the live host
  persist/hydrate path.

## D5. TNT recipe: deferred

`CraftingPanel` renders a button for every registered recipe, and
`visual-regression.spec.ts` captures `#crafting` in the `container-ui`
scenario (default/low/high × 1280x720/1920x1080). Adding "5 gunpowder + 4
sand → TNT" would insert a tenth row and change those six golden cells. This
track does not regenerate goldens, so the recipe is recorded as a 298
candidate (together with TNT ignition, which does not exist either).

## D6. `testGrantSplashPotion`

This stays a test-only seam. Its doc is updated: splash potions are now
obtainable in survival (witch gunpowder → brewing), and the seam remains for
deterministic effect/duration setup in tests. The seam is specified in
spec.md. The awkward-bottle seam is still needed because glass/water bottles
do not exist (260 limitation, documented).

## D7. E2E

`tests/e2e/gunpowder-splash-brewing.spec.ts`:
1. Boot. Script the drop RNG so a witch rolls 1 roll → gunpowder → count 2.
   Start a raid with omen 3 (a witch is in the wave) and kill the witch
   through `debugDamageRaidEntity`, which uses the same `damageRaider` death path as melee.
   Assert `getLastMobDrops` and that a gunpowder item entity exists.
2. Move the player onto the item entity, enter pointer lock (the fixed tick
   runs) and wait for real pickup, so gunpowder appears in the inventory.
3. Grant the stand, the awkward bottle (260 seam), 1 redstone and 2 blaze
   powder. Place the stand, open it, and shift-click in bottle, fuel and
   redstone. Close the panel and wait for speed 480/amp 1.
4. Reopen the stand and shift-click the gunpowder. The bottle and fuel
   slots are occupied, so it routes to the ingredient slot. Close the panel,
   wait for `kind === 'SPLASH'` with speed 480/amp 1 preserved and exactly
   one gunpowder consumed, then shift-click the bottle out.
5. Select the potion and throw it at the player's feet
   (`debugThrowSplashPotion(0, -π/2)`, the real throw path). Tick the
   potions, then check that the player has speed amp 1 and that the potion
   was consumed.

## D8. Risk

- The witch drop is ~1/8 gunpowder per roll in real play. The E2E pins
  it with the scripted RNG.
- Item entities spawned near the raid could, in theory, be picked up by the
  player in other raid E2Es. That is harmless because no inventory assertions
  exist there, and those tests never kill witches.
