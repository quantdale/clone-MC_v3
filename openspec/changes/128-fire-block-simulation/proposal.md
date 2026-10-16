# Proposal: 128-fire-block-simulation

## Problem
The world catalog has no fire and no fire simulation. There is no way to ignite flammable blocks
(Wood, Leaves, Planks), no aging/burning model, and no spread or extinguishing. The simulation
infrastructure for this exists (048 random-tick selection, 050 block-behavior dispatch, 125/126
block-state age/moisture overlays), but no fire block or behavior consumes it.

## Goals
- Add a **Fire** block (`BlockId.Fire = 36`) with a single integer `age` property in `[0, 15]`
  (default `0`), non-solid, non-opaque, non-breakable, and dropping no item.
- Add a pure, deterministic **ignition** API: `ignite(world, x, y, z)` places Fire `age 0` at a
  location when the cell is air and the block directly below it is flammable; it is a no-op
  otherwise.
- Add a **flammability** predicate (`isFlammable`) over a small, documented set
  (Wood/Leaves/Planks).
- Add a **`FireBlockBehavior`** (`onRandomTick`) that, deterministically from the injected seed:
  ages the fire, extinguishes it when unsupported or adjacent to water, consumes (burns to Air) its
  flammable support at the end of its life, and spreads bounded fire to ignitable neighbors.
- Wire the behavior into the existing `BlockBehaviorRegistry` and the `Game` random-tick dispatch so
  fire ticks with loaded/simulating sections, mirroring crop/farmland.
- Keep everything deterministic and unit-testable against a fake `BlockWorldAccess`.

## Non-goals
- **No Flint & Steel or any new tool item.** There is no flint-and-steel item in the catalog; the
  ignition surface is the pure `ignite` API plus a unit test. A tool item is deliberately deferred.
- **No scheduled-tick burn timers.** The `ScheduledTickQueue` (047) is a standalone class not yet
  wired into the `Game` tick loop; wiring it (dispatch + lifecycle + persistence) is broader scope.
  Fire therefore uses the already-wired random-tick dispatch (048) with a deterministic
  per-block `age` as its burn timer, as the scope allows ("bounded scheduled/**random** ticks").
- **No player damage, no entity/burn damage, no light emission, no smoke/particles, no sound.**
- **No redstone, no TNT, no nether-portal ignition.** All later changes.
- **No persistence-format change.** Fire state persists only through the existing in-memory
  `World` block-state overlay (125/126 pattern); the edit-snapshot format is unchanged.
- **No rendering art beyond an atlas tile index** mirroring the existing block pattern.

## Preconditions
- Change 125 (wheat `age` 0..7, `World.setBlockState`/`getBlockState`) is VERIFIED.
- Change 126 (farmland `moisture`, `BlockId.Farmland = 35`) is VERIFIED.
- Change 127 (item `BoneMeal = 34`, fertilization) is VERIFIED.
- `origin/main` head equals the local `HEAD` (`35ae389`).
- `BlockId.Farmland = 35` is the last used block id; the next free id is **36**.

## Dependencies
- `src/world/BlockRegistry.ts` (`BlockId`, `BlockTypeDefinition`, `createDefaultBlockRegistry`,
  `WHEAT_SCHEMA`/`FARMLAND_SCHEMA` pattern for `FIRE_SCHEMA`).
- `src/world/BlockPropertySchema.ts` (`BlockPropertySchema` integer property).
- `src/simulation/BlockBehavior.ts` (`BlockBehavior`, `BlockBehaviorContext`, `BlockWorldAccess`).
- `src/simulation/RandomTickSelector.ts` (`hash32` for deterministic spread rolls).
- `src/simulation/WorldBlockAccess.ts` (adapter used by `Game`).
- `src/engine/Game.ts` (`tickRandomBlocks`, `behaviorRegistry`, `isRandomTickEligible`).

## Proposed change
1. `BlockId.Fire = 36` + `FIRE_SCHEMA` (integer `age` 0..15) + a fire definition in
   `createDefaultBlockRegistry` (non-solid, non-opaque, non-breakable, transparent render, no
   `dropItem`, `defaultState { age: 0 }`).
2. New `src/simulation/FireBehavior.ts`:
   - Constants: `FIRE_AGE_PROPERTY = 'age'`, `MAX_FIRE_AGE = 15`, `SPREAD_PROBABILITY = 0.5`,
     `MAX_SPREAD_PER_TICK = 2`.
   - Pure helpers: `isFlammable(id)`, `parseFireAge(raw)`, `canIgnite(world, x, y, z)`,
     `ignite(world, x, y, z)`, `isAdjacentToWater(world, x, y, z)`, `spreadFire(world, x, y, z, roll)`,
     `spreadRoll(seed, x, y, z, tick, index)`.
   - `FireBlockBehavior implements BlockBehavior` with `onRandomTick` wiring the helpers.
3. `BlockBehaviorContext` gains an optional `seed?: number` field (additive, non-breaking); `Game`
   passes `this.seed` when dispatching random ticks.
4. `Game` registers `FireBlockBehavior` against the fire block key; `isRandomTickEligible`
   already admits any non-air block with an `onRandomTick` behavior, so fire ticks automatically.

## Compatibility and migration
- Additive block id 36 only; no block-id/state-id/save-format change; no migration. Fire state uses
  the existing in-memory state overlay (125/126) and does not enter the edit snapshot.
- `BlockItemSeparation.test.ts` preserved-id table gains row `[36, 'fire', null]`;
  `BlockStateRegistry.test.ts` state-count formula and enumeration branch gain the 16 fire states.

## Risks
- Adding a block with 16 states changes the block-state registry total size. Mitigation: update the
  one assertion (BlockStateRegistry.test.ts) that hard-codes the count; the formula is derived from
  `blockRegistry.all().length`, not a magic number.
- Spread could feel fast/unbounded. Mitigation: `MAX_SPREAD_PER_TICK = 2` and a 50% per-candidate
  roll, both documented constants, plus a fixed candidate order — no unbounded loop (≤ 6 candidates,
  ≤ 2 ignitions per tick).
- Fire placed on a flammable block that later changes. Mitigation: the unsupported check
  extinguishes fire whose support is no longer flammable.
- No tool item to start fire. Mitigation: this is a deliberate, documented deferral; the pure
  `ignite` API is the seam a future Flint & Steel item would call.

## Rollback strategy
The change is additive (new block, new module, new behavior registration, one optional context
field). Reverting is a single commit revert; removing the fire block, module, and registration
restores prior behavior with no persistence impact.

## Definition of Done
- Fire block id 36 registered with a 16-age-state schema; `isFlammable` documents the small set.
- `ignite` places Fire age 0 on a valid target and is a no-op on invalid targets.
- `FireBlockBehavior.onRandomTick` ages fire to MAX then extinguishes; burns flammable support;
  extinguishes unsupported/water-adjacent fire; spreads bounded, only to ignitable neighbors.
- `BlockBehaviorContext.seed` added; `Game` registers fire and passes the seed.
- Unit tests cover block-state enumeration, ignition, aging/extinguish, burn, spread bound, and
  flammability; the existing suite (1654) stays green.
- Full gate green: typecheck, lint, unit, build, e2e (21/21).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
