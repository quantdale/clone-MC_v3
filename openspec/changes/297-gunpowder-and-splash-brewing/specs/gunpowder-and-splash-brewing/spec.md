# Spec: gunpowder-and-splash-brewing

## Contract

Gunpowder is a real item that live raid witches drop according to the vanilla witch
table. Brewing any NORMAL potion with gunpowder in the brewing stand produces the
SPLASH variant of the same `potion_contents` (base and effects unchanged). A
survival player can therefore obtain, brew and throw a splash potion without seams,
apart from the potion base, which is covered by the 260 bottle seam.

## Definitions

- **Witch table**: `uniformInt(1,3)` rolls. Each roll is a weighted pick over
  glowstone_dust, sugar, redstone, spider_eye, glass_bottle and gunpowder
  (weight 1 each) and stick (weight 2). The count is `uniformInt(0,2)` plus
  `uniformInt(0, looting)`.
- **Creeper table**: gunpowder `uniformInt(0,2) + uniformInt(0, looting)`.
- **Missing item**: an entry whose `minecraft:<key>` is not in the item registry.
  It is rolled and discarded.

## Invariants

- Adding gunpowder does not move or repaint any existing atlas tile, and the
  default inventories do not contain gunpowder, so the visual goldens are
  unaffected.
- A witch death drops loot exactly once, at the witch's position, and only when
  the death is consumed by the raid.
- The brewing fuel/time rules are unchanged. A brew never changes a bottle's
  kind except through the gunpowder recipe.
- `testGrantSplashPotion` is a test-only seam and is not reachable from gameplay.

## Requirements

### Requirement: Gunpowder item

The item registry SHALL define `gunpowder` (legacy id 73, `minecraft:gunpowder`,
stack 64, icon tile 75, not placeable, not food).

#### Scenario: Registry lookup

- **WHEN** `getByKey('gunpowder')` is called
- **THEN** it returns id 73, stack size 64, icon tile 75, and no `placeBlock`

#### Scenario: Icon isolation

- **THEN** `TILE_INDEX.gunpowder` is 75 and no other `TILE_INDEX` entry uses 75

### Requirement: Vanilla drop tables

The system SHALL resolve creeper and witch gunpowder drops with the vanilla
distributions and a fixed RNG draw order.

#### Scenario: Creeper 0–2

- **GIVEN** an rng returning 0, 0.5 and 0.99 in separate calls with looting 0
- **THEN** the gunpowder counts are 0, 1 and 2 respectively, and 0 produces no stack

#### Scenario: Looting adds up to its level

- **GIVEN** a creeper with looting 3 and an rng of 0.99
- **THEN** the count is 2 + 3 = 5

#### Scenario: Witch gunpowder roll

- **GIVEN** a scripted rng that selects 1 roll, the gunpowder weight slot and a count of 2
- **THEN** the witch drops exactly 2 gunpowder

#### Scenario: Missing items are discarded, not re-rolled

- **GIVEN** a roll that lands on sugar (not in the registry)
- **THEN** no stack is emitted and the roll is reported as `missing-item`

#### Scenario: Ghast absent

- **THEN** resolving `ghast` (not present) returns no stacks

### Requirement: Live witch drops

Every raid-witch death path SHALL spawn the witch table as item entities at the
witch's position and record the result.

#### Scenario: Killed witch drops gunpowder

- **GIVEN** a scripted drop RNG that yields 2 gunpowder
- **WHEN** a raid witch dies through `damageRaider`
- **THEN** a gunpowder item entity of count 2 exists near the witch, and
  `getLastMobDrops().typeKey` is `witch`

#### Scenario: Non-witch raiders drop nothing

- **WHEN** a pillager dies
- **THEN** no mob drop is recorded

### Requirement: Splash brewing

The default brewing context SHALL convert a NORMAL potion plus gunpowder into
`{kind: 'SPLASH'}` with the base and effects preserved. It SHALL NOT match an
already SPLASH or LINGERING potion, and every other recipe SHALL keep the
bottle's kind.

#### Scenario: Speed potion becomes splash speed

- **GIVEN** a stand holding a NORMAL speed (480 s, amp 1) bottle, blaze powder
  and gunpowder
- **WHEN** 400 ticks run
- **THEN** the bottle is SPLASH speed 480 s amp 1 and one gunpowder is consumed

#### Scenario: Splash stays splash

- **GIVEN** a SPLASH awkward bottle and redstone
- **WHEN** the brew completes
- **THEN** the bottle is SPLASH speed 480 s amp 1

#### Scenario: No double splash

- **GIVEN** a SPLASH bottle and gunpowder
- **THEN** there is no brew and no fuel is lit

#### Scenario: Persistence

- **WHEN** a brewing state holding a brewed SPLASH bottle is serialized and deserialized
- **THEN** the kind and effects are identical

### Requirement: Test seams

`testGrantSplashPotion`, `debugSetMobDropRandomSequence` and `getLastMobDrops`
SHALL be test/debug-only seams that do not change gameplay unless they are called.

#### Scenario: Invalid scripted RNG refused

- **WHEN** `debugSetMobDropRandomSequence([1.5])` is called
- **THEN** it returns false and the RNG is unchanged
