# Spec: bonemeal-growth-hooks

## Contract
This capability adds the first fertilization interaction: a **Bone Meal** inventory item
(`ItemId.BoneMeal = 34`) and a registry-backed **fertilization interface** that, when the player
uses bone meal on a fertilizable block, advances that block's growth deterministically. The first
fertilizable crop is **Wheat**: using bone meal advances the wheat `age` state by a fixed,
documented step (clamped to maturity). The interface is a pure, unit-testable registry
(`FertilizerRegistry`) mapping block id to a growth function, so future fertilizable blocks
(saplings/trees in a later change) can be added additively.

Full sapling/tree bonemeal generation is explicitly **out of scope** for this change: there is no
Sapling block or sapling growth-stage state in the current block catalog (verified against
`src/world/BlockRegistry.ts`), and wiring a new sapling block + item + tree generator is content
work better suited to a later content change. This change only documents that deferral and keeps
the interface extensible so it can be added without a persistence or interface change.

## Definitions
- **Bone Meal**: an inventory item, `ItemId.BoneMeal = 34`, resource id `minecraft:bone_meal`,
  key `bone_meal`, stack size 64, with no `placeBlock` (not placeable), not food, not a tool.
- **Fertilizable block**: a block for which a growth function is registered in a
  `FertilizerRegistry` (here, `minecraft:wheat`).
- **Fertilization interface**: `applyBonemeal(world, x, y, z, registry?)` which inspects the block
  at `(x, y, z)` and, if fertilizable, advances its growth through `world.setBlockState`, returning
  `true` when growth was applied and `false` otherwise. Deterministic for wheat (the optional `rng`
  is intentionally ignored for the registered wheat rule; it is kept in the interface only as a
  parity-style future seam).
- **Wheat growth rule**: `bonemealNextAge(age)` returns `min(MAX_AGE, age + WHEAT_GROW_STEP)` with
  `WHEAT_GROW_STEP = 2`; this is the one canonical bonemeal step, distinct from the random-tick
  `+1` step (`nextCropAge`) so bonemeal visibly accelerates growth.
- **Use interaction**: the existing `InteractionAction 'use'` (120) emitted by `PlayerInteraction`
  when the player right-clicks while the selected item is bone meal and a block is under the
  crosshair.

## Invariants
- `WHEAT_GROW_STEP === 2`; `bonemealNextAge(age)` never returns outside `[0, MAX_AGE]`.
- Non-integer or negative `age` normalizes to `0`; a throwing/malformed state read results in no
  write and no throw.
- `applyBonemeal` returns `false` (no write) for: air, blocks without a registered fertilizer, a
  mature wheat block, a wheat block whose access lacks `getBlockState`/`setBlockState`, or a wheat
  block whose state read throws.
- A bone meal item is consumed exactly once per successful fertilization; a failed or no-op
  fertilization consumes no bone meal.
- Bone meal has no block placement, food, tool, or enchantment metadata.
- Adding bone meal is additive: it introduces no new block id, no block-state enumeration change,
  and no persistent snapshot/serialization format change.

## Requirements

### Requirement: bone meal is a registered, non-placeable inventory item
`ItemId.BoneMeal` MUST equal `34`. `createDefaultItemRegistry()` MUST include a definition with
`id === 34`, resource id `minecraft:bone_meal`, key `bone_meal`, `stackSize === 64`, and MUST NOT
declare `placeBlock`, `isFood`, `toolKind`, `maxDurability`, `foodHunger`, `foodSaturation`, or
`enchantability`. The registry MUST resolve `getByLegacyId(34)`, `getByKey('bone_meal')`, and
`getByResourceId(minecraft:bone_meal)` to the same definition, and `has(34)` MUST be `true`.

#### Scenario: bone meal resolves by id, key, and resource id
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** it is queried via `getByLegacyId(ItemId.BoneMeal)`, `getByKey('bone_meal')`, and
  `getByResourceId(minecraft:bone_meal)`
