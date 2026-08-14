# Design: 018-block-entity-type-registry

## Context / current state

Block entities have no typed representation, and no declared block→block-entity compatibility. Code
that needs to know "which block-entity does this block host" must hard-code lookups. There is no
shared type for a block entity's inventory size or tickable status.

## Target state

`src/data/BlockEntityType.ts` defines block-entity types as first-class, ResourceId-identified data
in a `BlockEntityRegistry`, plus a `BlockEntityCompatibility` structure that maps block keys to the
block-entity type keys they may host, validated against the registry. This is the data foundation for
future block-entity storage, UI, and tick dispatch; it attaches no behavior.

## Invariants

- `BlockEntityTypeDefinition.inventorySize` when present MUST be finite and > 0.
- `BlockEntityRegistry` ids MUST be unique.
- `BlockEntityCompatibility` MUST only reference block-entity type keys that exist in the registry.
- Block keys in a compatibility mapping are free-form strings; the structure does not depend on a
  live `BlockRegistry` (kept decoupled to remain additive).

## API and data model

```ts
export interface BlockEntityTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly inventorySize?: number;   // finite, > 0
  readonly tickable?: boolean;
}

export class BlockEntityError extends Error {
  readonly reason: 'DUPLICATE_ID' | 'INVALID_VALUE' | 'INVALID_REFERENCE';
}

export class BlockEntityRegistry {
  constructor(definitions: BlockEntityTypeDefinition[]); // validate + finalize
  get(id): BlockEntityTypeDefinition;
  getByKey(key): BlockEntityTypeDefinition | undefined;
  has(key): boolean;
  readonly size: number;
  readonly finalized: boolean;
  entries(): readonly BlockEntityTypeDefinition[];
}

export interface BlockEntityCompatibilityDeclaration {
  /** block key -> block-entity type key */
  readonly mappings: Readonly<Record<string, string>>;
}

export class BlockEntityCompatibility {
  constructor(registry: BlockEntityRegistry, declaration: BlockEntityCompatibilityDeclaration);
  getBlockEntityTypeForBlock(blockKey: string): BlockEntityTypeDefinition | undefined;
  isCompatible(blockKey: string, typeKey: string): boolean;
}

export function createDefaultBlockEntityRegistry(): BlockEntityRegistry;
export function createDefaultBlockEntityCompatibility(reg: BlockEntityRegistry): BlockEntityCompatibility;
```

Default types (ids `minecraft:block_entity_type/<key>`):

| key | inventorySize | tickable |
|---|---|---|
| chest | 27 | false |
| trapped_chest | 27 | false |
| furnace | undefined | true |
| blast_furnace | undefined | true |
| smoker | undefined | true |
| hopper | 5 | true |
| dispenser | 9 | false |
| dropper | 9 | false |
| sign | undefined | false |
| mob_spawner | undefined | true |

Default compatibility maps each block key to its matching type key (e.g. `chest` → `chest`,
`furnace` → `furnace`, `oak_sign` → `sign`).

## Control / data flow

`BlockEntityRegistry` validates each definition (unique id, finite positive inventorySize) and
finalizes. `BlockEntityCompatibility` validates, at construction, that every referenced type key
exists in the supplied registry, then exposes `getBlockEntityTypeForBlock` / `isCompatible`
queries. All validation is one-pass and atomic.

## Failure modes

- Non-finite/non-positive `inventorySize` -> `BlockEntityError` (INVALID_VALUE).
- Duplicate id -> `DUPLICATE_ID`.
- Compatibility referencing an unknown type key -> `INVALID_REFERENCE`.

## Compatibility / migration

Purely additive data; no persisted or call-site changes.

## Performance / resource constraints

Registry lookup O(1); compatibility query O(1) via the internal map.

## Testing seams

`tests/unit/BlockEntityType.test.ts` covers registry validation/error paths, default types,
compatibility validation (unknown-type rejection), and compatibility queries.

## Affected files / symbols

- `src/data/BlockEntityType.ts` (new)
- `tests/unit/BlockEntityType.test.ts` (new)

## Rejected alternatives

- Coupling compatibility validation to a live `BlockRegistry`: keeps the change additive and avoids
  depending on block-internal representation; block keys remain plain strings.
- Attaching storage/tick behavior: explicitly out of scope (non-goal).

## Downstream dependencies

Future block-entity storage, screen UI, and tile-tick dispatch can resolve block-entity types and
their block compatibility from these structures without defining their own schema.
