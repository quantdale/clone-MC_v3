# Spec: fire-block-simulation

## Contract
This capability adds a **Fire** block and a deterministic fire simulation. A pure **ignition** API
places Fire (age 0) on an ignitable surface; a **`FireBlockBehavior`** driven by the existing
random-tick dispatch ages the fire, extinguishes it when unsupported or adjacent to water, consumes
its flammable support at the end of its life, and spreads bounded new fires to ignitable neighbors.
All randomness is derived from the injected simulation seed via a stable hash, so identical worlds
replay identically. The capability adds no new tool item, no scheduled-tick wiring (the
`ScheduledTickQueue` is not integrated into the game loop yet), and no persistence-format change —
fire state lives in the existing in-memory block-state overlay.

## Definitions
- **Fire block**: `BlockId.Fire = 36`, resource `minecraft:fire`, key `fire`, with a single integer
  `age` property in `[0, 15]`, default `0`. Non-solid, non-opaque, non-breakable, transparent
  render category, no `dropItem` (drops nothing).
- **Flammable block**: one of `BlockId.Wood`, `BlockId.Leaves`, `BlockId.Planks`, per
  `isFlammable(id)`. All other catalog blocks are non-flammable.
- **Ignitable cell**: a world cell `(x, y, z)` whose block is Air and whose directly-supporting
  block below `(x, y-1, z)` is flammable.
- **Ignition**: `ignite(world, x, y, z)` places Fire `age 0` at an ignitable cell and returns
  `true`; otherwise it writes nothing and returns `false`.
- **Support**: the block directly below a fire. A fire is supported when that block is flammable.
- **End of life**: a fire is at the end of its life when its age can no longer advance, i.e.
  `age + 1 > MAX_FIRE_AGE`.
- **Burn rule**: at the end of its life, the fire extinguishes (Fire → Air) and, when its support is
  flammable, that support is consumed to Air.
- **Extinguish-by-environment**: a fire extinguishes (Fire → Air) when unsupported (support not
  flammable) or adjacent to Water (any of the 6 orthogonal neighbors is Water).
- **Spread**: from a live fire on a random tick, up to `MAX_SPREAD_PER_TICK` new fires are ignited
  among the 6 fixed neighbors, each igniting only when it is an ignitable cell and its deterministic
  roll is below `SPREAD_PROBABILITY`.
- **Random tick**: the existing 048 selection of eligible cells per 16×16×16 section in
  `Game.tickRandomBlocks`, which invokes a block's `onRandomTick`.

## Invariants
- `MAX_FIRE_AGE === 15`; a fire's `age` never leaves `[0, 15]`.
- `isFlammable` is `true` exactly for `{Wood, Leaves, Planks}` and `false` for every other block id
  in the catalog (including Air, Grass, Dirt, Stone, and Fire).
- `ignite` never writes and never throws on a non-ignitable cell; it returns `false`.
- A fire at the end of its life becomes Air and consumes its flammable support to Air in the same
  tick; a fire extinguished by environment never consumes its support.
- Spread is bounded: at most `MAX_SPREAD_PER_TICK` new fires per fire per random tick, considering
  at most 6 candidates. No unbounded loops.
- All randomness comes from the injected seed (`hash32`-derived); no global RNG is used.

## Requirements

### Requirement: the fire block is a registered, non-solid, 16-age-state block
`BlockId.Fire` MUST equal `36`. `createDefaultBlockRegistry()` MUST include a definition with
`id === 36`, resource id `minecraft:fire`, key `fire`, `solid === false`, `opaque === false`,
`breakable === false`, `renderCategory === Transparent`, no `dropItem`, and a property schema with
an integer `age` in `[0, 15]` defaulting to `0`. `createDefaultBlockStateRegistry()` MUST enumerate
exactly 16 fire states with `age` values `0..15`, and the default state MUST be `age = 0`.

#### Scenario: fire enumerates 16 age states
- **GIVEN** `createDefaultBlockStateRegistry()`
- **WHEN** `statesForBlock(BlockId.Fire)` is queried
- **THEN** it returns 16 states whose `age` values are `['0','1',...,'15']`
- **AND** `getDefaultState(BlockId.Fire).getProperty('age')` is `'0'`

### Requirement: flammability is a small, documented predicate
`isFlammable(blockId)` MUST return `true` exactly for `BlockId.Wood`, `BlockId.Leaves`, and
`BlockId.Planks`, and `false` for every other block id, including Air, Grass, Dirt, Stone, Fire.

