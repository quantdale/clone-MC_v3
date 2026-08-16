# Spec: gamerule-framework

## Contract
This capability adds the rules layer: a typed gamerule registry (9 vanilla rules over
boolean/integer/string kinds), immutable per-world state with kind-validated set, a text parser for
commands, and versioned, validated persistence.

## Definitions
- **Rule**: `{ key, kind, defaultValue }`; the 9 keys include `doDaylightCycle`, `doMobSpawning`,
  `keepInventory`, `mobGriefing`, `doWeatherCycle`, `doFireTick`, `doImmediateRespawn`,
  `randomTickSpeed` (3), `spawnRadius` (10).
- **Store**: an immutable record over exactly those keys.

## Invariants
- `setGameRule` returns a NEW store only for a legal value of the rule's kind; otherwise the
  identical store.
- `parseGameRuleValue` is case-insensitive for booleans, strict-integer for integers, verbatim for
  strings; `null` on failure or unknown key.
- `deserializeGameRules` validates version, the exact known-key set, and each value's kind.

## Requirements

### Requirement: the registry carries vanilla rules
`gameRuleDefinitions()` MUST return the 9 rules with their kinds and defaults; `gameRuleDefinition`
MUST return the definition or `undefined`.

#### Scenario: registry
- **GIVEN** the framework
- **THEN** `doDaylightCycle` is boolean true, `keepInventory` boolean false, `randomTickSpeed`
  integer 3, `spawnRadius` integer 10, and an unknown key yields `undefined`

### Requirement: the default store is all defaults
`createDefaultGameRules()` MUST return a store with every rule at its default.

#### Scenario: defaults
- **GIVEN** `createDefaultGameRules()`
- **THEN** `doDaylightCycle` is true, `keepInventory` false, `mobGriefing` true, `randomTickSpeed` 3,
  `spawnRadius` 10

### Requirement: set is kind-validated and immutable
`setGameRule(store, key, value)` MUST return a NEW store for a legal value (original untouched) and
the IDENTICAL store for an illegal value or an unchanged value.

#### Scenario: set and no-ops
- **GIVEN** the default store
- **THEN** setting `keepInventory` true yields a new store with it true while the original stays
  false; setting `doDaylightCycle` to a string, `randomTickSpeed` to 1.5, or re-setting the same
  value are identity no-ops

### Requirement: text parsing is typed
`parseGameRuleValue(key, text)` MUST parse booleans case-insensitively (with trim), integers
strictly (including negatives; rejecting `1.5`/`abc`), strings verbatim, and return `null` for
failures or unknown keys.

#### Scenario: parsing
- **GIVEN** `'doDaylightCycle'` with `'true'`/`'FALSE'`/`'  True '`/`'yes'`; `'randomTickSpeed'`
  with `'3'`/`'-1'`/`'1.5'`/`'abc'`; an unknown key
- **THEN** the results are true/false/true/null; 3/−1/null/null; null

### Requirement: persistence is versioned and validated
`serializeGameRules` MUST produce the versioned shape; `deserializeGameRules` MUST round-trip it and
MUST throw for null/non-object input, a wrong version, a wrong-kind value, a payload missing known
keys, or an unknown key.

#### Scenario: round-trip and rejection
- **GIVEN** a store with changes and malformed payload classes
- **THEN** the round-trip equals the store; every malformed payload throws (unknown keys rejected
  explicitly once all known keys are present)

## Error and failure behavior
- Deserialization throws on malformed input; all other functions are total.

## Performance and resource bounds
- All operations O(rules) or O(1).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; new additive versioned shape.

## Security and integrity
- Deserialization never accepts a partially-valid store.

## Observability
- `gameRuleDefinitions`/`getGameRule` expose registry and state.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registry | `tests/unit/GameRuleFramework.test.ts` › registry |
| REQ-2 defaults | › registry |
| REQ-3 set/no-ops | › get/set |
| REQ-4 parsing | › parsing |
| REQ-5 persistence | › persistence |
