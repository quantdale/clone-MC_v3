# Spec: glass-bottles-and-drinkable-potions

## Contract

A survival player can get glass bottles, fill them with water, brew the water
bottle into an awkward potion and onward in a real brewing stand, and drink the
resulting normal potion to receive its effects and an empty bottle back. No
test seam is needed apart from the nether wart itself, which has no survival
source because there is no Nether.

## Definitions

- **Water bottle**: `potion` item with `potion_contents { base:
  'minecraft:potion/water', kind: 'NORMAL', customEffects: [] }`.
- **Base-only potion**: `potion_contents` with an empty `customEffects` and a
  non-empty `base`.
- **Drinkable potion**: a non-empty `potion` stack whose contents kind is
  NORMAL.
- **Depleting mode**: survival or adventure (265 `depletesItems`).

## Invariants

- Adding the glass bottle does not move or repaint any existing atlas tile.
  Visual goldens change only under the D2 experiment rule (the 6
  `container-ui` cells, and only if the diff is solely the new recipe row).
- Contents with neither effects nor a base stay invalid.
- A cancelled drink changes nothing. A completed drink applies its effects
  exactly once.
- Every fill and drink completion is followed by a durable player save.

## Requirements

### Requirement: Glass bottle item

The item registry SHALL define `glass_bottle` (legacy id 74,
`minecraft:glass_bottle`, stack 64, icon tile 76, not placeable, not food).

#### Scenario: Registry lookup

- **WHEN** `getByKey('glass_bottle')` is called
- **THEN** it returns id 74, stack size 64, icon tile 76 and no placement

#### Scenario: Witch drops bottles

- **WHEN** a raid witch dies and the drop roll lands on the glass_bottle entry
- **THEN** real glass bottle item entities are spawned (no longer discarded)

### Requirement: Crafting recipe gated by golden isolation

The `glass ×3 → glass_bottle ×3` recipe SHALL be added only if the controlled
`container-ui` experiment shows that the only changed region is the new
recipe row. Otherwise it SHALL NOT be added, and the gap SHALL be documented
with evidence.

#### Scenario: Summary line change

- **WHEN** the experiment shows changes outside the new recipe row (e.g. the
  ingredient summary line)
- **THEN** no recipe is added, no golden is re-pinned, and verification records
  the crops/diff

### Requirement: Fill bottle from water

Using a glass bottle while the first non-air cell along the view ray within
reach is water SHALL produce a water bottle.

#### Scenario: Survival fill

- **WHEN** a survival player right-clicks water holding 2 glass bottles
- **THEN** one bottle is consumed, one water bottle is added, and the player
  is saved durably

#### Scenario: Last bottle

- **WHEN** the held stack is a single glass bottle
- **THEN** the slot becomes the water bottle

#### Scenario: Creative fill

- **WHEN** a creative player fills
- **THEN** the bottle count is unchanged, and a water bottle is added only if
  none is already held

#### Scenario: Refusals

- **WHEN** the player is a spectator, the ray hits a solid block first, the
  water is beyond reach, or there is no room for the water bottle while
  bottles remain
- **THEN** nothing changes

### Requirement: Base-only potions and brewing

`potion_contents` SHALL accept empty `customEffects` iff `base` is a non-empty
string. Brewing a water bottle with nether wart SHALL complete to an awkward
potion.

#### Scenario: Water to awkward

- **WHEN** a water bottle and nether wart brew for 400 ticks with fuel
- **THEN** the bottle holds `{base: 'minecraft:potion/awkward', NORMAL, []}`,
  one wart is consumed, and further redstone brewing yields speed 480/1

#### Scenario: Still invalid

- **WHEN** contents have no base and no effects
- **THEN** creation throws and the read guard rejects

### Requirement: Drinking

Holding use on a drinkable potion SHALL drink it after 32 fixed ticks.

#### Scenario: Survival drink

- **WHEN** a survival player holds right-click on a NORMAL speed potion for
  32 ticks
- **THEN** the player gets speed at the full duration and amplifier, the slot
  holds one glass bottle, and the player is saved durably

#### Scenario: Instant effects

- **WHEN** the drunk potion carries instant health or harming at amplifier a
- **THEN** it heals `4 << a` or deals `6 << a` magic damage immediately on completion

#### Scenario: Cancel

- **WHEN** use is released, the slot changes or the stack changes before 32 ticks
- **THEN** no effect is applied and the potion remains

#### Scenario: Creative

- **WHEN** a creative player finishes drinking
- **THEN** the effects apply, the potion stays, and no bottle is given

#### Scenario: Spectator and splash

- **WHEN** a spectator uses a potion, or the potion is SPLASH
- **THEN** no drink starts (splash keeps the 295 throw)

#### Scenario: Water bottle

- **WHEN** a water bottle is drunk in survival
- **THEN** no effect is applied and a glass bottle is returned

### Requirement: Milk

Milk SHALL NOT be implemented while no milk item exists. The gap SHALL be
documented.
