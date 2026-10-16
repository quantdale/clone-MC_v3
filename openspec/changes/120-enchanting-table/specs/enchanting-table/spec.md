# Spec: enchanting-table

## Contract
The enchanting-table capability lets a player with XP levels and lapis lazuli
acquire enchantments on a held item via a deterministic, seed-driven offer
generator. The capability is the pure logic contract (`EnchantingTableSession`)
plus the data and the `use`-interaction hook; a rendered UI panel is a separate
presentation-layer change. All randomness is seeded so a given
(world seed, item, bookshelf count, player level) always yields identical offers.

## Definitions
- **bookshelf count**: integer in `[0,15]`, the effective number of bookshelves
  adjacent to the table (clamped by the interaction layer).
- **slotCost / power**: integer in `[1,255]` that drives how strong an offer is.
- **offer**: one of three costed enchantment proposals for the held item, each with
  `level` (displayed enchant level == cost), `xpLevels`, `lapis`, and `enchantments`.
- **enchantability**: per-item positive number biasing offer strength; `undefined` ⇒ 0.

## Invariants
- `bookShelves` is clamped to `[0,15]`.
- `slotCost` returns an integer in `[1,255]`.
- Every `EnchantmentInstance` produced by `generateEnchantments` MUST be applicable
  to the item, have `level >= 1` and `level <= definition.maxLevel`, and be mutually
  non-conflicting.
- `enchantCosts(level)` returns `xpLevels == lapis == clamp(level, 1, 30)`.
- `apply` is atomic: XP + lapis are spent only when both are available; otherwise
  nothing is spent and `{ ok:false }` is returned.

## Requirements

### Requirement: data registration
The registry MUST contain `enchanting_table` and `bookshelf` blocks and
`lapis_lazuli`, `book`, and `bookshelf` items, and `ItemTypeDefinition` MUST carry
an optional `enchantability?: number`.

#### Scenario: new ids resolve
- **GIVEN** the default item and block registries are finalized
- **WHEN** code looks up `ItemId.LapisLazuli`, `ItemId.Book`, `ItemId.Bookshelf`,
  `BlockId.EnchantingTable`, `BlockId.Bookshelf`
- **THEN** each resolves to a defined `ItemTypeDefinition` / `BlockTypeDefinition`

#### Scenario: enchantability seeded
- **GIVEN** `WoodenPickaxe`, `StonePickaxe`, `WoodenAxe`, `Book`
- **THEN** each reports `enchantability > 0`

### Requirement: XP spending
`ExperienceSystem` MUST provide `spendLevels(n)` that removes `n` levels when
available and is a no-op on non-integer, negative, or exceeding-`level` input.

#### Scenario: spend reduces level
- **GIVEN** an `ExperienceSystem` at level 10
- **WHEN** `spendLevels(3)` is called
- **THEN** `level` becomes 7 and `xp`/`xpToNext` remain consistent

#### Scenario: spend guards
- **GIVEN** an `ExperienceSystem` at level 2
- **WHEN** `spendLevels(-1)`, `spendLevels(1.5)`, or `spendLevels(5)` is called
- **THEN** `level` is unchanged (no negative level, no partial spend)

### Requirement: cost generation
`slotCost(slot, enchantability, playerLevel, rng)` MUST return an integer in
`[1,255]`, and `generateEnchantments(itemDef, power, rng, registry)` MUST return
only applicable, in-range, non-conflicting instances.

#### Scenario: slotCost bounds
- **GIVEN** any `slot in {0,1,2}`, `enchantability >= 0`, `playerLevel >= 1`
- **WHEN** `slotCost` is computed across many seeds
- **THEN** every result is an integer within `[1,255]`

#### Scenario: enchantments valid
- **GIVEN** an enchantable item definition and a power value
- **WHEN** `generateEnchantments` runs
- **THEN** every returned instance is applicable, `level in [1,maxLevel]`, and no two
  are incompatible

#### Scenario: non-enchantable item
- **GIVEN** an item with `enchantability` undefined or 0
- **WHEN** `generateEnchantments` runs
- **THEN** it returns `[]`

### Requirement: offer costs
`enchantCosts(level)` MUST return `{ xpLevels, lapis }` where both equal
`clamp(level, 1, 30)`.

#### Scenario: cost cap
- **GIVEN** `level = 50`
- **WHEN** `enchantCosts` is called
- **THEN** `xpLevels == lapis == 30`

### Requirement: deterministic session
`createSession` MUST produce three offers that are identical for identical
(seed, item, bookshelf count, player level) inputs.

#### Scenario: determinism
- **GIVEN** two sessions built with the same inputs
- **WHEN** their `offers` are compared
- **THEN** they are deeply equal (same levels, costs, enchantments)

### Requirement: applying an offer
`session.apply(offerIndex, ctx)` MUST, when XP and lapis are sufficient, spend both
and return the enchanted stack; otherwise return `{ ok:false }` without spending.

#### Scenario: success spends and enchants
- **GIVEN** a session whose offer `i` costs 3 XP and 3 lapis, a `ctx` with
  `level >= 3` and `lapisAvailable >= 3`
- **WHEN** `apply(i, ctx)` is called
- **THEN** `ok:true`, `experience.level` dropped by 3, `lapisSpent == 3`, and `stack`
  carries the offer's enchantments

#### Scenario: insufficient xp
- **GIVEN** an offer costing 5 XP and a `ctx` at level 2
- **WHEN** `apply` is called
- **THEN** `{ ok:false, reason:'insufficient_xp' }` and nothing is spent

#### Scenario: bad index
- **GIVEN** any session
- **WHEN** `apply(99, ctx)` is called
- **THEN** `{ ok:false, reason:'bad_offer' }` and nothing is spent

### Requirement: table interaction
Right-clicking an `enchanting_table` MUST open a session for the held item with the
clamped nearby bookshelf count; non-table targets MUST NOT open a session.

#### Scenario: open on table
- **GIVEN** the player holds an enchantable item and targets an `enchanting_table`
- **WHEN** the `use` interaction fires
- **THEN** a session with 3 offers is opened for the held item

#### Scenario: ignore non-table
- **GIVEN** the player targets a non-table block
- **WHEN** the `use` interaction fires
- **THEN** no enchanting session is opened

## Error and failure behavior
See Invariants and the `apply` scenarios: bad index, insufficient resources, and
non-enchantable items are handled without throwing or spending.

## Performance and resource bounds
`createSession` and `generateEnchantments` are bounded by small constant factors;
no rendering or world-geometry work occurs in the pure core.

## Compatibility and migration
Additive data and optional field; `InventorySnapshot.version` stays `1`;
`ExperienceSystem.snapshot` shape unchanged.

## Security and integrity
`apply` is atomic and validates resources before spending; `setStackEnchantments`
re-validates the resulting list (119 guarantee), so an invalid enchant list can
never be written.

## Observability
`createSession` output is pure and printable; a debug overlay can list offers.

## Verification mapping
| Requirement | Test |
|---|---|
| data registration | `ItemRegistry.test.ts` / `BlockRegistry.test.ts` |
| XP spending | `ExperienceSystem.test.ts` |
| cost generation | `EnchantingTable.test.ts` |
| offer costs | `EnchantingTable.test.ts` |
| deterministic session | `EnchantingTable.test.ts` |
| applying an offer | `EnchantingTable.test.ts` |
| table interaction | `PlayerInteraction.test.ts` / `Game` logic test |
