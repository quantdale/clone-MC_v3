# Spec: render-layer-model

## Contract

Block geometry MUST be classifiable into four render layers — `opaque`, `cutout`, `translucent`,
`emissive` — with a pinned order, validated parsing, and a per-block registry defaulting to `opaque`.
`parseRenderLayer`/`isRenderLayer` MUST validate layer strings; `compareLayers` MUST order layers
deterministically; `RenderLayerRegistry` MUST store validated layers per block key.

## Definitions

- **RenderLayer**: one of the four canonical layer names.
- **Pinned order**: `opaque < cutout < translucent < emissive`.

## Invariants

- `RENDER_LAYERS` is exactly the four layers in pinned order.
- `parseRenderLayer` returns the layer for the four exact names and `null` otherwise.
- `getLayer` returns `'opaque'` for unregistered blocks.
- `setLayer` throws on unknown layer strings.
- `compareLayers(a, b)` is negative/zero/positive by pinned order.

## Requirements

### Requirement: layer set and parsing
The four layers MUST exist in pinned order; parsing MUST accept exactly them.

#### Scenario: parse matrix
- **GIVEN** strings `'opaque'`, `'cutout'`, `'translucent'`, `'emissive'`, `'glassy'`, `''`
- **WHEN** `parseRenderLayer` runs on each
- **THEN** the first four return their layers and the last two return `null`.

### Requirement: ordering
`compareLayers` MUST order by the pinned sequence.

#### Scenario: ordering
- **GIVEN** all pairs of layers
- **WHEN** `compareLayers` runs
- **THEN** `opaque < cutout < translucent < emissive` (strictly increasing).

### Requirement: registry default and round-trip
`getLayer` MUST return `'opaque'` for unregistered blocks and the stored layer otherwise; `setLayer`
MUST reject unknown layers.

#### Scenario: registry behavior
- **GIVEN** `setLayer('minecraft:glass', 'translucent')`
- **WHEN** `getLayer('minecraft:glass')`, `getLayer('minecraft:stone')`, `setLayer('x', 'glassy')`,
  `has`, `size`, and `clear` run
- **THEN** glass returns `'translucent'`, stone returns `'opaque'`, the invalid set throws, `has` is
  true, `size` is 1, and after `clear` size is 0.

## Error and failure behavior

- `setLayer` with an unknown layer throws a descriptive `Error`.

## Performance and resource bounds

Registry lookups are O(1).

## Compatibility and migration

Additive; `RenderCategory` remains untouched until a consumer migrates.

## Security and integrity

Validated layer strings prevent malformed classification from reaching the renderer.

## Observability

`has`/`size` expose registry state.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Layer set and parsing | four layers; parse matrix |
| Ordering | strict pinned order |
| Registry default and round-trip | default, set/get, invalid rejection, has/size/clear |
