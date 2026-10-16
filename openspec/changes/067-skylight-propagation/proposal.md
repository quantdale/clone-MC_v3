# Proposal: 067-skylight-propagation

## Problem

066 provides light storage, but nothing *computes* skylight. Skylight must be deterministic: sunlight
starts at 15 at the world top, falls off by 1 per block through air, stops at opaque blocks, and
propagates around overhangs into caves.

## Goals

- Provide `computeSkyLight(world)`: deterministic skylight initialization (per-column top-down
  falloff) and propagation (BFS through non-opaque cells) over a `SkyLightWorld` interface backed by
  066 `SectionLightStorage`.
- Deterministic: identical worlds produce identical light arrays; neighbor order and queue order are
  fixed.

## Non-goals

- Block light (068) and removal/repropagation (069) — later changes.
- Persistence of light (a later wiring concern).

## Preconditions

- Change 066 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 066 baseline (744 unit / 19 e2e).

## Dependencies

- 066 `SectionLightStorage` (the world interface writes through it).

## Proposed change

- `src/rendering/SkyLightEngine.ts` (NEW): `SkyLightWorld` interface, `computeSkyLight(world)`.
- `tests/unit/SkyLightEngine.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Termination: values only increase toward 15 and cells are processed at most 15 times; the BFS is
  strictly bounded.

## Rollback strategy

Revert the commit; the engine is additive.

## Definition of Done

- Per-column initialization: 15 at the topmost air, −1 per block downward, 0 from the first opaque
  block down.
- Propagation fills cells under overhangs through non-opaque neighbors (BFS, deterministic order).
- Identical worlds produce identical results; opaque cells are never lit.
- Unit tests cover open sky, ground, overhang/cave, determinism, and bounds.
- Full gate green; 067 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 067 suite; E2E stays 19/19.
