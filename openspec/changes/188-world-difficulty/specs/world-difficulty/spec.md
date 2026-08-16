# Spec: world-difficulty

## Contract
This capability adds the difficulty system: four typed levels with vanilla knobs (hostile spawns,
mob→player damage multiplier, hunger depletion multiplier, starvation), pure accessors, a
case-insensitive text parser, and versioned, validated persistence.

## Definitions
- **Levels**: `peaceful`, `easy`, `normal`, `hard`; default `normal`.
- **Knobs**: `hostileSpawns`, `hostileDamageMultiplier`, `hungerDepletionMultiplier`, `canStarve`.

## Invariants
- Peaceful: no hostile spawns, 0/0 multipliers, cannot starve.
- Easy/normal/hard: hostile spawns and starvation allowed; multipliers 0.5/1/1.5 and 0.5/1/1.5.
- `parseDifficultyLevel` trims and lowercases; unknown or null input yields `null`.
- `deserializeDifficulty` rejects wrong versions and unknown levels.

## Requirements

### Requirement: the four levels carry vanilla knobs
`difficultyDefinition(level)` MUST return the frozen definition with the exact knobs above.

#### Scenario: definitions
- **GIVEN** each level
- **THEN** peaceful is `{ hostileSpawns: false, hostileDamageMultiplier: 0, hungerDepletionMultiplier: 0, canStarve: false }`; easy/normal/hard match the 0.5/1/1.5 tables with spawns and starvation true

### Requirement: accessors read the table
The four accessor functions MUST return the table values per level.

#### Scenario: accessors
- **GIVEN** `peaceful` and `hard`
- **THEN** spawns are false/true, damage multipliers 0/1.5, hunger multipliers 0/1.5, starvation false/true

### Requirement: parsing is tolerant and total
`parseDifficultyLevel(text)` MUST return the level for trimmed case-insensitive text and `null` for
anything else (including null input).

#### Scenario: parsing
- **GIVEN** `'easy'`, `'  HARD '`, `'Normal'`, `'PEACEFUL'`, `'insane'`, `''`, and `null`
- **THEN** the first four parse to their levels and the last three yield `null`

### Requirement: persistence is versioned and validated
`serializeDifficulty(level)` MUST produce the versioned shape; `deserializeDifficulty` MUST
round-trip it and MUST throw for null/non-object input, a wrong version, or an unknown/non-string
level.

#### Scenario: round-trip and rejection
- **GIVEN** `'hard'` and malformed payloads
- **THEN** the round-trip is `'hard'`; every malformed payload throws

## Error and failure behavior
- Deserialization throws on malformed input; all other functions are total.

## Performance and resource bounds
- All operations O(1).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; new additive versioned shape.

## Security and integrity
- No new untrusted-input surface.

## Observability
- Definitions are plain frozen values.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 definitions | `tests/unit/WorldDifficulty.test.ts` › definitions |
| REQ-2 accessors | › accessors |
| REQ-3 parsing | › parsing |
| REQ-4 persistence | › persistence |
