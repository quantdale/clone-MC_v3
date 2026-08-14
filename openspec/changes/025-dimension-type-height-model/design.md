# Design: 025-dimension-type-height-model

## Context / current state

024 `ChunkColumn` accepts `sectionCount`/`minSectionY` but nothing computes them from a dimension. There
is no shared vertical-extent model, so storage and future generation would each invent their own.

## Target state

`src/data/DimensionType.ts` defines `DimensionType` (immutable height model with validated inputs and
derived section layout) and `DimensionTypeRegistry` (003-backed) with overworld/nether/end defaults.

## Invariants

- `minY` MUST be an integer; `height` MUST be a positive integer; `logicalHeight` MUST be an integer in `[1, height]`.
- `minSectionY === floor(minY / 16)` (absolute lowest section index).
- `sectionCount === ceil(height / 16)` and MUST be positive.
- `maxSectionY === minSectionY + sectionCount - 1` (absolute highest section index).
- `maxY === minY + height - 1`.
- `sectionIndexForY(worldY) === floor(worldY / 16) - minSectionY` (in-column index in `[0, sectionCount)`).
- `containsY(worldY) === (minY <= worldY <= maxY)`.

## API and data model

```ts
export interface DimensionTypeDefinition {
  id: ResourceId; minY: number; height: number; logicalHeight: number;
  hasSkylight: boolean; ultrawarm?: boolean; natural?: boolean; fixedTime?: number | null;
}

export class DimensionType {
  readonly id: ResourceId; readonly minY: number; readonly height: number;
  readonly logicalHeight: number; readonly hasSkylight: boolean;
  readonly ultrawarm: boolean; readonly natural: boolean; readonly fixedTime: number | null;
  readonly minSectionY: number; readonly sectionCount: number;
  readonly maxSectionY: number; readonly maxY: number;
  constructor(def: DimensionTypeDefinition); // validates, derives fields
  containsY(worldY: number): boolean;
  sectionIndexForY(worldY: number): number;
}

export class DimensionTypeRegistry {
  register(def: DimensionTypeDefinition): DimensionType;
  get(id: ResourceId): DimensionType;
  has(id: ResourceId): boolean;
  get size(): number;
  all(): readonly DimensionType[];
  finalize(): void;
}

export function createDefaultDimensionTypeRegistry(): DimensionTypeRegistry;
```

## Control / data flow

Construction validates inputs and computes the four derived fields once. The registry builds each
`DimensionType` via its validating constructor, then stores it in a 003 `Registry<DimensionType>`.
Defaults: overworld `minY=-64, height=384, logicalHeight=384, skylight`, nether `0/128/128, no-skylight,
ultrawarm`, end `0/256/256, no-skylight`.

## Detailed behavior

- `sectionIndexForY` returns the in-column (0-based) section index suitable for a 024 `ChunkColumn`
  configured with `minSectionY = dt.minSectionY` and `sectionCount = dt.sectionCount`.
- Validation throws `RegistryError('INVALID_ID', ...)` for malformed extent; the registry throws
  `DUPLICATE_ID` on re-registration and `MISSING_ID` on unknown lookup.

## Failure modes

- Non-positive / non-integer `height`, out-of-range `logicalHeight`, or non-integer `minY` → `RegistryError`.
- Unknown id lookup → `RegistryError('MISSING_ID')`; duplicate id → `RegistryError('DUPLICATE_ID')`.

## Compatibility / migration

Additive data model; no persisted or call-site changes.

## Performance / resource constraints

O(1) construction and lookups; negligible memory for three default dimensions.

## Testing seams

`tests/unit/DimensionType.test.ts` covers derived layout for overworld/nether/end, the three validation
rejections, `containsY`/`sectionIndexForY` range behavior, and registry register/lookup/duplicate/missing
and `all()`.

## Affected files / symbols

- `src/data/DimensionType.ts` (new)
- `tests/unit/DimensionType.test.ts` (new)

## Rejected alternatives

- **Hard-coded section counts in ChunkColumn**: fails for negative minY and non-vanilla dimensions; a
  shared model is required.
- **Storing absolute section indices in the column**: keeping `minSectionY` absolute and computing
  in-column on read (as 024 already does) is simplest and avoids double-bookkeeping.
- **Logical vs full height collapse**: kept distinct because some dimensions use a smaller logical height;
  modeling both prevents future regressions.

## Downstream dependencies

026 (vertical world access) builds columns from a dimension's `minSectionY`/`sectionCount`. 174+
(dimension manager) selects the active `DimensionType`.
