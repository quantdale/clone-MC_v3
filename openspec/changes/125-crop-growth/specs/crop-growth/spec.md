# Spec: crop-growth

## Contract
This capability makes a single crop (wheat) a stateful block that grows deterministically via
random ticks and yields crops through the existing loot path. It covers age block states,
random-tick crop growth, and crop drops. Farmland hydration/trampling (126) and bonemeal (127)
are explicitly out of scope. Wheat rendering art is out of scope (placeholder tile).

## Definitions
- **Wheat block**: the block registered as `minecraft:wheat` with a single integer property
  `age` in `[0, 7]`; `age` is the growth stage (0 = newly planted seed, 7 = mature).
- **Canonical wheat state**: one `(block, age)` combination enumerated by the
  `BlockStateRegistry`; there are exactly 8.
- **Random tick**: a deterministic selection of a world cell by `RandomTickSelector` in a
  ticking section, which triggers the cell's block behavior `onRandomTick`.
- **Crop**: a block whose registered `BlockBehavior` exposes an `onRandomTick` hook (here,
  wheat via `CropBlockBehavior`).
- **BlockWorldAccess**: the access surface a behavior may use; optionally provides
  `getBlockState`/`setBlockState`.

## Invariants
- The default wheat state is `age = 0`; `age` never leaves `[0, 7]`.
- `nextCropAge(age)` for `0 <= age <= 7` returns `min(7, age + 1)`.
- `isMature(age)` is true iff `age >= 7`; a mature crop never receives a growth write.
- `CropBlockBehavior.onRandomTick` MUST NOT throw; malformed age reads are treated as age 0 or
  skipped.
- A `setBlock` write clears any recorded state override for that cell.
- Crop drops flow through the loot path (never a separate hard-coded drop branch).

## Requirements

### Requirement: wheat exposes an age state domain of 0..7
`BlockId.Wheat` MUST be registered with an `IntegerPropertySpec` named `age` with `min: 0`,
`max: 7`, and a default state of `age = 0`. The default block-state registry MUST enumerate
exactly 8 wheat states (one per legal `age`), each resolvable by `age` value.

#### Scenario: eight canonical wheat states
- **GIVEN** the default block and block-state registries
- **WHEN** `statesForBlock(BlockId.Wheat)` is queried
- **THEN** it returns 8 states whose `age` values are exactly `0` through `7` in ascending
  order, and `getDefaultState(BlockId.Wheat).getProperty('age')` equals `'0'`

### Requirement: crop growth is deterministic and clamped
`nextCropAge(age)` MUST return `0` for `age < 0` or non-integer input, and
`min(MAX_AGE, age + 1)` for integer `age >= 0`, where `MAX_AGE === 7`. `isMature(age)` MUST
return `true` iff `age >= MAX_AGE`. A crop planted at `age = 0` therefore reaches maturity in
exactly 7 increments (≤ 7 random ticks).

#### Scenario: clamping at maturity
- **GIVEN** `age = 6`
- **WHEN** `nextCropAge(age)` is called
- **THEN** the result is `7`, and `isMature(7)` is `true`

#### Scenario: clamped inputs never exceed maturity
- **GIVEN** `age = 7`
- **WHEN** `nextCropAge(age)` is called
- **THEN** the result is `7` (no growth past mature)

#### Scenario: invalid input normalizes to age 0
- **GIVEN** `age = -3`
- **WHEN** `nextCropAge(age)` is called
- **THEN** the result is `0`

### Requirement: a crop grows one stage per random tick via its behavior
`CropBlockBehavior.onRandomTick(ctx)` MUST, when the cell's block id matches the crop's block
and the access exposes `getBlockState`/`setBlockState`, read the current `age`, and if not
mature write `{ age: nextCropAge(age) }` via `setBlockState` at `(x, y, z)`. When mature, it
MUST NOT write. When the access lacks the state capability or the block id does not match, it
MUST NOT throw and MUST NOT write.

#### Scenario: increments to maturity and stops
- **GIVEN** a fake `BlockWorldAccess` holding wheat at `age = 0` at `(1, 2, 3)`
- **WHEN** `onRandomTick` is invoked for `(1, 2, 3)` repeatedly until mature
- **THEN** the recorded ages progress `0 -> 1 -> ... -> 7`, the last write is `age = 7`, and a
  further `onRandomTick` writes nothing

#### Scenario: malformed age read is safe
- **GIVEN** a fake access whose `getBlockState` returns a state with a non-numeric `age`
- **WHEN** `onRandomTick` is invoked
- **THEN** no exception is thrown and the recorded write (if any) uses a legal age

#### Scenario: missing state capability is a no-op
- **GIVEN** a `BlockWorldAccess` that implements only `getBlockId`/`setBlockId`
- **WHEN** `onRandomTick` is invoked for a matching crop block
- **THEN** no write occurs and no exception is thrown

### Requirement: random-tick dispatch selects only crop blocks
`Game`'s random-tick dispatch MUST, for each simulated section, request positions via
`RandomTickSelector.selectEligible` with an eligibility predicate that is true only when the
block at the position has a registered behavior exposing `onRandomTick`, and MUST invoke
`behavior.onRandomTick(ctx)` for each selected position. Dispatch MUST be bounded by
`selectEligible`'s attempt cap.

#### Scenario: only crop cells are selected
- **GIVEN** a section containing one wheat cell among stone/air cells
- **WHEN** `selectEligible` is run with the crop predicate
- **THEN** every returned position is a wheat cell, and no returned position is stone or air

#### Scenario: dispatch is bounded for an all-ineligible section
- **GIVEN** a section with no eligible cells
- **WHEN** `selectEligible` is run with the crop predicate
- **THEN** it returns an empty list within the attempt cap (no hang)

