# Verification: 298-glass-bottles-and-drinkable-potions

Status: VERIFIED
Completion: 100% (12/12)
Advancement allowed: true

Base: `origin/main` `2ecf781` (297 VERIFIED). Worktree
`/workspace/mc-worktrees/298`, branch `wt/298-glass-bottles-and-drinkable-potions`.
Package commit `4a3ea81` precedes all implementation.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| Glass bottle item | `GlassBottleItem.test.ts`: `getByKey('glass_bottle')` → id 74 (`ItemId.GlassBottle`), `Glass Bottle`, stack 64, icon tile 76, no `placeBlock`/food/durability; `TILE_INDEX.glassBottle` 76 and no other atlas entry or item icon uses 76; gunpowder 73 / potion ids unchanged. `BlockItemSeparation.test.ts`: glass_bottle in the non-placeable allow-list. |
| Icon isolation / goldens | Tile 76 was unused. `drawTile` paints only its own 16×16 cell, and the bottle painter makes no PRNG draws. The texture uses Nearest filtering with no mipmaps, the creative menu lists placeable items only, and no default inventory holds bottles. Visual matrix: every non-high cell is byte-identical to the pre-298 runs (below). |
| Crafting recipe gated by golden isolation | Controlled `container-ui` experiment (below): recipe **not added**, no golden re-pinned. `GlassBottleItem.test.ts` pins 9 legacy recipes, none outputting bottles or using glass. |
| Bottle sources | Unit: witch ticket 4 → `[{GlassBottle, 2}]` (`GunpowderMobDrops.test.ts`, `GlassBottleItem.test.ts`); Math.random witch drops only ever contain present items incl. bottles (`LiveWitchGunpowderDrops.test.ts`). E2E: scripted roll `[0, 4.5/8, 0.99]` → `getLastMobDrops` witch `[{74, 2}]`, one item entity ×2, walking onto it picks up 2 bottles on the real fixed tick. Drinking returns bottles (below). |
| Fill bottle from water | `BottleFilling.test.ts`: the first non-air cell is water → hit (distance 2.5); glass in front blocks; beyond reach → null; air-only/zero-dir/NaN → null; diagonal rays. Decision: survival consumes one and inserts; lone bottle → slot replaced (room not needed); no room with bottles left → `NO_ROOM`; creative keeps the bottle, never duplicates (`ALREADY_HELD`), no room → `NO_ROOM`; refusal order NO_INTERACT/DEATH_SCREEN/EMPTY_HAND/NOT_BOTTLE/NO_WATER. Water contents `{base water, NORMAL, []}` pass the read guard. Source guards: `fluidRaycast` at `CONFIG.reach`, component-preserving insert, `savePlayerStateDurable()`. E2E: a placed water block filled with a **real right-click** → bottles 2 → 1, one water-base potion, `getLastBottleFill` `{filled: true}`; creative fill keeps the bottle (1) and adds one water bottle, a second fill → `ALREADY_HELD` (no duplicate). |
| Base-only potions and brewing | `BasePotionContents.test.ts`: water/awkward/mundane base-only contents valid in the factory and read guard (also SPLASH); no base / empty base / non-string base / missing effects array stay invalid; duplicate/negative rules unchanged. Real 123 engine: water + nether wart → still water at 399 ticks, `{base awkward, NORMAL, []}` at 400, wart consumed, brewTime 0; awkward + redstone → speed 480/1; + gunpowder → SPLASH speed on one blaze powder; water + gunpowder → splash water; water + redstone → no recipe (no fuel lit); mid-brew (123/400) envelope round-trip finishes identically. E2E: a real stand brews the filled water bottle + nether wart → `{base awkward, NORMAL, []}` (wart consumed, one blaze powder left), then + redstone → `{awkward, NORMAL, [speed 480/1]}`, collected with a real shift-click. |
| Drinking | `PotionDrinking.test.ts`: survival start consumes / creative doesn't; water/awkward drinkable; SPLASH/LINGERING/null → `NOT_DRINKABLE`; spectator/death/empty/non-potion refused; finish on exactly the 32nd held tick; cancel reasons released/unlocked/slot-changed/stack-changed (incl. different contents)/no-interact/death-screen; input state never mutated; outcomes: speed full duration + bottle, creative no consume/no bottle, instant health amp 1 → heal 8, harming → damage 6, water/awkward → nothing + bottle, zero-duration placeholder skipped, mixed potions ordered. Source guards: dispatcher `fill → drink → throw`, `tickDrinking()` once right after `interaction.update(dt)`, real `isUseHeld()` and pointer lock, `finishDrinking` effects/heal/magic damage/bottle/durable save, respawn clears the drink, shield yields to a drinkable mainhand. E2E: hold right-click on the brewed speed potion → drink state appears, completes → speed amp 1 (470 < d ≤ 480), the slot holds 1 glass bottle, bottles 2, potions 0; mid-drink release after ≥5 ticks → `lastCancel 'released'`, water bottle kept; water bottle drunk → no effect, bottle back; harming → exactly 6 HP lost + bottle; creative → speed applied, potion kept (count 1), no bottle; spectator hold → no drink, potion kept. |
| Durable saves / reload | Fill and drink completion call `savePlayerStateDurable()` (source guards). Unit: inventory snapshot JSON round-trip restores the water bottle's base-only contents and 5 glass bottles. E2E: after drink + second fill + cancelled drink, an explicit flush (pending 0, failed 0; no pagehide) then `page.reload()` restores 1 glass bottle + 1 water-base potion, which then drinks back to 2 bottles. |
| Milk | Not implemented; no milk/bucket/cow milking exists (documented). |

