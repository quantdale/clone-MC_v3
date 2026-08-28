# Proposal: 068-blocklight-propagation

## Problem

067 computes skylight; light-emitting blocks (torches, lava, glowstone) need *block light*: a source's
luminance radiates outward, falling off by 1 per block through non-opaque cells.

## Goals

- Provide `computeBlockLight(world)`: deterministic block-light computation seeded by per-cell
  luminance sources, with the same FIFO BFS falloff as 067.
- Sources are set even when the source block is opaque (glowstone emits from a solid block).

## Non-goals

- Light removal/repropagation after edits (069).
- Per-block luminance data definitions (a content concern; the world supplies `getLuminance`).

## Preconditions

- Change 067 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 067 baseline (749 unit / 19 e2e).

## Dependencies

- 066 light storage (the world interface writes through it); 067 BFS pattern.

## Proposed change

- `src/rendering/BlockLightEngine.ts` (NEW): `BlockLightWorld` interface, `computeBlockLight(world)`.
- `tests/unit/BlockLightEngine.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Sources must always win: if propagation would set a lower value on a source cell, the source's
  luminance stays (sources are seeded last-wins by value comparison).

## Rollback strategy

Revert the commit; the engine is additive.

## Definition of Done

- Sources are seeded with their luminance (clamped to 15) and the queue is built deterministically.
- Propagation matches 067: value `v` raises non-opaque neighbors to `v - 1`; fixed neighbor order.
- A source's value is never reduced by propagation.
- Unit tests cover torch falloff, glowstone in an opaque block, corner propagation, opaque walls, and
  determinism.
- Full gate green; 068 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 068 suite; E2E stays 19/19.
