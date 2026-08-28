# Design: 061-render-layer-model

## Context / current state

`RenderCategory` (Opaque/Transparent) is the only classification. Rendering needs four layers.

## Target state

A canonical `RenderLayer` model (`Opaque`, `Cutout`, `Translucent`, `Emissive`) with a validated
string form, a pinned render order, and a per-block `RenderLayerRegistry` defaulting to `Opaque`.

## Invariants

- Layer order is pinned: `Opaque < Cutout < Translucent < Emissive` (used for geometry sorting).
- `parseRenderLayer` accepts exactly the four layer names (case-sensitive); anything else returns
  `null` (and `setLayer` throws).
- `getLayer` returns `Opaque` for unregistered blocks.
- `setLayer` validates the layer string before storing; duplicate sets overwrite (idempotent).

## API and data model

```ts
// src/rendering/RenderLayer.ts
export type RenderLayer = 'opaque' | 'cutout' | 'translucent' | 'emissive';
export const RENDER_LAYERS: readonly RenderLayer[]; // pinned order
export function isRenderLayer(value: string): value is RenderLayer;
export function parseRenderLayer(value: string): RenderLayer | null;
export function compareLayers(a: RenderLayer, b: RenderLayer): number;
export class RenderLayerRegistry {
  setLayer(blockKey: string, layer: string): void;
  getLayer(blockKey: string): RenderLayer;
  has(blockKey: string): boolean;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. Content registers layers: `registry.setLayer('minecraft:glass', 'translucent')`.
2. The mesher (063) queries `getLayer(blockKey)` per block to choose the geometry group; sorting
   (074) uses `compareLayers`.

## Detailed behavior

- `RENDER_LAYERS = ['opaque', 'cutout', 'translucent', 'emissive']`; `compareLayers` compares
  indexes.
- `setLayer` throws on unknown layers; a block key with an unknown layer is never stored.

## Failure modes

- Unknown layer string → `Error` from `setLayer`; `parseRenderLayer` returns `null` (non-throwing).

## Compatibility / migration

Additive; the existing `RenderCategory` remains untouched until a consumer migrates.

## Performance / resource constraints

Registry lookups are O(1).

## Testing seams

- `tests/unit/RenderLayer.test.ts`:
  - layer set: exactly four layers in pinned order;
  - parse/isRenderLayer: valid + invalid strings;
  - compareLayers ordering across all pairs;
  - registry: default Opaque, set/get round-trip, unknown-layer rejection, has/size/clear.

## Observability / debugging

`has`/`size` expose registry state.

## Affected files / symbols

- `src/rendering/RenderLayer.ts` — NEW.
- `tests/unit/RenderLayer.test.ts` — NEW.

## Rejected alternatives

- *Numeric enum only*: string layers are data-friendly (059 model data, later JSON); the pinned
  string list keeps both.

## Downstream dependencies

063 (meshing) groups geometry by layer; 074 (translucent ordering) sorts with `compareLayers`; 211
(resource packs) serialize layer names.
