# Tasks: 171-rail-block-states

## Implementation
- [x] `src/world/BlockRegistry.ts`: `RAIL_SCHEMA` (`shape` named, 10 values from `RAIL_SHAPES`);
      `BlockId.Rail = 54` with its definition and default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Rail = 54` with `placeBlock`.
- [x] `src/simulation/RailBlockStates.ts`: `RailShape`; `RAIL_SHAPES` (10, stable).
- [x] `HorizontalDirection`; `RailLevel`; `RailNeighbor`; `RailNeighborWorld<S>`/`RailSupportWorld<S>`.
- [x] `railNeighborInfo` (same-height level 0, one-higher level 1, absent).
- [x] `resolveRailShape` (documented precedence: straight pairs, corners, singles, default).
- [x] `railShapeConnections` (connected directions per shape).
- [x] `railHasSupport` (solid block directly below).
- [x] `railStateProperties`.

## Tests
- [x] `tests/unit/RailBlockStates.test.ts`: block carries schema + default `north_south`.
- [x] Item places the block; cross-reference passes.
- [x] Block enumerates exactly 10 states including the default.
- [x] Resolver: no neighbors -> `north_south`.
- [x] Resolver: flat straights from opposite same-level pairs.
- [x] Resolver: ascents on elevated straight-pair sides (all four).
- [x] Resolver: all four corners from perpendicular same-level pairs.
- [x] Resolver: elevated neighbor never corners (ascends instead).
- [x] Resolver: straight pairs take precedence over corners (three neighbors).
- [x] Resolver: single elevated -> ascent; single same-level -> flat.
- [x] `railNeighborInfo`: same-height (level 0), one-higher (level 1), absent.
- [x] `railShapeConnections`: correct directions per shape; all 10 covered.
- [x] `railHasSupport`: solid below true, air below false.
- [x] `railStateProperties` projection matches the schema.
- [x] Characterization updates: BlockRegistry 42→43, BlockStateRegistry total + rail branch,
      BlockPropertySchema STATEFUL set adds rail.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2320/2320 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 172-minecart-physics).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
