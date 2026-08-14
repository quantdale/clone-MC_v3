# Design: 015-fluid-registry

## Context / current state

Water and lava are blocks in `BlockRegistry` (`minecraft:block/water`, `minecraft:block/lava`)
with items that place them; player physics/rendering special-case them by block id. There is
no fluid type distinct from a block.

## Target state

`src/data/Fluid.ts` defines fluid types as first-class, ResourceId-identified data, in a
`FluidRegistry`. This is the data foundation for future fluid/block separation; it does not
alter the current block representation.

## Invariants

- `category` MUST be `WATER` or `LAVA`.
- `flags` MUST belong to the known `FluidFlag` set.
- `lightLevel` MUST be finite and in `[0, 15]` when present.
- `density` MUST be finite and > 0 when present.
- Ids MUST be unique (enforced by the 003 `Registry`).
- A `WATER`/`LAVA` category MUST carry the matching category flag.

## API and data model

```ts
export type FluidCategory = 'WATER' | 'LAVA';
export type FluidFlag = 'WATER' | 'LAVA' | 'SOURCE' | 'FLOWING' | 'LIGHT_EMITTING' | 'DENSER';

export interface FluidTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly category: FluidCategory;
  readonly flags: readonly FluidFlag[];
  readonly lightLevel?: number;   // [0,15]
  readonly density?: number;       // > 0
  readonly isSource?: boolean;
}

export class FluidRegistry {
  constructor(definitions: FluidTypeDefinition[]); // validates + finalizes
  get(id): FluidTypeDefinition;
  getOptional(id): FluidTypeDefinition | undefined;
  has(id): boolean;
  size: number;
  finalized: boolean;
  entries(): readonly FluidTypeDefinition[];
}

export function createDefaultFluidRegistry(): FluidRegistry;
```

Default types (ids `minecraft:fluid/<key>`):
| key | category | flags | light | density | source |
|---|---|---|---|---|---|
| water | WATER | WATER, FLOWING | 0 | 1 | false |
| water_source | WATER | WATER, SOURCE | 0 | 1 | true |
| lava | LAVA | LAVA, FLOWING, DENSER | 0 | 2 | false |
| lava_source | LAVA | LAVA, SOURCE, LIGHT_EMITTING, DENSER | 15 | 2 | true |

## Control / data flow

Construction validates each definition (unique id, known flags, category/flag consistency,
finite bounded lightLevel/density) and finalizes. Lookup is O(1) via the 003 core.

## Failure modes

- Non-finite/out-of-range `lightLevel`, non-finite/non-positive `density` -> `FluidError`
  (INVALID_VALUE).
- Unknown flag or category -> `INVALID_FLAG` / `INVALID_DEFINITION`.
- Category without its matching flag -> `INVALID_DEFINITION`.
- Duplicate id -> `DUPLICATE_ID`.

## Compatibility / migration

Purely additive data; no persisted or call-site changes.

## Performance / resource constraints

Registry lookup O(1); no allocations in any hot path. Validation is one-pass at construction.

## Testing seams

`tests/unit/Fluid.test.ts` covers validation/error paths, default registry contents/flags,
and category/flag consistency. The current `water`/`lava` blocks are NOT touched, so existing
terrain/render/physics tests remain valid.

## Affected files / symbols

- `src/data/Fluid.ts` (new)
- `tests/unit/Fluid.test.ts` (new)

## Rejected alternatives

- Modeling fluids under `src/world/` or as block subtypes: fluids are data, consistent with
  012/013/014 in `src/data/`; true block/fluid storage separation is deferred.
- Migrating blocks to fluid references now: explicitly out of scope (non-goal) to avoid
  terrain/render regressions.

## Downstream dependencies

Future flow simulation and block/fluid separation can resolve fluid types from this registry
without defining their own schema.
