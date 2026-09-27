# Verification: 297-gunpowder-and-splash-brewing

Status: VERIFIED
Completion: 100% (12/12)
Advancement allowed: true

Base: `origin/main` `fdba42d` (296 VERIFIED). Worktree
`/workspace/mc-worktrees/297`, branch `wt/297-gunpowder-and-splash-brewing`.
Package commit `09f7bfb` precedes all implementation.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| Gunpowder item | `GunpowderMobDrops.test.ts`: `getByKey('gunpowder')` → id 73 (`ItemId.Gunpowder`), `Gunpowder`, stack 64, icon tile 75, no `placeBlock`/food/durability; `TILE_INDEX.gunpowder` 75 and no other atlas entry or item icon uses 75. `SplashBrewing.test.ts`: resource id equals `GUNPOWDER_ITEM`. `BlockItemSeparation.test.ts`: gunpowder in the non-placeable allow-list. E2E: picked-up gunpowder counts 2 in the live inventory. |
| Icon isolation / goldens | Tile 75 was unused; `drawTile` paints only its own 16×16 cell with a per-tile PRNG (`75·7919+13`); Nearest filtering, no mipmaps; creative menu lists placeable items only; no default inventory holds gunpowder. Visual matrix: every non-high cell byte-identical to the pre-297 runs (below). |
| Vanilla drop tables | Unit: creeper 0/1/2 by draw (0 → no stack, `zero-count`), exact thirds over a uniform grid, looting +0..level (0.99 with looting 3 → 5), looting 0 draws once; witch pool 7 entries / stick weight 2 / total 8 / 1–3 rolls; weighted pick order (gunpowder ticket 5, stick 6–7); draw order rolls → pick → count (→ looting); 3-roll merge in first-seen order; sugar roll discarded as `missing-item` (not re-rolled); redstone drops real redstone; exact 1/8 gunpowder odds; 500 Math.random witch rolls stay within bounds and present items; ghast/pillager/zombie → no drops. |
| Live witch drops | `LiveWitchGunpowderDrops.test.ts` (real RaiderCombatSystem + RaidWaveController + ItemEntityManager): death info `{typeKey:'witch', x,y,z}` captured before removal; non-lethal damage reports nothing; a killed witch yields one gunpowder×2 item entity at (x, y+0.5, z); stale second death not consumed → no second drop; player melee kill routes death info through `onRaiderDied`; pillagers/vindicators/ravagers drop nothing; real `collectPlayerDrops` respects the 10-tick delay and then collects 2. Source guards: exactly 3 `if (this.onRaidEntityRemoved(id)) this.dropRaiderLoot(death)` sites (melee, splash harming, debug damage), witch-only, injectable RNG, `spawnLootStacks`. E2E: `debugSetMobDropRandomSequence([1.5])` refused, scripted roll → `getLastMobDrops` witch `[{73, 2}]`, one item entity within 1.5 blocks of the witch, then walking onto it picks it up on the real fixed tick (entity gone). |
| Splash brewing | `SplashBrewing.test.ts` (real 123 engine, default context): gunpowder matches any NORMAL base incl. absent/unknown (absent kind = NORMAL) with kind-only output; never SPLASH/LINGERING; starter table unchanged and kind-independent; gunpowder not a fuel; speed 480/1 + gunpowder → SPLASH speed 480/1 with the same base after exactly 400 ticks, one gunpowder and one blaze powder consumed, burn 800 left; multi-effect potion preserved exactly; SPLASH awkward + redstone → SPLASH speed (kind preserved); NORMAL stays NORMAL; awkward → gunpowder → redstone ends SPLASH speed on one blaze powder; SPLASH/LINGERING + gunpowder → state unchanged (no fuel lit); no fuel → no progress. E2E: real stand awkward + redstone → NORMAL speed 480/1, then shift-clicked gunpowder routed to the ingredient slot → SPLASH with identical base/effects, gunpowder 2 → 1, brewTime 0. |
| Persistence | Unit: SPLASH brewing envelope JSON round-trip equals the live state; mid-brew (150/400) round-trip finishes identically; live host persists the chunk record with the SPLASH bottle, and a fresh host hydrates it field-for-field. Inventory stack components already carry `potion_contents` (122/289 paths, unchanged). |
| Throw + effect | E2E: the collected splash potion thrown at the feet through the real throw path (`debugThrowSplashPotion`) is consumed (survival), flies as one player potion with `['minecraft:effect/speed']`, shatters, and gives the player speed amp 1 with 1 < duration ≤ 480. |
| Test seams | `testGrantSplashPotion` doc now test-only (source guard: stale "no gunpowder / splash brewing exists" text gone). `debugSetMobDropRandomSequence` refuses invalid sequences (unit + E2E), `null` restores Math.random; `getLastMobDrops` returns copies. |

## Scope decisions

- **TNT recipe deferred:** `CraftingPanel` renders a button for every recipe,
  and `#crafting` is captured by the `container-ui` goldens (6 cells). A tenth
  recipe row would change them, so the recipe is a 298 candidate (TNT ignition
  does not exist either).
- **Creeper / ghast:** no live creeper (EntityType only) and no ghast. The
  creeper table is data plus unit tests only; `ghast` resolves to no drops.
