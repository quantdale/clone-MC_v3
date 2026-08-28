# Spec: core-progression-advancements

## Contract
This capability adds the first advancement catalog over 185's framework: a 7-advancement chain
covering survival → Nether → End progression, in play order, with only 185's typed criteria and
definition-data rewards.

## Definitions
- **Chain**: the ordered list `stone_age → acquire_hardware → iron_tools → diamonds →
  enter_the_nether → enter_the_end → free_the_end`.

## Invariants
- The chain order is exactly the list above.
- Every criterion has a non-empty string payload and a type from 185's union.
- `free_the_end` carries `{ kind: 'experience', amount: 500 }`; all others `{ kind: 'none' }`.
- Unknown-key lookups return `undefined`.

## Requirements

### Requirement: the chain covers survival-to-End progression in order
`coreProgressionAdvancements()` MUST return the 7 advancements in play order; the first criterion
MUST be an item obtain, the last an `boss_defeat` of the dragon, and the middle MUST include
`dimension_enter` for both `minecraft:the_nether` and `minecraft:the_end`.

#### Scenario: order and arc
- **GIVEN** the catalog
- **THEN** the keys are the chain order; `firstCoreProgressionAdvancement()` is `stone_age`,
  `finalCoreProgressionAdvancement()` is `free_the_end`, and both dimension keys appear among the
  `dimension_enter` criteria

### Requirement: criteria are valid typed data
Every criterion MUST use one of 185's typed union members with a non-empty payload key.

#### Scenario: payload validity
- **GIVEN** every advancement in the catalog
- **THEN** each criterion's payload string is non-empty

### Requirement: lookups work
`getCoreProgressionAdvancement(key)` MUST return the definition for a known key and `undefined` for
an unknown key.

#### Scenario: lookup
- **GIVEN** `minecraft:diamonds` and `minecraft:not_real`
- **THEN** the first returns the definition and the second `undefined`

### Requirement: rewards are vanilla-flavored data
`free_the_end` MUST carry `{ kind: 'experience', amount: 500 }`; the other six MUST carry
`{ kind: 'none' }`.

#### Scenario: rewards
- **GIVEN** the catalog
- **THEN** the reward shapes match

### Requirement: the chain completes through 185's framework
Firing the matching trigger for a catalog advancement MUST complete it with the tick recorded; a
wrong-key trigger MUST be an identity no-op.

#### Scenario: completion
- **GIVEN** `enter_the_nether` and `free_the_end`
- **THEN** the `dimension_enter(the_nether)` trigger completes the first at its tick; the
  `boss_defeat(ender_dragon)` trigger completes the second at its tick; the
  `dimension_enter(the_end)` trigger does not change `enter_the_nether` (identity)

## Error and failure behavior
- No throwing paths; unknown lookups are `undefined`.

## Performance and resource bounds
- Module-load constants; lookups O(7).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- No new untrusted-input surface.

## Observability
- The catalog is enumerable data.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 chain order/arc | `tests/unit/CoreProgressionAdvancements.test.ts` › catalog |
| REQ-2 criterion validity | › criterion validity |
| REQ-3 lookup | › lookup |
| REQ-4 rewards | › rewards |
| REQ-5 completion | › chain completes |
