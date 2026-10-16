# Spec: survival-progression

## Contract

Verifies progression stages 0-3 of the survival chain through the headless
`ProgressionHarness` (spec: progression-harness): fresh-world spawn (0), tools
(1), food (2), and shelter (3). Each stage has an exact completion assertion
defined here. The browser E2E seam additionally asserts the fresh-spawn and
tool/food/shelter end-states observable in the running game through the
`window.__voxelGame` hook.

## Definitions

- **Deterministic spawn**: the fixed overworld spawn the game uses for a fresh
  world; the exact coordinates are produced by the world generator for the seed.
- **Starvation**: health loss via `SurvivalSystem` when hunger and saturation
  are both 0 (`starvation` damage type), per `SurvivalSystem.update`.
- **Air-tight shelter**: an enclosed set of placed blocks whose interior air
  cells cannot reach the exterior of the enclosure by a 6-connected flood fill
  through air (diagonals do not leak).

## Invariants

- Stage assertions MUST be evaluated against the real `HarvestRules`,
  `FoodComponentRuntime`/`SurvivalSystem`, `ExperienceSystem`, and the
  `CoreProgressionAdvancements` chain — never against fixtures of those modules.
- A stage completes only when its assertion holds; no partial credit.
- Advancement achievements for stages 0-3 MUST occur in `CoreProgressionAdvancements`
  order: `stone_age`, `acquire_hardware`, `iron_tools`, `diamonds`.

## Requirements

### Requirement: fresh-world spawn (Stage 0)
A fresh world for a seed MUST spawn the player at the deterministic spawn with a
full survival baseline, zero experience, and the overworld loaded.

#### Scenario: fresh world baseline
- **GIVEN** a harness constructed with a fresh `worldSeed` and no script yet run
- **WHEN** the fresh-world stage is queried
- **THEN** the player is at the deterministic spawn position
- **AND** `survival` is `{ version: 1, health: 20, hunger: 20, saturation: 5 }`
- **AND** `experience` is `{ version: 1, level: 0, xp: 0 }`
- **AND** the overworld dimension (`minecraft:overworld`) is loaded
- **AND** the block directly below the player's feet is not air
- **AND** `isStageComplete('fresh-world')` is `true`

#### Scenario: fresh world persists across reload
- **GIVEN** a completed fresh-world stage
- **WHEN** `snapshot()` is taken and `restore()` applied to a fresh harness
- **THEN** the restored player position, survival, and experience match the
  snapshot exactly
- **AND** `isStageComplete('fresh-world')` is `true` after restore

### Requirement: tools (Stage 1)
The player MUST be able to progress from gathering wood through the tool chain —
wooden pickaxe → stone pickaxe → iron pickaxe → obtain a diamond — with harvest
gating enforced by `HarvestRules` (a block with `miningLevel >= 1` drops only
with a matching tool kind whose tier meets the level).

#### Scenario: full tool chain
- **GIVEN** a harness at the fresh-world stage with gathering/crafting available
- **WHEN** the script gathers wood, crafts a wooden pickaxe, then advances to
  stone and iron pickaxes, then obtains a diamond
- **THEN** the inventory contains a wooden, a stone, and an iron pickaxe and at
  least one diamond
- **AND** advancements `stone_age`, `acquire_hardware`, `iron_tools`, and
  `diamonds` are all achieved
- **AND** their `achievedTick` values are strictly ascending in that order
- **AND** `isStageComplete('tools')` is `true`

#### Scenario: wrong tool yields no drop
- **GIVEN** a `miningLevel >= 1` block requiring pickaxe tier `T`
- **WHEN** the player attempts to break it with a hand or a tool whose kind does
  not match or whose tier is below `T`
- **THEN** `HarvestRules.canHarvest(def, tool)` is `false`
- **AND** the block yields no drop
- **AND** the harness aborts atomically with `wrong_tool_for_mining_level` (per
  progression-harness failure behavior) rather than advancing the stage

### Requirement: food (Stage 2)
The player MUST be able to consume food that restores hunger and saturation per
`resolveFoodConsume` + `SurvivalSystem.eat`, and MUST survive a fed window
without starvation.

#### Scenario: eating restores hunger and saturation
- **GIVEN** a player whose hunger and saturation are below their maxima
- **WHEN** the player consumes a food item with resolved hunger `h` and
  saturation `s`
