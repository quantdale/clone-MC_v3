# Proposal: 059-block-model-data

## Problem

Blocks render as textured cubes from hard-coded geometry in `ChunkMesher`. Slabs, stairs, panes, and
doors need per-block *models*: box elements with per-face texture references. No data schema exists.

## Goals

- Define a validated `BlockModel` schema: parent reference, texture map, and box elements with
  `from`/`to` coordinates in model units `[0, 16]` and per-face `{ texture, uv, cullface }` data.
- Provide a `BlockModelRegistry` keyed by ResourceId with validation (like the other registries),
  so models are data-driven and centrally validated.

## Non-goals

- Model resolution/multipart logic (060 resolves models per block state; parents/variants later).
- Rendering the models (063 meshes them; 059 is the data schema + registry).
- Loading from files (020-style loaders later; 059 defines the in-memory contract).

## Preconditions

- Change 058 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 058 baseline (694 unit / 19 e2e).

## Dependencies

- 002 `ResourceId` (`createResourceId`, `parseResourceId`) for model keys.

## Proposed change

- `src/data/BlockModel.ts` (NEW): `ModelFace` ('up'|'down'|'north'|'south'|'east'|'west'),
  `BlockModelFace`, `BlockModelElement`, `BlockModel`, `validateBlockModel`, `BlockModelRegistry`.
- `tests/unit/BlockModel.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet (the mesher keeps hard-coded cubes until 063).

## Risks

- Coordinate conventions (`from`/`to` in 0..16 model units) must be documented and validated strictly;
  malformed elements must be rejected, never half-rendered.

## Rollback strategy

Revert the commit; the schema is additive.

## Definition of Done

- `validateBlockModel` rejects invalid faces, out-of-range/non-finite `from`/`to`, `from >= to`,
  non-4-length `uv`, missing `texture`, and non-object shapes.
- `BlockModelRegistry.register` accepts valid models per ResourceId (duplicate rejection); `get`
  returns the model or `null`; `has`/`size`/`clear` behave.
- Unit tests cover schema validation, face validation, registry behavior, and duplicate rejection.
- Full gate green; 059 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 059 suite; E2E stays 19/19.
