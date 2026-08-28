# Tasks: 166-hopper-transfer

## Implementation
- [x] `src/world/BlockRegistry.ts`: `HOPPER_SCHEMA` (facing 5-way, enabled); `BlockId.Hopper = 50`
      with its definition and default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Hopper = 50` with `placeBlock`.
- [x] `src/simulation/HopperTransfer.ts`: `HopperFacing` type; `HOPPER_TRANSFER_COOLDOWN_TICKS`.
- [x] `HopperTransferResult`; `transferOneItem` (merge-first-then-empty destination search,
      no-op-preserves-source on failure).
- [x] `hopperShouldTransfer` (inverted: `!powered`).
- [x] `hopperIntakePosition` / `hopperOutputPosition` (154's `offsetInDirection`).
- [x] `scheduleHopperTransfer` / `dueHopperTransfers` (047 bridge).
- [x] `hopperStateProperties`.

## Tests
- [x] `tests/unit/HopperTransfer.test.ts`: block carries schema + default.
- [x] Item places the block; cross-reference passes.
- [x] Block enumerates exactly 10 states including the default.
- [x] `transferOneItem`: empty source is a no-op.
- [x] Full destination is a no-op that does not deplete the source.
- [x] Merging into an existing stack is preferred over an empty slot.
- [x] An empty slot is used when no mergeable slot exists.
- [x] A successful transfer decrements the source by exactly one.
- [x] `hopperShouldTransfer` returns `true` when unpowered, `false` when powered.
- [x] `hopperIntakePosition` is always straight up regardless of facing (all five facings).
- [x] `hopperOutputPosition` follows the given facing (all five facings).
- [x] Scheduling not-due-before-tick case.
- [x] Scheduling fires-at-tick case.
- [x] Same-tick updates deterministically ordered (repeatable).
- [x] `hopperStateProperties` projection matches the schema.
- [x] Characterization updates for the new block/item.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2249/2249 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 167-dropper).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
