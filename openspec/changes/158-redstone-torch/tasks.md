# Tasks: 158-redstone-torch

## Implementation
- [x] `src/world/BlockRegistry.ts`: `LIT_SCHEMA`; `BlockId.RedstoneTorch = 41` with its definition.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.RedstoneTorch = 41` with `placeBlock`.
- [x] `src/simulation/RedstoneTorch.ts`: constants; `torchShouldBeLit`; `torchSignalStrength`.
- [x] `scheduleTorchUpdate` / `dueTorchUpdates` (047 bridge).
- [x] `TorchBurnoutTracker` (`recordToggle` with window pruning, `isBurnedOut`, `toggleCount`,
      `clear`).
- [x] `torchStateProperties`.

## Tests
- [x] `tests/unit/RedstoneTorch.test.ts`: block carries `LIT_SCHEMA` + `lit: false` default.
- [x] Item places the block; `validateItemBlockCrossReferences` passes.
- [x] Block enumerates exactly 2 states with an unlit default.
- [x] Inversion: unpowered attachment lights the torch.
- [x] Inversion: powered attachment extinguishes it.
- [x] Signal strength lit / unlit.
- [x] Update not due before its tick.
- [x] Update fires at its tick.
- [x] Same-tick updates deterministically ordered (repeatable).
- [x] Burnout triggers past `BURNOUT_TOGGLE_LIMIT`.
- [x] No burnout exactly at the limit.
- [x] No burnout when toggles are spread beyond the window.
- [x] Still burnt out during recovery.
- [x] Recovered after the quiet period.
- [x] Continued toggling extends the burnout.
- [x] Burnout is per torch.
- [x] `torchStateProperties` projection matches the schema.
- [x] Characterization updates for the new block/item.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (22/22).
- [x] Full `npm test` passes (181 files, 2142/2142 — prior 2120 + 22 new).
- [x] `npm run build` passes (registry edits in the live graph).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 159-repeater).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
