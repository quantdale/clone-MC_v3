# Design: 180-end-dimension-type

## Context/current state
- 175 established the pattern: canonical dimension types in `src/data/DimensionTypes.ts` with every
  vanilla parameter pinned by tests, manager integration through 174, and the key-generic
  save-namespace rule. The End is the last missing standard dimension.

## Target state
- `END_DIMENSION_TYPE` added to `DimensionTypes.ts`.

## Invariants
- `END_DIMENSION_TYPE`: id `minecraft:the_end`, minY 0, height/logicalHeight 256 (16 sections), NO
  skylight, ultrawarm false, natural false, fixedTime 6000.
- `containsY` true exactly for 0..255.
- Registers through 174's manager under `minecraft:the_end` with a fresh queue.

## API and data model
```ts
// src/data/DimensionTypes.ts (edit)
export const END_DIMENSION_TYPE: DimensionType;  // minecraft:the_end, 0/256, no skylight, fixedTime 6000
```

## Control/data flow
- 181 (End generation) consumes `END_DIMENSION_TYPE` for its column bounds; 182-184 (portal/
  dragon progression) consult its key and `containsY`; the persistence layer uses
  `dimensionSaveNamespace('minecraft:the_end')`.

## Detailed behavior
- Identical construction path to 175's constants: the 025 constructor validates the definition at
  module load; no new behavior.

## Failure modes
- None beyond 025's construction validation (cannot be malformed).

## Compatibility/migration
- One additive constant; no existing code touched; no schema/save-format change.

## Performance/resource constraints
- Module-load constant construction only.

## Testing seams
- Tests use the real `DimensionManager` (174) and the real `DimensionType` derivation (025).

## Observability/debugging
- The constant is a plain value.

## Affected files/symbols
- `src/data/DimensionTypes.ts` (edit).
- Tests: `tests/unit/EndDimensionType.test.ts` (new). No other files.

## Rejected alternatives
- **Defining the End type in 181's worldgen module**: rejected — types are data (025) shared by
  multiple consumers; the types module is the established home (175's precedent).

## Downstream dependencies
- 181 (`end-world-generation`) consumes the bounds; 182-184 (portal progression, dragon, exit)
  consume the key/time lock; 218 adds End mobs.
