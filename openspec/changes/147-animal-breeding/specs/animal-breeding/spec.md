# Spec: animal-breeding

## Contract
This capability adds the animal-breeding state machine — love mode, breeding cooldown, in-range
pair matching, and child spawning — operating on an existing entity population (145's pig set),
without a new entity id-space. No player-initiated feeding interaction, no inventory-item
consumption, no baby-growth/ageing, no love-mode visuals — see the proposal's Non-goals.

## Definitions
- **Love mode**: the state an entity enters after a successful `feed()`, lasting
  `LOVE_MODE_DURATION_TICKS` ticks from the tick it was fed.
- **Breeding cooldown**: the state an entity enters immediately after breeding, lasting
  `BREEDING_COOLDOWN_TICKS` ticks, during which `feed()` cannot re-enter love mode for it.
- **Breeding pair**: two same-species entities both currently in love and within `BREEDING_RANGE`
  of each other.
- **Population cap**: the caller-supplied maximum live count of the species; `BreedingSystem.tick`
  never spawns a child that would exceed it.

## Invariants
- `feed(id, itemId, species, currentTick)` only enters love mode when `itemId ===
  species.breedingFoodItemId` and `id` is not on cooldown; any other input leaves love/cooldown
  state for `id` unchanged and returns `false`.
- `completeBreeding(id, currentTick)` always clears love mode and starts a cooldown for `id`.
- `findBreedingPair` only returns pairs where both entities are of `species.typeId`, both are
  currently in love, and their distance is `<= range`.
- `BreedingSystem.tick` spawns at most one child per call and only when population is strictly
  below the supplied cap.

## Requirements

### Requirement: feed enters love mode only for the correct food and off cooldown
`LoveStateTracker.feed` MUST return `true` and place the entity in love mode (for
`LOVE_MODE_DURATION_TICKS` ticks) only when the supplied `itemId` matches the species' breeding
food and the entity is not currently on cooldown. It MUST return `false` and leave state
unchanged for a wrong-food item or an on-cooldown entity.

#### Scenario: correct food, no cooldown, enters love mode
- **GIVEN** an entity with no prior love/cooldown state and a species whose breeding food is item
  `W`
- **WHEN** `feed(id, W, species, tick)` is called
- **THEN** it returns `true`, and `isInLove(id, tick)` is `true`

#### Scenario: wrong food is rejected
- **GIVEN** the same entity/species as above
- **WHEN** `feed(id, otherItem, species, tick)` is called with `otherItem !== W`
- **THEN** it returns `false`, and `isInLove(id, tick)` remains `false`

#### Scenario: an on-cooldown entity cannot be fed
- **GIVEN** an entity for which `completeBreeding` was just called at `tick`
- **WHEN** `feed(id, W, species, tick + 1)` is called (still within the cooldown window)
- **THEN** it returns `false`, and `isInLove(id, tick + 1)` remains `false`

### Requirement: completeBreeding clears love and starts a cooldown
`completeBreeding(id, currentTick)` MUST clear the entity's love mode and start a
`BREEDING_COOLDOWN_TICKS`-long cooldown from `currentTick`.

#### Scenario: breeding clears love and blocks immediate re-feeding
- **GIVEN** an entity currently in love
- **WHEN** `completeBreeding(id, tick)` is called, then `feed(id, W, species, tick + 1)` is called
- **THEN** `isInLove` is `false` immediately after `completeBreeding`, and the subsequent `feed`
  call returns `false`

### Requirement: findBreedingPair matches only in-love, same-species, in-range entities
`findBreedingPair` MUST return a pair only when both entities are of the given species, both are
currently in love, and their distance is within `range`; otherwise it MUST return `null`.

#### Scenario: two in-love entities within range are matched
- **GIVEN** two same-species entities, both in love, positioned within `range` of each other
- **WHEN** `findBreedingPair` is called
- **THEN** it returns that pair

#### Scenario: an out-of-range in-love pair is not matched
- **GIVEN** two same-species entities, both in love, positioned farther than `range` apart
- **WHEN** `findBreedingPair` is called
- **THEN** it returns `null`

#### Scenario: an entity that is not in love is excluded
- **GIVEN** one in-love entity and one same-species entity that was never fed, close together
- **WHEN** `findBreedingPair` is called
- **THEN** it returns `null`

#### Scenario: a different-species entity is excluded even if in love
- **GIVEN** one in-love entity of the target species and one in-love entity of a different species,
  close together
- **WHEN** `findBreedingPair` is called for the target species
- **THEN** it returns `null`

### Requirement: BreedingSystem.tick spawns exactly one child for an eligible pair and completes breeding
`BreedingSystem.tick` MUST spawn exactly one new entity of the species via `EntityManager.spawn`
when an eligible breeding pair exists and the population is below the cap, and MUST complete
breeding (clear love, start cooldown) for both parents in that same call.

#### Scenario: an eligible pair breeds
- **GIVEN** two fed, in-range pigs and a population below the cap
- **WHEN** `tick` is called
- **THEN** it returns `1`, a new pig now exists in the manager, and both parents are no longer in
  love

#### Scenario: no eligible pair spawns nothing
- **GIVEN** no entity currently in love
- **WHEN** `tick` is called
- **THEN** it returns `0` and no new entity is spawned

### Requirement: BreedingSystem.tick never exceeds the population cap
`BreedingSystem.tick` MUST NOT spawn a child when the supplied entity list's length is already at
or above `populationCap`, regardless of an eligible pair being present, and MUST leave that pair's
love/cooldown state unchanged.

#### Scenario: an eligible pair at the cap does not breed
- **GIVEN** two fed, in-range pigs and a population already at `populationCap`
- **WHEN** `tick` is called
- **THEN** it returns `0`, no new entity is spawned, and both parents remain in love afterward

## Error and failure behavior
- No function/method in this module throws for well-formed inputs.

## Performance and resource bounds
- `findBreedingPair` is O(n^2) over the in-love subset only; `BreedingSystem.tick` overall is
  bounded by the live population size.

## Compatibility and migration
- One new, additive file; one `Game.ts` edit adding construction and one per-frame call site, no
  existing signature changes. No schema/save-format change; breeding state is session-only.

## Security and integrity
- All inputs are caller-supplied numeric ids/positions from already-validated entity/registry
  data; no new untrusted input surface.

## Observability
- No new debug hook; a bred child is observable via `PassiveMobSystem.getActivePigs()` (145) like
  any other pig.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 feed correct-food/cooldown gating | `tests/unit/AnimalBreeding.test.ts` feed cases |
| REQ-2 completeBreeding clears love + starts cooldown | `tests/unit/AnimalBreeding.test.ts` completeBreeding cases |
| REQ-3 findBreedingPair species/love/range filtering | `tests/unit/AnimalBreeding.test.ts` findBreedingPair cases |
| REQ-4 BreedingSystem.tick spawns + completes breeding | `tests/unit/AnimalBreeding.test.ts` tick spawn cases |
| REQ-5 BreedingSystem.tick population-cap gating | `tests/unit/AnimalBreeding.test.ts` tick cap case |
