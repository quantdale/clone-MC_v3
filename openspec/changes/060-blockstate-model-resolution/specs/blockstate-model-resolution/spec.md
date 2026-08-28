# Spec: blockstate-model-resolution

## Contract

Block states MUST resolve to render models deterministically. A `BlockModelResolver` MUST map
`(blockKey, properties)` → model key: property variants checked in registration order (first match
wins), the per-block default otherwise, and `null` for unknown blocks. Registration MUST validate
keys and reject duplicate defaults.

## Definitions

- **BlockProperties**: `Readonly<Record<string, string>>` of a block state's property values.
- **Variant**: a `(property, value)` rule mapping a matching state to a model key.

## Invariants

- At most one default per block; a second `setDefault` for the same block throws.
- Variants are matched in registration order; the first `properties[property] === value` wins.
- `resolve` returns the first matching variant's key, else the default, else `null`.
- Empty keys/values throw at registration.

## Requirements

### Requirement: default resolution
`resolve` MUST return the block's default model when no variant matches.

#### Scenario: plain block
- **GIVEN** `setDefault('minecraft:dirt', 'minecraft:block/dirt')`
- **WHEN** `resolve('minecraft:dirt', {})` runs
- **THEN** it returns `'minecraft:block/dirt'`.

### Requirement: variant override
A matching variant MUST take precedence over the default.

#### Scenario: property variant
- **GIVEN** a slab default and `setVariant('minecraft:slab', 'type', 'double', 'minecraft:block/slab_double')`
- **WHEN** `resolve('minecraft:slab', { type: 'double' })` runs
- **THEN** it returns `'minecraft:block/slab_double'`; with `{ type: 'bottom' }` it returns the default.

### Requirement: deterministic first-match
When several variants match, the first registered MUST win.

#### Scenario: two matching variants
- **GIVEN** variants `a=1 → modelA` then `a=1 → modelB` (same property/value registered twice)
- **WHEN** `resolve(block, { a: '1' })` runs
- **THEN** it returns `modelA`.

### Requirement: unknown blocks
`resolve` MUST return `null` for blocks without a default or variants.

#### Scenario: unregistered block
- **GIVEN** a resolver with no mappings for `'minecraft:missing'`
- **WHEN** `resolve('minecraft:missing', {})` runs
- **THEN** it returns `null`.

### Requirement: registration validation and state
`setDefault`/`setVariant` MUST throw on empty keys/values and duplicate defaults; `has`/`size`/`clear`
MUST reflect registration.

#### Scenario: validation and state
- **GIVEN** registrations for two blocks
- **WHEN** empty-key registration, duplicate-default registration, `has`, `size`, and `clear` run
- **THEN** the invalid registrations throw, `has` is true, `size` is 2, and after `clear` size is 0.

## Error and failure behavior

- Empty keys/values and duplicate defaults throw descriptive `Error`s.

## Performance and resource bounds

`resolve` is O(variants per block); typically ≤ 8.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Deterministic resolution prevents renderer-specific drift.

## Observability

`has`/`size` expose mapping state.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Default resolution | plain block returns default |
| Variant override | property variant wins; others use default |
| Deterministic first-match | first registered matching variant wins |
| Unknown blocks | null |
| Registration validation and state | throws, has/size/clear |
