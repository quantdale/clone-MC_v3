# Tasks: 164-piston-execution

## Implementation
- [x] `src/world/BlockRegistry.ts`: `PISTON_SCHEMA` (facing 6-way, extended); `BlockId.Piston = 48`
      with its definition and default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Piston = 48` with `placeBlock`.
- [x] `src/simulation/PistonExecution.ts`: `PistonExecutionWorld<TState>` interface.
- [x] `executePistonPush` (no-op on blocked plan; snapshot-then-apply; destroy-before-move;
      farthest-first write order).
- [x] `pistonAffectedPositions` (empty for blocked plan; piston + sources + destinations +
      destroyed positions otherwise).
- [x] `pistonShouldBeExtended`; `pistonStateProperties`.

## Tests
- [x] `tests/unit/PistonExecution.test.ts`: block carries schema + default.
- [x] Item places the block; cross-reference passes.
- [x] Block enumerates exactly 12 states including the default.
- [x] `executePistonPush` is a no-op for a blocked plan (records zero calls).
- [x] Immediate clear termination changes nothing.
- [x] Immediate destroy termination clears exactly that position.
- [x] A three-block chain ends with each destination holding its source's original state and every
      source empty.
- [x] A chain terminating in destruction moves and destroys correctly (farthest block ends up in
      the cleared destroy slot).
- [x] `pistonAffectedPositions` returns `[]` for a blocked plan.
- [x] `pistonAffectedPositions` returns exactly the piston, sources, destinations, and destroyed
      positions for a successful plan.
- [x] `pistonShouldBeExtended` powered/unpowered cases.
- [x] `pistonStateProperties` projection matches the schema.
- [x] Characterization updates for the new block/item.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2218/2218 baseline) — 187 files / 2231 tests green.
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      165-slime-honey-move-groups).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