- **THEN** all three resolve to one definition with `id === 34` and `stackSize === 64`
- **AND** `placeBlock`, `isFood`, `toolKind`, `maxDurability`, `foodHunger`, `foodSaturation`, and
  `enchantability` are all `undefined`

### Requirement: the fertilization interface applies growth or reports no-op
`applyBonemeal(world, x, y, z, registry?)` MUST look up the block id at `(x, y, z)` in the registry
(defaulting to `createDefaultFertilizerRegistry()` when none is supplied), and if a growth function
is registered, MUST invoke it and return its boolean result. When no function is registered (air,
unfertilizable blocks), it MUST return `false` and MUST NOT write. It MUST NOT throw on a malformed
state read.

#### Scenario: fertilizable wheat is grown
- **GIVEN** a fake `BlockWorldAccess` holding wheat at `age = 1` at `(5, 6, 7)`
- **WHEN** `applyBonemeal(world, 5, 6, 7)` is called
- **THEN** it returns `true`, and the recorded age at `(5, 6, 7)` is `3`

#### Scenario: air and unfertilizable blocks are no-ops
- **GIVEN** a fake access holding air at `(1, 1, 1)` and stone at `(2, 1, 1)`
- **WHEN** `applyBonemeal(world, 1, 1, 1)` and `applyBonemeal(world, 2, 1, 1)` are called
- **THEN** both return `false` and no state write is recorded

### Requirement: wheat bonemeal advances a fixed, clamped growth step
`bonemealNextAge(age)` MUST return `0` for non-integer or negative input, and
`min(MAX_AGE, age + WHEAT_GROW_STEP)` for integer `age >= 0`. `fertilizeWheat(world, x, y, z)`
MUST be the registered wheat growth function: it returns `false` when the cell is not wheat, when
the wheat is mature (`age >= MAX_AGE`), or when the access lacks state capability or its read
throws; otherwise it MUST write `{ age: bonemealNextAge(age) }` via `world.setBlockState` and
return `true`. It MUST ignore any optional `rng`.

#### Scenario: matures in a bounded number of uses
- **GIVEN** a fake access holding wheat at `age = 0`
- **WHEN** `applyBonemeal` is called repeatedly until it returns `false`
- **THEN** the ages progress `0 -> 2 -> 4 -> 6 -> 7`, and the first `false` return occurs at age 7
  (exactly 4 successful uses, deterministic)

#### Scenario: mature wheat is a no-op
- **GIVEN** a fake access holding wheat at `age = 7`
- **WHEN** `applyBonemeal(world, x, y, z)` is called
- **THEN** it returns `false` and no write is recorded

#### Scenario: non-wheat and capability-less access are safe no-ops
- **GIVEN** a fake access holding stone, and separately a `BlockWorldAccess` that implements only
  `getBlockId`/`setBlockId`
- **WHEN** `applyBonemeal` is called on the stone cell and on a wheat cell through the
  capability-less access
- **THEN** both return `false` and neither throws

### Requirement: using bone meal targets the crosshair block and consumes only on success
`PlayerInteraction` MUST emit the `'use'` action (blocking placement) when the selected item is
`ItemId.BoneMeal` and the player triggers a right-click with a target under the crosshair. The
consumption path (`bonemealTarget`) MUST call `applyBonemeal` at the targeted cell; when it returns
`true` it MUST invoke the supplied `consume()` callback exactly once, and when it returns `false`
it MUST NOT invoke `consume()`.

#### Scenario: player interaction emits use for bone meal
- **GIVEN** a `PlayerInteraction` whose selector reports `getSelectedItemId() === ItemId.BoneMeal`,
  a target block under the crosshair, and a right-click (`consumePlace() -> true`)
- **WHEN** `update` is called
- **THEN** the `onAction` callback receives `'use'` and no block is placed

#### Scenario: consume happens only when growth is applied
- **GIVEN** `bonemealTarget(world, x, y, z, consume, registry)` with wheat at `(x, y, z)` `age = 3`
- **WHEN** it is called
- **THEN** it returns `true` and `consume` is called exactly once
- **AND** with wheat at `age = 7`, it returns `false` and `consume` is not called