- **THEN** `SurvivalSystem.eat` increases hunger by `min(h, 20 - hunger)` and
  saturation by `min(s, 20 - saturation)`
- **AND** the eaten item's count in inventory decreases by 1
- **AND** `isStageComplete('food')` is `true` once hunger is restored above the
  starvation threshold

#### Scenario: starving player loses health
- **GIVEN** a player with hunger and saturation both 0
- **WHEN** the simulation advances a fed window (hunger 0) long enough for the
  starvation damage tick to fire
- **THEN** health decreases by the starvation damage amount per tick interval
- **AND** if the scenario script attempts to continue without food, the harness
  aborts atomically with `not_fed` rather than reporting the food stage complete

### Requirement: shelter (Stage 3)
The player MUST be able to place blocks forming an air-tight enclosed shelter
around the spawn point, and the shelter MUST persist across save/reload.

#### Scenario: enclosed shelter is air-tight
- **GIVEN** a player at the deterministic spawn
- **WHEN** the script places blocks to form an enclosed shelter whose interior
  contains the player and whose interior air is sealed from the exterior
- **THEN** a 6-connected flood fill from the interior through air does not reach
  the exterior of the enclosure
- **AND** the player is inside the interior
- **AND** `isStageComplete('shelter')` is `true`

#### Scenario: shelter persists across reload
- **GIVEN** a completed shelter stage
- **WHEN** `snapshot()` is taken, the harness is `reset()` to a fresh state, and
  `restore()` is applied
- **THEN** the placed shelter blocks are present in the restored world edits
- **AND** the interior remains air-tight
- **AND** `isStageComplete('shelter')` is `true`

### Requirement: survival foundation through the running game (browser seam)
The fresh-spawn, tool, food, and shelter end-states MUST also be observable
through the running game's `window.__voxelGame` hook on the `VITE_E2E` build,
matching the existing `tests/e2e` patterns.

#### Scenario: fresh spawn status in the browser
- **GIVEN** the game is booted via Playwright with `waitForGame` and pointer lock
  entered
- **WHEN** the survival status and hotbar are read
- **THEN** `#health-status` shows 20 hearts and `#hunger-status` shows 20 hunger
- **AND** `window.__voxelGame.survival.health/hunger/saturation` equal 20/20/5

#### Scenario: crafted tool appears in the hotbar
- **GIVEN** wood is supplied and the recipe chain is performed (as in the
  existing `game.spec.ts` craft test)
- **WHEN** a wooden pickaxe is crafted
- **THEN** the hotbar contains a `Wooden Pickaxe` slot with visible durability
- **AND** `window.__voxelGame.inventory.getItemCount(woodenPickaxeId) >= 1`

## Error and failure behavior

- Stage 1 wrong-tool attempts abort with `wrong_tool_for_mining_level` (atomic).
- Stage 2 starvation attempts abort with `not_fed`.
- Stage 3 non-sealed "shelter" is NOT credited: `isStageComplete('shelter')`
  stays `false` until the enclosure is air-tight.
- Malformed restore input is rejected atomically (progression-harness contract).

## Performance and resource bounds

- The stages' scripts run under the bounded `maxSteps` budget (progression-harness
  contract).
- The shelter flood fill is bounded by the in-memory fixture bounds.

## Compatibility and migration

Uses only existing module contracts (`SurvivalSnapshot` v1, `ExperienceSnapshot`
v1, `Inventory.snapshot/restore`, `HarvestRules`, `FoodComponentRuntime`). No new
data format or migration.

## Security and integrity

No external input surface. The only untrusted-shaped input is the `restore`
payload, validated atomically per the harness contract.

## Observability

- `stateHash()` fingerprints the survival-foundation state; per-stage flags and
  the ordered `stone_age → diamonds` `achievedTick` values localize failures.
- Browser seam reads `#health-status`, `#hunger-status`, hotbar slots, and the
  `__voxelGame` handle for observable end-state.

## Verification mapping

- `tests/unit/ProgressionHarness.survival.test.ts` (or a dedicated file): stage 0
  baseline + reload, stage 1 tool chain + wrong-tool failure, stage 2 food +
  starvation, stage 3 shelter seal + reload persistence, and stage-boundary
  save/reload.
- `tests/e2e/game.spec.ts` (extend): browser assertions for fresh spawn, crafted
  tool in hotbar, food consumption, and placed block shelter.