#### Scenario: the flammable set is exactly Wood/Leaves/Planks
- **GIVEN** the default block registry
- **WHEN** `isFlammable` is evaluated over every registered block id
- **THEN** it is `true` only for `wood`, `leaves`, and `planks`, and `false` for `air`, `grass`,
  `dirt`, `stone`, `fire`, and all remaining blocks

### Requirement: ignite places fire only on an ignitable cell
`ignite(world, x, y, z)` MUST write Fire `age 0` at `(x, y, z)` when that cell holds Air and the
block directly below `(x, y-1, z)` is flammable, and MUST return `true`. Otherwise it MUST write
nothing and return `false`, and MUST NOT throw.

#### Scenario: ignite places fire on flammable support
- **GIVEN** a fake `BlockWorldAccess` with air at `(5, 6, 7)` and `BlockId.Wood` at `(5, 5, 7)`
- **WHEN** `ignite(world, 5, 6, 7)` is called
- **THEN** it returns `true`, the cell at `(5, 6, 7)` is Fire, and its age is `0`

#### Scenario: ignite is a no-op on a non-ignitable cell
- **GIVEN** a fake access with `BlockId.Stone` at `(1, 2, 3)` and air at `(1, 3, 3)` (non-flammable
  support), and air at `(9, 9, 9)` with air below it
- **WHEN** `ignite` is called at `(1, 3, 3)` and at `(9, 9, 9)`
- **THEN** both return `false` and neither cell becomes Fire

### Requirement: fire ages each random tick and extinguishes at end of life
`FireBlockBehavior.onRandomTick` MUST, for a supported, dry fire, advance its `age` by 1 (capped at
`MAX_FIRE_AGE`). When `age + 1 > MAX_FIRE_AGE`, it MUST set the fire cell to Air and, when the
support below is flammable, set that support to Air (the burn rule). A fire's age MUST never exceed
`MAX_FIRE_AGE`.

#### Scenario: a fresh fire ages over successive random ticks and burns its support
- **GIVEN** a fake access with Fire `age 0` at `(5, 6, 7)` over `BlockId.Wood` at `(5, 5, 7)`
- **WHEN** `onRandomTick` is invoked 16 times (tick values `1..16`)
- **THEN** the recorded ages are `1,2,...,14,15` (15 writes), and on the 16th tick the fire cell
  becomes Air and the wood below becomes Air

### Requirement: fire extinguishes when unsupported or adjacent to water
`FireBlockBehavior.onRandomTick` MUST set the fire cell to Air when the block below is not flammable
(unsupported) or when any of the 6 orthogonal neighbors is Water. An environment-extinguished fire
MUST NOT consume its support.

#### Scenario: unsupported fire goes out
- **GIVEN** a fake access with Fire at `(5, 6, 7)` and `BlockId.Stone` at `(5, 5, 7)`
- **WHEN** `onRandomTick` is invoked
- **THEN** the cell at `(5, 6, 7)` becomes Air and the stone below is unchanged

#### Scenario: water-adjacent fire goes out
- **GIVEN** a fake access with Fire at `(5, 6, 7)` over `BlockId.Wood`, and `BlockId.Water` at
  `(5, 6, 8)`
- **WHEN** `onRandomTick` is invoked
- **THEN** the fire cell becomes Air and the wood below is unchanged (not burned)

### Requirement: spread is bounded and ignites only ignitable neighbors
On a random tick of a live fire, `FireBlockBehavior.onRandomTick` MUST evaluate the 6 fixed
neighbors (4 horizontal + up + down) and ignite each neighbor that is an ignitable cell whose
deterministic roll is below `SPREAD_PROBABILITY`, stopping once `MAX_SPREAD_PER_TICK` new fires are
ignited. Spread MUST NOT ignite a non-ignitable neighbor, and MUST NOT exceed `MAX_SPREAD_PER_TICK`
new fires in one tick.

#### Scenario: spread ignites only flammable-surfaced neighbors within the cap
- **GIVEN** a fake access with Fire at `(0, 5, 0)` over `BlockId.Wood`, flammable blocks (Planks)
  beneath `(1, 5, 0)` and `(-1, 5, 0)` (both air cells), a non-flammable support (Stone) beneath
  `(0, 5, 1)`, and a `roll` function returning `0` for every candidate