### Requirement: the fertilizer registry validates registrations and is extensible
`FertilizerRegistry.register(blockId, fn)` MUST throw on a non-integer/negative block id, a
non-function `fn`, or a duplicate block id. `get(blockId)` MUST return `undefined` for unregistered
ids. `createDefaultFertilizerRegistry()` MUST register exactly the wheat rule (and nothing else).
Adding a future fertilizer (e.g. sapling) MUST require only a new `register` call, with no change to
`applyBonemeal`'s signature or the item's persistence.

#### Scenario: duplicate registration is rejected
- **GIVEN** a `FertilizerRegistry`
- **WHEN** `register(BlockId.Wheat, fn)` is called twice for the same id
- **THEN** the second call throws

#### Scenario: an unregistered block id resolves to no fertilizer
- **GIVEN** a `FertilizerRegistry` with only wheat registered
- **WHEN** `get(BlockId.Farmland)` is queried
- **THEN** it returns `undefined`

## Error and failure behavior
- Malformed/non-numeric or negative `age`: `bonemealNextAge` returns `0`; no throw.
- Throwing `getBlockState`: `fertilizeWheat`/`applyBonemeal` catch and return `false`, no write.
- Access without `getBlockState`/`setBlockState`: returns `false`, no write, no throw.
- `FertilizerRegistry.register` with an invalid id, non-function, or duplicate: throws a descriptive
  `Error`; no partial registration is inserted.
- No targeted block (empty crosshair): `PlayerInteraction` does not emit `'use'`; `Game.useBonemeal`
  returns without consuming.

## Performance and resource bounds
- `applyBonemeal` is O(1): one `getBlockId`, one `getBlockState`, one optional `setBlockState`, and
  one map lookup. It is invoked only on a player right-click (not a per-frame or per-tick hot path).
- `FertilizerRegistry` uses a `Map`, so `get`/`has` are O(1); the default registry has exactly one
  entry.
- No new per-frame/per-tick work is added.

## Compatibility and migration
- New item id `ItemId.BoneMeal = 34` is additive; existing item ids 0..33 and all block ids are
  unchanged. The item shares its numeric id 34 with `BlockId.Wheat`, consistent with existing shared
  ids (32, 33) — the item and block registries remain independent.
- No block id, block-state, or state-enumeration change; `createDefaultBlockStateRegistry` size is
  unchanged.
- `BlockItemSeparation.test.ts` preserved-id table updates row `[34, 'wheat', null]` to
  `[34, 'wheat', 'bone_meal']`.
- No persistent snapshot/serialization format change; bone meal is a normal inventory item and no
  new persisted field is added. No migration is required.

## Security and integrity
- Wheat growth only ever writes legal `age` values in `[0, 7]`; the block-state registry rejects any
  out-of-domain assignment, so bonemeal cannot corrupt block-state storage.
- Bone meal has no `placeBlock`, so it can never be placed as a block.
- `bonemealTarget` consumes the item only on a confirmed successful fertilization, preventing item
  loss on no-op targets.

## Observability
- Wheat growth via bonemeal is inspectable through `World.getBlockState` (`age` value) and
  `BlockState.debugString()` (`minecraft:wheat[age=n]`).
- `applyBonemeal`'s boolean return lets callers (and tests) distinguish applied vs no-op
  fertilization.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 | `tests/unit/Bonemeal.test.ts` item-definition assertions; `BlockItemSeparation.test.ts` table |
| REQ-2 | `tests/unit/Bonemeal.test.ts` `applyBonemeal` grow / no-op |
| REQ-3 | `tests/unit/Bonemeal.test.ts` `bonemealNextAge`, `fertilizeWheat`, 0->7 progression, mature no-op |
| REQ-4 | `tests/unit/Bonemeal.test.ts` `bonemealTarget`; `tests/unit/PlayerInteraction.test.ts` `'use'` emission |
| REQ-5 | `tests/unit/Bonemeal.test.ts` registry validation + default composition |
