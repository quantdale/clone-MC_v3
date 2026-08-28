# Tasks: 167-dropper

## Implementation
- [x] `src/world/BlockRegistry.ts`: `DROPPER_SCHEMA` (facing 5-way, enabled); `BlockId.Dropper = 51`
      with its definition and default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Dropper = 51` with `placeBlock`.
- [x] `src/simulation/DropperEject.ts`: `DropperFacing` type; `DROPPER_EJECT_COOLDOWN_TICKS`.
- [x] `DroppedItem`; `DropperEjectResult` (container / drop / none).
- [x] `ejectFromDropper` (push via 166's `transferOneItem` when a container is supplied; world-drop
      descriptor when `null`; `none` when empty or container full — no spill).
- [x] `dropperShouldTransfer` (inverted: `!powered`).
- [x] `dropperOutputPosition` (154's `offsetInDirection`).
- [x] `scheduleDropperEject` / `dueDropperEjects` (047 bridge).
- [x] `dropperStateProperties`.

## Tests
- [x] `tests/unit/DropperEject.test.ts`: block carries schema + default.
- [x] Item places the block; cross-reference passes.
- [x] Block enumerates exactly 10 states including the default.
- [x] `dropperShouldTransfer` returns `true` when unpowered, `false` when powered.
- [x] `dropperOutputPosition` follows the given facing (all five facings).
- [x] `ejectFromDropper`: empty source is a `none` no-op.
- [x] Container push merges into an existing stack; source decremented by one.
- [x] Container push into an empty slot when no mergeable slot exists.
- [x] Full container yields `none` with source untouched (no world spill).
- [x] `null` destination yields a `drop` with correct item/count/position; source decremented.
- [x] Scheduling not-due-before-tick case.
- [x] Scheduling fires-at-tick case.
- [x] Same-tick ejections deterministically ordered (repeatable).
- [x] `dropperStateProperties` projection matches the schema.
- [x] Characterization updates for the new block/item (BlockRegistry 39→40, BlockStateRegistry
      total + dropper branch, BlockPropertySchema STATEFUL set).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2265/2265 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 168-dispenser).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