- **WHEN** `onRandomTick` is invoked
- **THEN** at most `MAX_SPREAD_PER_TICK` fire cells appear, each only at an ignitable neighbor, and
  the Stone-supported neighbor `(0, 5, 1)` is never ignited

#### Scenario: spread never fires when rolls exceed the threshold
- **GIVEN** a fake access with Fire over Wood and ignitable neighbors
- **WHEN** `onRandomTick` is invoked with a `roll` that returns `1` for every candidate
- **THEN** no new fire is placed

### Requirement: fire simulation is deterministic and safe
`onRandomTick` MUST NOT throw on a non-fire cell, a throwing state read, or an access that lacks
state capability; such cases MUST be safe no-ops or safe skips. The seeded roll
`spreadRoll(seed, x, y, z, tick, index)` MUST be a pure function of its inputs returning a value in
`[0, 1)`.

#### Scenario: non-fire and state-less accesses are safe
- **GIVEN** a fake access holding `BlockId.Stone` at a cell, and a minimal `BlockWorldAccess`
  implementing only `getBlockId`/`setBlockId` that reports Fire
- **WHEN** `onRandomTick` is invoked on the stone cell and on the minimal access
- **THEN** neither throws; the stone cell is unchanged, and the minimal access performs no illegal
  write

## Error and failure behavior
- Ignition on a non-air or unsupported cell: returns `false`, no write, no throw.
- A fire whose cell no longer holds Fire on a random tick: no-op.
- A throwing `getBlockState`: `onRandomTick` catches and skips the tick (no crash, no write).
- An access without `getBlockState`/`setBlockState`: fire cannot age, but extinguishes
  (unsupported/water) and spreads still function.
- Spread candidates that are out of range, already Fire, or non-ignitable: skipped without error.

## Performance and resource bounds
- `onRandomTick` is O(1) amortized: ≤ 6 water-adjacency reads, ≤ 6 spread-candidate reads, one
  state read, one optional state write, and ≤ 6 `hash32` rolls. It ignites at most
  `MAX_SPREAD_PER_TICK` cells. No unbounded loops.
- Fire adds 16 states to the block-state registry (well under `MAX_STATES_PER_BLOCK = 65536`).

## Compatibility and migration
- New block id `BlockId.Fire = 36` is additive; all existing block ids and states are unchanged.
- Fire's `age` persists only through the existing in-memory state overlay (125/126) and does not
  enter the `WorldEditSnapshot` edit format; no persistent snapshot/serialization change and no
  migration.
- `BlockItemSeparation.test.ts` preserved-id table adds row `[36, 'fire', null]`.
- `BlockStateRegistry.test.ts` state-count formula updates from
  `blockRegistry.all().length - 2 + 8 + 8` to `blockRegistry.all().length - 3 + 8 + 8 + 16`, and its
  enumeration branch covers the 16 fire states.

## Security and integrity
- Fire `age` is only ever written in `[0, 15]`; the block-state registry rejects any out-of-domain
  assignment, so fire cannot corrupt block-state storage.
- Ignition and spread only ever write Fire to air cells with flammable support; they never overwrite
  an existing non-air block.
- Bounded spread (`MAX_SPREAD_PER_TICK`, ≤ 6 candidates) prevents a single fire from exploding the
  world or the tick budget.

## Observability
- Fire state is inspectable via `World.getBlockState` (`age`) and `BlockState.debugString()`
  (`minecraft:fire[age=n]`).
- `ignite` returns whether fire was placed; `spreadFire` returns how many fires were ignited in a
  tick.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 | `tests/unit/FireBehavior.test.ts` block/enumeration assertions; `BlockStateRegistry.test.ts` |
| REQ-2 | `tests/unit/FireBehavior.test.ts` `isFlammable` over all registered blocks |
| REQ-3 | `tests/unit/FireBehavior.test.ts` `ignite` valid / invalid |
| REQ-4 | `tests/unit/FireBehavior.test.ts` age sequence + burn rule |
| REQ-5 | `tests/unit/FireBehavior.test.ts` unsupported / water-adjacent extinguish |
| REQ-6 | `tests/unit/FireBehavior.test.ts` bounded spread + roll-controlled spread |
| REQ-7 | `tests/unit/FireBehavior.test.ts` non-fire / state-less / throwing-read safety |
