# Proposal: 061-render-layer-model

## Problem

Rendering needs to group geometry by transparency behavior: opaque blocks occlude neighbors; cutout
textures (glass panes, leaves) need alpha-testing but no blending; translucent blocks (water, ice)
need alpha blending and stable ordering; emissive surfaces (glowstone) ignore light. The current
`RenderCategory` only distinguishes opaque/transparent.

## Goals

- Define the canonical four-layer model: `RenderLayer = Opaque | Cutout | Translucent | Emissive`.
- Provide a `RenderLayerRegistry` mapping block keys → layers (default `Opaque`) with validation.
- Provide layer ordering/comparison helpers (e.g. sorting geometry by layer for stable rendering).

## Non-goals

- Migrating `BlockRegistry.renderCategory` (a later consumer change; 061 is the canonical
  classification primitive).
- Translucent sorting policy (074 handles ordering in detail).
- Per-face layers (a later model-level concern).

## Preconditions

- Change 060 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 060 baseline (705 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/rendering/RenderLayer.ts` (NEW): `RenderLayer`, `RENDER_LAYERS` (ordered list),
  `parseRenderLayer`/`isRenderLayer`, `RenderLayerRegistry` (`setLayer`/`getLayer`/`has`/`size`/
  `clear`, default `Opaque`).
- `tests/unit/RenderLayer.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- The layer order must be stable (it drives sort order later); pinned as
  `Opaque < Cutout < Translucent < Emissive`.

## Rollback strategy

Revert the commit; the model is additive.

## Definition of Done

- `isRenderLayer`/`parseRenderLayer` validate the four layer names.
- `getLayer` returns `Opaque` for unregistered blocks; `setLayer` rejects unknown layer strings.
- Layer order comparisons work (`compareLayers(a, b)`).
- Unit tests cover the layer set, ordering, registry behavior, and validation.
- Full gate green; 061 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 061 suite; E2E stays 19/19.
