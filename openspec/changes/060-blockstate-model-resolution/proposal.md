# Proposal: 060-blockstate-model-resolution

## Problem

059 defines models, but nothing maps a *block state* (block key + property values) to the model it
should render. Without deterministic resolution, every renderer would hand-code the mapping.

## Goals

- Provide a `BlockModelResolver` that deterministically maps `(blockKey, properties)` → model key.
- Support a default model per block plus property-based variants (first-registered match wins,
  deterministic order).
- Missing blocks/models resolve to `null` (callers fall back safely).

## Non-goals

- Parent-model inheritance and rotation/transforms (059's `parent` is resolved later).
- Loading blockstate JSON files (a 211+ data concern).
- Wiring into the mesher (063 consumes the resolver).

## Preconditions

- Change 059 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 059 baseline (700 unit / 19 e2e).

## Dependencies

- 059 `BlockModel`/`BlockModelRegistry` key strings (the resolver stores model keys, not models).

## Proposed change

- `src/data/BlockModelResolver.ts` (NEW): `ModelKeyResolver`-style `BlockModelResolver`
  (`setDefault`/`setVariant`/`resolve`/`has`/`size`/`clear`).
- `tests/unit/BlockModelResolver.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Variant matching order must be deterministic: variants are checked in registration order; the first
  matching `property=value` wins; the default applies only when no variant matches.

## Rollback strategy

Revert the commit; the resolver is additive.

## Definition of Done

- `resolve(blockKey, properties)` returns the first matching variant's model key, else the default,
  else `null`.
- `setDefault`/`setVariant` validate keys; duplicate defaults for a block are rejected (one default
  per block).
- Deterministic: identical inputs always produce identical results.
- Unit tests cover default resolution, variant override, first-match determinism, missing blocks,
  and registry state queries.
- Full gate green; 060 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 060 suite; E2E stays 19/19.