## Container-ui golden experiment (T5): recipe not added

The test ran on the 298 tree with the item added and no recipe. It captured
`SCREEN_FILTER=container-ui UPDATE_SNAPSHOTS=1` into throwaway directories:

- `exp298-before`, then `exp298-before2` (noise floor);
- `exp298-after`, with a temporary
  `{ glass_bottle: [[Glass, 3]] → GlassBottle ×3 }` recipe appended after
  `wooden_axe`.

The recipe was then reverted (`git checkout src/inventory/RecipeRegistry.ts`,
diff verified empty), and the capture directories were moved out of the repo to
`/workspace/298-golden-experiment/`. Changed pixels are counted at channel
tolerance 24, the visual gate's tolerance.

| cell | before vs before2 (noise) | before vs after | after fraction | changed bbox (x0,y0)–(x1,y1) |
|---|---|---|---|---|
| low/1280x720 | 0 | 26 262 px | 0.0285 | (390,50)–(889,691) |
| low/1920x1080 | 0 | 26 252 px | 0.0127 | (710,230)–(1209,871) |
| default/1280x720 | 0 | 26 285 px | 0.0285 | (390,50)–(889,691) |
| default/1920x1080 | 0 | 26 276 px | 0.0127 | (710,230)–(1209,871) |
| high/1280x720 | 0 | 26 275 px | 0.0285 | (390,50)–(889,691) |
| high/1920x1080 | 15 420 (known flipping cell) | 26 235 px (vs before2) | 0.0127 | (710,230)–(1209,871) |

Changed row bands on `default/1280x720`:

| y range | what changed |
|---|---|
| 50–83 | The summary line gains "Glass: 0" and wraps to a second line. |
| 94–234 | The "INVENTORY" label and the whole grid shift down by about 11 px. |
| 260–691 | Every visible recipe row (Oak Planks, Glass, Sticks, Gravel, …) shifts. |

The new tenth recipe row itself is below the panel fold and is **not visible**
in any capture. The side-by-side before | after | diff-mask crop is committed at
`evidence/container-ui-recipe-experiment.png`. The diff is therefore not
solely the new recipe row. At 1280x720 it would also exceed the 0.02 gate
fraction. Per the user rule the recipe is **not** added, no golden is
re-pinned, and the gap is recorded in PARITY C298 and the overrides checkpoint.

A future owner-approved re-pin would have to accept the summary-line and
row-shift change: the rule "only the new row" cannot be met by any
new-ingredient recipe. A TNT recipe has the same problem because gunpowder is
a new ingredient.

## Scope decisions

- **Nether wart:** a real item (id 59) with a crop block, but there is no
  Nether and no survival source. The E2E grants it as setup, like redstone and
  blaze powder, and no brewing seam is used for the wart step.
- **Glowstone dust / fermented spider eye:** absent. The starter
  `minecraft:glowstone` recipe string stays unreachable.
- **Water:** every live water block is a source (no live flowing state). The
  fluid ray stops at the first non-air cell.
- **Fill with no room:** refused rather than dropped. Item entities cannot
  carry components, so a dropped water bottle would lose its contents.
- **Drinking presentation:** no movement slowdown, arm animation or particles.
  The existing `eat` sound plays on completion, and fills play `place`.
- **In-progress drinks** are transient and not persisted (vanilla use
  progress). A reload mid-drink leaves the potion.
- **Seams:** `testGrantAwkwardBottle` is kept test-only; its doc now names the
  survival path, and its placeholder contents keep the 260/297 E2E setups
  unchanged. New test-only `testGrantPotion` (NORMAL single-effect potion) is
  used for the harming and creative drinks. Read-only `getDrinkState`,
  `getLastDrinkOutcome` and `getLastBottleFill` were added. There is no
  use/fill debug path: the E2E uses real right-click input.

## Legacy alignment

