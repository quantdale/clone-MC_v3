# Design: 060-blockstate-model-resolution

## Context / current state

059 provides models; no block-state → model mapping exists.

## Target state

A `BlockModelResolver` maps `(blockKey, properties)` → model key: property variants are checked in
registration order (first match wins); the per-block default applies otherwise; unknown blocks resolve
to `null`.

## Invariants

- Exactly one default model per block (re-registering a default throws).
- Variants are keyed `property=value`; a variant matches when the property's value equals the
  registered value; the first registered match wins.
- `resolve` returns: first matching variant → default → `null`.
- `setDefault`/`setVariant` validate non-empty keys and values.
- Resolution is a pure function of the inputs (deterministic).

## API and data model

```ts
// src/data/BlockModelResolver.ts
export type BlockProperties = Readonly<Record<string, string>>;
export class BlockModelResolver {
  setDefault(blockKey: string, modelKey: string): void;
  setVariant(blockKey: string, property: string, value: string, modelKey: string): void;
  resolve(blockKey: string, properties: BlockProperties): string | null;
  has(blockKey: string): boolean;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. Content registers mappings: `resolver.setDefault('minecraft:slab', 'minecraft:block/slab')`;
   `resolver.setVariant('minecraft:slab', 'type', 'double', 'minecraft:block/slab_double')`.
2. The mesher (063) asks `resolve(blockKey, stateProperties)` per block; the returned key is looked up
   in the 059 registry.

## Detailed behavior

- Internally: `Map<blockKey, { default: string; variants: Array<{ property, value, modelKey }> }>`.
- `resolve` iterates the block's variants in registration order; the first with
  `properties[property] === value` wins; else the default; else `null`.

## Failure modes

- Duplicate default for a block → `Error`.
- Empty keys/values → `Error`.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

`resolve` is O(variants per block); typically ≤ 8.

## Testing seams

- `tests/unit/BlockModelResolver.test.ts`:
  - default resolution for blocks without matching variants;
  - variant override (`type=double` maps elsewhere);
  - first-match determinism (two variants matching different properties; registration order decides);
  - unknown block → null; block without default/variants → null;
  - `has`/`size`/`clear`;
  - validation errors for empty keys and duplicate defaults.

## Observability / debugging

`has`/`size` expose mapping state.

## Affected files / symbols

- `src/data/BlockModelResolver.ts` — NEW.
- `tests/unit/BlockModelResolver.test.ts` — NEW.

## Rejected alternatives

- *Full JSON blockstate parsing*: a data-loading concern (211+); the resolver is the deterministic
  in-memory primitive.

## Downstream dependencies

063 (meshing) resolves per-block models through this; 215 (content expansion) registers mappings.
