# Design: 175-nether-dimension-type

## Context/current state
- 025's `DimensionType` validates and derives the vertical section model; 174's `DimensionManager`
  registers dimensions keyed by `type.id`. No canonical dimension types exist in production code —
  tests build their own fixtures.

## Target state
- `src/data/DimensionTypes.ts` holding `OVERWORLD_DIMENSION_TYPE`, `NETHER_DIMENSION_TYPE`, and
  `dimensionSaveNamespace`.

## Invariants
- `OVERWORLD_DIMENSION_TYPE`: id `minecraft:overworld`, minY −64, height/logicalHeight 384
  (24 sections), skylight, natural, ultrawarm false, fixedTime null.
- `NETHER_DIMENSION_TYPE`: id `minecraft:the_nether`, minY 0, height/logicalHeight 256 (16
  sections), NO skylight, ultrawarm true, natural false, fixedTime 18000.
- `dimensionSaveNamespace(key)` returns `key` exactly when `tryParseResourceId(key)` parses, and
  throws `RegistryError('INVALID_ID', key, …)` otherwise.

## API and data model
```ts
// src/data/DimensionTypes.ts (new)
export const OVERWORLD_DIMENSION_TYPE: DimensionType;   // minecraft:overworld, -64/384, skylight
export const NETHER_DIMENSION_TYPE: DimensionType;      // minecraft:the_nether, 0/256, no skylight, ultrawarm, fixedTime 18000
export function dimensionSaveNamespace(key: string): string;  // validates + returns the key
```

## Control/data flow
1. Consumers (176's generation, 177-178's portals, 179's content) import the canonical types and
   register them through 174's manager or consult them directly.
2. The persistence layer (a future dimension-aware change) calls `dimensionSaveNamespace(key)` when
   deriving a dimension's storage namespace.

## Detailed behavior
- The constants are constructed at module load; the `DimensionType` constructor's own validation
  (025) rejects any illegal definition immediately (e.g. `logicalHeight > height`).
- `fixedTime: 18000` encodes vanilla's Nether noon lock; `ultrawarm` is the ambient rule; `natural:
  false` means no natural monster spawning.

## Failure modes
- Malformed save-namespace keys throw `INVALID_ID` before any persistence call; the constants
  cannot be malformed (025 validates at construction).

## Compatibility/migration
- One new data module; no existing code touched; no schema/save-format change.

## Performance/resource constraints
- Module-load constant construction only; `dimensionSaveNamespace` is O(key length).

## Testing seams
- Tests use the real `DimensionManager` (174) for the Nether registration integration and the
  real `DimensionType` derivation (025) for section counts/bounds.

## Observability/debugging
- The constants are plain values; `dimensionSaveNamespace` makes the namespace contract explicit.

## Affected files/symbols
- `src/data/DimensionTypes.ts` (new).
- Tests: `tests/unit/DimensionTypes.test.ts` (new). No other files.

## Rejected alternatives
- **Defining the Nether type inside 174's `DimensionManager`**: rejected — types are data (025) and
  will be imported by many consumers; a dedicated data module is the natural home.
- **Separate `saveNamespace` fields on the type**: rejected — the namespace is derived from the key
  by construction; a field would be a second source of truth.

## Downstream dependencies
- 176 (`nether-world-generation`) consumes `NETHER_DIMENSION_TYPE` for density/surface/biome
  baselines; 177-178 (portals) use its `containsY` and key; 179 (content) uses `ultrawarm`/`natural`;
  180 (End) mirrors this module with the End's parameters.
