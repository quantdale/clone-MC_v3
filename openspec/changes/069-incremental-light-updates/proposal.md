# Proposal: 069-incremental-light-updates

## Problem

067/068 compute light from scratch. After a block edit (place/break), light must be *updated*
incrementally: light that depended on the edited cell must be removed, and surviving light must
re-propagate. A full recompute per edit is wasteful and non-local.

## Goals

- Provide `updateLightAfterEdit(world, x, y, z)`: deterministic removal of dependent sky/block light
  followed by re-propagation from surviving light and luminance sources.
- Correctness contract: the result MUST equal a full recompute (067 sky + 068 block) of the edited
  world — enforced by equivalence tests.

## Non-goals

- Scheduling/dirty tracking across many edits (a world-wiring concern).
- Per-chunk persistence of light (a later concern).

## Preconditions

- Change 068 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 068 baseline (754 unit / 19 e2e).

## Dependencies

- 067/068 BFS propagation patterns; 066 storage accessors.

## Proposed change

- `src/rendering/LightUpdateEngine.ts` (NEW): `LightUpdateWorld` interface,
  `updateLightAfterEdit(world, x, y, z)`.
- `tests/unit/LightUpdateEngine.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Removal must not zero cells that have independent light paths; the classic algorithm zeroes only
  cells strictly darker than the removed path and re-propagates from every surviving lit cell.
- Determinism: fixed neighbor order and FIFO queues everywhere.

## Rollback strategy

Revert the commit; the engine is additive.

## Definition of Done

- Removal phase (per light type) zeroes the connected region whose light depended on the edited cell,
  stopping at opaque cells and not touching cells with independent (≥ level) light.
- Re-add phase re-propagates from every surviving lit cell (and re-seeds block-light sources).
- `updateLightAfterEdit` on the post-edit world equals `computeSkyLight` + `computeBlockLight`
  (equivalence tests across fixtures: block placement, block break, light-source placement).
- Deterministic: identical edits produce identical results.
- Unit tests cover placement/break/source fixtures and equivalence.
- Full gate green; 069 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 069 suite; E2E stays 19/19.
