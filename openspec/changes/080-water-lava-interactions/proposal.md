# Proposal: 080-water-lava-interactions

## Problem

078/079 flow engines move water and lava independently. When the two fluids meet, MC transforms
them into blocks (obsidian/cobblestone/stone); no deterministic transformation exists.

## Goals

- A pure contact resolver with the classic MC table:
  - lava source + any water → obsidian;
  - flowing lava + water source → stone;
  - flowing lava + flowing water (incl. falling) → cobblestone;
  - no contact → none.
- An apply function that deterministically clears both fluid cells and places the resulting block
  at the lava cell.

## Non-goals

- Triggering interactions from the flow engines (the wiring checks contacts after fluid steps).
- Block-state integration with the world (a `setBlockState` hook is caller-supplied).
- Waterlogging (081).

## Preconditions

- Change 079 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 079 baseline (896 unit / 19 e2e).

## Dependencies

- 076 `FluidState` levels (falling 8-15 counts as flowing for interactions); 078/079 world access
  conventions.

## Proposed change

- `src/simulation/FluidInteraction.ts` (NEW): `FluidContactResult` (`'OBSIDIAN' | 'COBBLESTONE' |
  'STONE' | 'NONE'`), `resolveFluidContact(water, lava)`, `InteractionBlockIds`,
  `FluidInteractionWorld`, `applyFluidContact(world, ids, waterPos, lavaPos)`.
- `tests/unit/FluidInteraction.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Falling levels (8-15) are classified as flowing for both fluids — documented, matches MC
  behavior (falling water + lava source → obsidian, + flowing lava → cobblestone).

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Resolver covers the full matrix (both fluids, source/flowing/falling forms) with hand-computed
  expectations; null sides → NONE.
- Apply removes both fluids and places the block at the lava cell for non-NONE results; NONE
  mutates nothing.
- Deterministic; full gate green.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 080 suite; E2E stays 19/19.
