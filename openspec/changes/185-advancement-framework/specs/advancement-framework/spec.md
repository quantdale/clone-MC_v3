# Spec: advancement-framework

## Contract
This capability adds the meta-progression core: typed criteria/triggers, immutable per-advancement
progress, completion when the last criterion fires, rewards as definition data, and versioned,
validated persistence. 184's boss-completion record is a first-class trigger source.

## Definitions
- **Criterion**: one of `kill_mob`/`obtain_item`/`dimension_enter`/`boss_defeat` with a key payload.
- **Trigger**: the same type as a criterion; matching requires equal type AND equal payload key.
- **Reward**: definition data (`none`/`experience`/`item`); granting is wiring.

## Invariants
- `applyAdvancementTrigger` flips exactly the first matching unachieved criterion; completion
  happens only when ALL criteria are achieved, recording the tick.
- A non-matching trigger or an achieved advancement returns the identical object.
- `advancementCriteriaRemaining` = criteria.length − achieved count.
- `deserializeAdvancementProgress` validates every field before accepting.

## Requirements

### Requirement: fresh progress is unachieved
`createAdvancementProgress(def)` MUST return unachieved progress with no criteria met and
`advancementCriteriaRemaining` equal to the criteria count.

#### Scenario: fresh progress
- **GIVEN** an advancement with two criteria
- **THEN** `achieved` is false, `achievedTick` is null, `criteriaAchieved` is `[false, false]`, and
  remaining is 2

### Requirement: triggers mark exactly the matching criterion
`applyAdvancementTrigger` MUST flip the first unachieved criterion whose type and payload key match
the trigger, and MUST leave everything else unchanged.

#### Scenario: matching and non-matching
- **GIVEN** a trigger matching the second criterion, then a non-matching trigger
- **THEN** only the second criterion flips (remaining 1); the non-matching trigger returns the
  identical object

### Requirement: completion happens at the last criterion
When the final unachieved criterion fires, the advancement MUST achieve with the observed tick, and
further triggers MUST be identity no-ops.

#### Scenario: completion
- **GIVEN** two criteria, both fired in order at ticks 100 and 5000
- **THEN** `achieved` is true, `achievedTick` is 5000, remaining is 0, and a further trigger returns
  the same object

### Requirement: 184's completion drives the boss_defeat trigger
A `boss_defeat` criterion MUST complete when triggered with the boss key from 184's
`markDragonDefeated` record.

#### Scenario: integration
- **GIVEN** a defeated dragon record (tick 5000) and an advancement whose criteria are
  `dimension_enter(the_end)` and `boss_defeat(ender_dragon)`
- **THEN** firing both triggers completes the advancement at tick 5000

### Requirement: persistence is versioned and validated
`serializeAdvancementProgress` MUST produce the versioned shape; `deserializeAdvancementProgress`
MUST round-trip it and MUST throw for null/non-object input, a wrong version, an empty key, a
non-boolean `achieved`, a negative/non-integer `achievedTick`, or a non-boolean `criteriaAchieved`
array.

#### Scenario: round-trip and rejection
- **GIVEN** a partially-completed progress and six malformed payload classes
- **THEN** the round-trip equals the progress; every malformed payload throws

## Error and failure behavior
- Deserialization throws on malformed input; all other functions are total.

## Performance and resource bounds
- Trigger application O(criteria).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; new additive versioned shape.

## Security and integrity
- Deserialization never accepts a partially-valid record.

## Observability
- `advancementIsComplete`/`advancementCriteriaRemaining` are explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 fresh progress | `tests/unit/AdvancementFramework.test.ts` › lifecycle |
| REQ-2 matching/non-matching triggers | › lifecycle |
| REQ-3 completion | › lifecycle |
| REQ-4 184 integration | › integration |
| REQ-5 persistence | › persistence |