### Requirement: crop drops flow through the loot path
The wheat block MUST reference a `loot/wheat` table whose evaluation, for an immature wheat
block (`age` in `0..6`), produces exactly one `wheat_seeds` stack, and for a mature wheat
block (`age === '7'`) produces exactly one `wheat_seeds` stack and one `wheat` stack, in that
order. Evaluation MUST read the age from `LootContext.properties.age`.

#### Scenario: immature wheat drops only seeds
- **GIVEN** `LootContext.properties = { age: '3' }` for a wheat block
- **WHEN** `evaluate(loot/wheat, ctx, rng, items)` is called
- **THEN** the output is exactly `[{ item: ItemId.WheatSeeds, count: 1 }]`

#### Scenario: mature wheat drops wheat and seeds
- **GIVEN** `LootContext.properties = { age: '7' }` for a wheat block
- **WHEN** `evaluate(loot/wheat, ctx, rng, items)` is called
- **THEN** the output is exactly `[{ item: ItemId.WheatSeeds, count: 1 }, { item: ItemId.Wheat, count: 1 }]`

#### Scenario: absent age behaves like immature
- **GIVEN** `LootContext.properties` is `undefined`
- **WHEN** `evaluate(loot/wheat, ctx, rng, items)` is called
- **THEN** the output is exactly one `wheat_seeds` stack (no wheat)

### Requirement: harvest passes the block state into the loot context
`PlayerInteraction.finishBreak` MUST populate `LootContext.properties` from the broken block's
state (each property name → canonical text value) when the world access exposes
`getBlockState`, so an age-aware loot table can read the broken crop's age.

#### Scenario: breaking a mature crop uses its age
- **GIVEN** a world cell holding mature wheat (`age = 7`)
- **WHEN** the cell is broken via the interaction path
- **THEN** the loot evaluation receives `properties = { age: '7' }` and yields wheat + seeds

### Requirement: block-state access reads and writes states via the registry
`World.setBlockState(x, y, z, blockId, properties)` MUST resolve the target state through the
`BlockStateRegistry` and write it (writing the block id via the normal `setBlock` path and
recording the state), and `World.getBlockState(x, y, z)` MUST return the recorded state or the
block's default state when none is recorded. `World.setBlock` MUST clear any recorded state
for the written cell.

#### Scenario: set/get state round-trips through the World
- **GIVEN** a World whose chunk at `(8, 8, 8)` is generated
- **WHEN** `setBlockState(8, 8, 8, BlockId.Wheat, { age: 5 })` then `getBlockState(8, 8, 8)` is called
- **THEN** `getBlockState` returns the wheat state with `age = 5`, and `getBlock(8, 8, 8)` returns `BlockId.Wheat`

#### Scenario: unset cells resolve to the default state
- **GIVEN** a World with a wheat block written via `setBlock` (no explicit state)
- **WHEN** `getBlockState(x, y, z)` is called
- **THEN** it returns the wheat default state with `age = 0`

#### Scenario: a plain setBlock clears stale state
- **GIVEN** `setBlockState(8, 8, 8, BlockId.Wheat, { age: 5 })`
- **WHEN** `setBlock(8, 8, 8, BlockId.Stone)` then `getBlockState(8, 8, 8)` is called
- **THEN** the returned state is the stone default (no wheat state leaks)

## Error and failure behavior
- Malformed/non-numeric `age`: treated as age 0 or skipped; no throw (REQ-3).
- Missing state capability on the access: no write, no throw (REQ-3).
- `setBlockState` with out-of-bounds coordinates or an unregistered block id: no-op (REQ-7).
- `setBlockState` with an illegal assignment (e.g. `age: 8`): the registry `lookup` throws;
  the crop behavior is the only caller and only produces legal ages.
- Immature/absent age: seeds only (REQ-5).

## Performance and resource bounds
- Random-tick dispatch is bounded by `selectEligible` (3 cells × ≤ 256 candidate attempts per
  section) over simulated sections only (REQ-4).
- `getBlockState`/`setBlockState` are O(1) map operations; the state overlay is bounded by the
  number of grown cells.
- Loot evaluation for wheat is O(pool count) with a single condition read.

## Compatibility and migration
- New ids `BlockId.Wheat = 34`, `ItemId.WheatSeeds = 32`, `ItemId.Wheat = 33` are additive.
- `LootContext.properties` and the access `getBlockState`/`setBlockState` methods are optional
  and additive; existing tables, conditions, implementers, mocks, and saves are unaffected.
- No persistent snapshot/serialization format change; crop age is not persisted across a page
  reload (deferred storage concern, documented in the design).

## Security and integrity
- Crop growth only ever writes legal `age` values in `[0, 7]`; the state registry rejects any
  out-of-domain assignment, so growth cannot corrupt block-state storage.
- Drops are produced by validated loot tables referencing registered items only.

## Observability
- Wheat states are inspectable via `BlockState.debugString()` (`minecraft:wheat[age=n]`).
- `World.getBlockState` exposes the live age of any world cell for debugging.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 | `WorldBlockState.test.ts` 8-state enumeration; `BlockStateRegistry.test.ts` update |
| REQ-2 | `CropGrowth.test.ts` nextCropAge/isMature |
| REQ-3 | `CropBehavior.test.ts` fake-access increment to 7, malformed, missing capability |
| REQ-4 | `CropRandomTick.test.ts`; `Game.ts` dispatch wiring |
| REQ-5 | `WheatLoot.test.ts` immature/mature/absent age |
| REQ-6 | `PlayerInteraction.ts` `finishBreak` properties; e2e regression |
| REQ-7 | `WorldBlockState.test.ts` round-trip / default / stale-clear |