- **Looting:** no enchantment exists; the live game passes level 0 (the pure
  tables implement the vanilla looting term).
- **Other raiders** (pillager, vindicator, ravager, patrol pillagers) drop
  nothing, as before.
- **Potion bases:** there are no glass/water bottles, so the awkward bottle
  still comes from the 260 `testGrantAwkwardBottle` seam (the water→awkward
  brew pauses on the 123 empty-effects rule).
- **Drinking:** normal potions are **not drinkable**. `tryEatSelected` only
  handles food, and right-click only throws SPLASH. This is a 298 candidate
  (not trivial: use-duration, bottle return, consume path).

## Legacy alignment

- 295 proposal/design/verification annotated: splash potions are now
  obtainable in survival (witch gunpowder + splash brewing), and the seam
  stays test-only. The PARITY C295 divergence is marked closed by C297.
- `BrewingStandBlockEntity.applyMatch` previously rebuilt `potion_contents`
  without `kind`, so a SPLASH bottle brewed further silently reverted to
  NORMAL. Fixed (kind preserved unless the output sets one).
- `RaiderCombatSystem.damageRaider`'s `onDied` / `onRaiderDied` now also
  receive `RaiderDeathInfo`. Existing single-argument callers
  (`PillagerPatrol`, tests) are unchanged.

## Commands

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | 0 errors / 85 warnings (unchanged; none in 297 files) |
| `npx vitest run` | 476 files, 5713 passed + 1 skipped (was 473 / 5669) |
| `npm run build` | PASS, 266 modules |
| `node scripts/validate-file-audit.mjs …/file-audit-manifest.json` | PASS, 3031 rows |
| `npm run validate-state` | PASS |
| `npx playwright test tests/e2e/gunpowder-splash-brewing.spec.ts` | 1/1 isolated (1.1 m); 1/1 again with brewing 2/2 + splash-potion 3/3 (2.1 m) |
| `npm run test:e2e` (full) | 136 passed / 1 failed of 137 (33.5 m); the one failure is visual:176; gunpowder-splash-brewing 1/1 (1.0 m), brewing 2/2, splash-potion 3/3, periodic-status-effects 2/2, enchanting:227 green (12.8 s) |

## visual:176 SwiftShader drift (documented, not hidden)

The goldens are untouched. The only rendering change is the previously unused
atlas tile 75, which no matrix scene samples.

| Run | fail / pass | band (failing) |
|---|---|---|
| 296 full run (`998fef9`) | 30 / 30 | 0.0202–0.0619 |
| 296 isolated visual rerun | 29 / 31 | 0.0222–0.0619 |
| origin/main `218aabd` isolated rerun (296 session) | 31 / 29 | 0.0203–0.0619 |
| **297 full run** | **30 / 30** | 0.0215–0.0619 |
| 297 isolated visual rerun | 30 / 30 | 0.0222–0.0619 |
| origin/main `fdba42d` isolated rerun (temporary detached worktree, removed) | 30 / 30 | 0.0222–0.0708 |

Cell by cell across all six runs:
- All 40 low/default cells are **byte-identical**.
- All 10 high/1280x720 cells have a stable status.
- The 297 full run and the 297 rerun have the identical pass/fail set (0 flips).
- Every status flip is a `high/1920x1080` cell, and every flipping cell also
  flips between pre-297 builds:

| cell | 296 full | 296 rerun | main 218aabd | 297 full | 297 rerun | main fdba42d |
|---|---|---|---|---|---|---|
| container-ui/high/1920x1080 | pass 0.0173 | fail 0.0254 | pass 0.0173 | fail 0.0242 | fail 0.0280 | pass 0.0173 |
| crosshair/high/1920x1080 | pass 0.0184 | pass 0.0184 | fail 0.0203 | pass 0.0184 | pass 0.0184 | fail 0.0341 |
| environment-day/high/1920x1080 | fail 0.0202 | pass 0.0186 | fail 0.0254 | fail 0.0329 | fail 0.0350 | fail 0.0350 |
| render-world-no-hud/high/1920x1080 | fail 0.0306 | fail 0.0324 | fail 0.0248 | fail 0.0325 | fail 0.0325 | pass 0.0184 |
| start-overlay/high/1920x1080 | fail 0.0311 | pass 0.0184 | fail 0.0203 | pass 0.0184 | pass 0.0184 | fail 0.0325 |

`container-ui/high/1920x1080` (the only flip that touches a panel) already
fails on the unmodified 296 build (rerun 0.0254). The same fraction values
recur across builds (0.01733 / 0.01842). The flips are therefore run-order /
SwiftShader timing variance of the high-profile captures, not a 297 effect.

## Divergences (documented)

- Witch rolls that land on absent items (glowstone dust, sugar, spider eye,
  glass bottle) are discarded, not replaced.
- There are no live creepers/ghasts and no looting, and other raiders do not drop loot.
- The TNT recipe is deferred (golden-captured crafting panel).
- Potion bases need the 260 bottle seam, and normal potions are not drinkable.
- As in vanilla, a splash potion keeps its effect durations. The 295 splash
  falloff still scales them on impact.
