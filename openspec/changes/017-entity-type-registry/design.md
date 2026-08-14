# Design: 017-entity-type-registry

## Context / current state

Entity types have no typed representation. Spawning/rendering code uses scattered constants. There
is no single source of truth for an entity's category or descriptive metadata, and no stable
runtime id assignment for deterministic serialization.

## Target state

`src/data/EntityType.ts` defines entity types as first-class, ResourceId-identified data, in an
`EntityRegistry`. The registry assigns dense deterministic runtime ids on construction. This is the
data foundation for future entity spawning and serialization; it does not attach any behavior.

## Invariants

- `category` MUST be one of the known `EntityCategory` values.
- `health` when present MUST be finite and > 0.
- `attackDamage` when present MUST be finite and >= 0.
- Ids MUST be unique.
- Runtime ids are assigned by registration order (0-based) and are stable for a given registry
  contents; they are process/data-set local, not persistent identity.

## API and data model

```ts
export type EntityCategory =
  | 'MONSTER' | 'CREATURE' | 'AMBIENT' | 'WATER_CREATURE' | 'WATER_AMBIENT' | 'PROJECTILE' | 'OTHER';

export interface EntityTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly category: EntityCategory;
  readonly health?: number;          // finite, > 0
  readonly attackDamage?: number;    // finite, >= 0
  readonly isSummonable?: boolean;   // default false
  readonly isPersistent?: boolean;   // default false
}

export class EntityError extends Error {
  readonly reason: 'DUPLICATE_ID' | 'INVALID_VALUE' | 'INVALID_FLAG';
}

export class EntityRegistry {
  constructor(definitions: EntityTypeDefinition[]); // validates + finalizes
  get(id): EntityTypeDefinition;
  getOptional(id): EntityTypeDefinition | undefined;
  getByKey(key): EntityTypeDefinition | undefined;
  getByRuntimeId(runtimeId): EntityTypeDefinition;
  getRuntimeId(id): number;
  readonly size: number;
  readonly finalized: boolean;
  entries(): readonly EntityTypeDefinition[];
}

export function createDefaultEntityRegistry(): EntityRegistry;
```

Default types (ids `minecraft:entity_type/<key>`):

| key | category | health | attack | summon | persistent |
|---|---|---|---|---|---|
| zombie | MONSTER | 20 | 3 | true | true |
| skeleton | MONSTER | 20 | 2 | true | true |
| creeper | MONSTER | 20 | 0 | true | true |
| spider | MONSTER | 16 | 2 | true | true |
| pig | CREATURE | 10 | 0 | true | true |
| cow | CREATURE | 10 | 0 | true | true |
| chicken | CREATURE | 4 | 0 | true | true |
| sheep | CREATURE | 8 | 0 | true | true |
| squid | WATER_CREATURE | 10 | 0 | true | true |
| bat | AMBIENT | 6 | 0 | true | false |
| item | OTHER | undefined | undefined | false | false |

## Control / data flow

Construction validates each definition (unique id, known category, finite bounded health/attack),
then registers into the 003 core (assigning runtime ids) and finalizes. Lookup is O(1) via the
core; `getByKey` indexes by `key` string.

## Failure modes

- Non-finite/non-positive `health`, non-finite/negative `attackDamage` -> `EntityError`
  (INVALID_VALUE).
- Unknown category -> `INVALID_FLAG`.
- Duplicate id -> `DUPLICATE_ID`.

All failures are atomic at construction time.

## Compatibility / migration

Purely additive data; no persisted or call-site changes.

## Performance / resource constraints

Registry lookup O(1); runtime id resolution O(1); one-pass validation at construction.

## Testing seams

`tests/unit/EntityType.test.ts` covers validation/error paths, default registry contents/metadata,
runtime-id assignment/lookup, and duplicate-id rejection. No current entity code is touched.

## Affected files / symbols

- `src/data/EntityType.ts` (new)
- `tests/unit/EntityType.test.ts` (new)

## Rejected alternatives

- Attaching AI/behavior data now: explicitly out of scope (non-goal) to avoid behavior regressions.
- Basing the registry on `src/player/` or `src/engine/`: entity types are data, consistent with
  012-016 in `src/data/`; behavior consumers are deferred.

## Downstream dependencies

Future spawning, serialization, and entity/AI consumers can resolve entity types from this registry
and use its stable runtime ids without defining their own schema.