- **122/123 potion rule:** customEffects must be non-empty unless a base is
  named. Previously they had to be non-empty always, which paused the starter
  water → awkward recipe at completion. The tests pinning the rule
  (`PotionItemData.test.ts`, `BrewingStandBlockEntity.test.ts`) use contents
  without a base, so they still hold. `LiveBrewingHost.test.ts`'s fast-brew
  test had to stop at tick 1 because of the old pause; it now asserts
  completion: one reagent consumed and base-only `{base test:awkward, []}`.
- **297 witch-table tests:** `glass_bottle` is now present. The
  missing-item test uses sugar; bottle drops are asserted.
- **Docs:** 297 verification/design, 260 proposal/design and 295 design
  carry 298 notes, and PARITY C297 is marked closed by C298.

## Commands

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | 0 errors / 85 warnings (unchanged; none in 298 files) |
| `npx vitest run` | 481 files, 5761 passed + 1 skipped (was 476 / 5713) |
| `npm run build` | PASS, 268 modules |
| `node scripts/validate-file-audit.mjs …/file-audit-manifest.json` | PASS, 3046 rows |
| `npm run validate-state` | PASS |
| `npx playwright test tests/e2e/glass-bottles-drinkable-potions.spec.ts` | 2/2 (survival loop 1.3 m, harming/creative/spectator 15 s) |
| `npm run test:e2e` (full) | 138 passed / 1 failed of 139 (31.6 m); the one failure is visual:176; glass-bottles-drinkable-potions 2/2 (1.2 m + 14.9 s), brewing 2/2, gunpowder-splash-brewing 1/1, splash-potion 3/3, enchanting:227 green (12.2 s) |

## visual:176 SwiftShader drift (documented, not hidden)

The goldens are untouched, and the T5 experiment captures went to throwaway
directories that were moved out of the repo. The only rendering change is the
previously unused atlas tile 76, which no matrix scene samples; no default
inventory or crafting summary shows the bottle.

| Run | fail / pass | band (failing) |
|---|---|---|
| 297 full run (`9dfc9c7`) | 30 / 30 | 0.0215–0.0619 |
| 297 isolated visual rerun | 30 / 30 | 0.0222–0.0619 |
| origin/main `fdba42d` isolated rerun (297 session) | 30 / 30 | 0.0222–0.0708 |
| **298 full run** | **31 / 29** | 0.0222–0.0619 |
| 298 isolated visual rerun | 30 / 30 | 0.0222–0.0619 |
| origin/main `2ecf781` isolated rerun (temporary detached worktree, removed) | 32 / 28 | 0.0222–0.0619 |

Cell by cell across all six runs:

- All 40 low/default cells, including all four low/default `container-ui`
  cells, are **byte-identical**.
- All 10 high/1280x720 cells have a stable status (fail in every run). Their
  fractions vary within each build too; for example, render-world-no-hud is
  0.0535/0.0416 across the two 297 runs.
- Every status flip is a `high/1920x1080` cell, and each flip also happens
  within a single build or on unmodified origin/main:

| cell | 297 full | 297 rerun | main fdba42d | 298 full | 298 rerun | main 2ecf781 |
|---|---|---|---|---|---|---|
| container-ui/high/1920x1080 | fail 0.0242 | fail 0.0280 | pass 0.0173 | fail 0.0243 | pass 0.0173 | fail 0.0268 |
| crosshair/high/1920x1080 | pass 0.0184 | pass 0.0184 | fail 0.0341 | fail 0.0311 | fail 0.0325 | fail 0.0341 |
| render-world-no-hud/high/1920x1080 | fail 0.0325 | fail 0.0325 | pass 0.0184 | fail 0.0248 | fail 0.0325 | fail 0.0325 |
| start-overlay/high/1920x1080 | pass 0.0184 | pass 0.0184 | fail 0.0325 | pass 0.0184 | pass 0.0184 | fail 0.0325 |

- The 298 full vs 298 rerun difference is the single cell
  `container-ui/high/1920x1080`. It fails and passes on the same 298 build,
  and fails on unmodified origin/main `2ecf781`.
- `crosshair/high/1920x1080` fails on unmodified origin/main in both
  sessions, so it is not a 298 effect.
- The same fraction values recur across builds (0.01733 / 0.01842 / 0.0325).
- The flips are therefore run-order / SwiftShader timing variance of the
  high-profile captures.

## Divergences (documented)

- There is no glass-bottle crafting recipe, because the golden-isolation
  rule was not met. Sources are witch drops and drink returns.
- Milk and buckets do not exist.
- Nether wart has no survival source (no Nether). Glowstone dust and fermented
  spider eye are absent.
- A fill with no inventory room refuses instead of dropping the water bottle.
- There is no drinking slowdown, animation or particles, and in-progress
  drinks are not persisted.
- Every live water block counts as a source.

Published by fast-forward (no force) — see the docs-sync line below.
