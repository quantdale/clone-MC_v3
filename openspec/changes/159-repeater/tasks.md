# Tasks: 159-repeater

## Implementation
- [x] `src/world/BlockRegistry.ts`: `REPEATER_SCHEMA` (facing 4-way, delay 1-4, locked, powered);
      `BlockId.RedstoneRepeater = 42` with its definition and default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.RedstoneRepeater = 42` with `placeBlock`.
- [x] `src/simulation/RedstoneRepeater.ts`: `RepeaterDelay` type; `REPEATER_DELAY_TICKS`.
- [x] `cycleRepeaterDelay`; `repeaterShouldLock`; `resolveRepeaterOutput`;
      `repeaterSignalStrength`.
- [x] `scheduleRepeaterOutput` / `dueRepeaterOutputs` (047 bridge).
- [x] `repeaterStateProperties`.

## Tests
- [x] `tests/unit/RedstoneRepeater.test.ts`: block carries schema + default.
- [x] Item places the block; cross-reference passes.
- [x] Block enumerates exactly 64 states including the default.
- [x] `REPEATER_DELAY_TICKS` maps all four delays correctly.
- [x] `cycleRepeaterDelay` wraps after the fourth delay.
- [x] `repeaterShouldLock` true/false cases.
- [x] `resolveRepeaterOutput` locked-holds case.
- [x] `resolveRepeaterOutput` unlocked-follows case.
- [x] `repeaterSignalStrength` powered/unpowered cases.
- [x] Scheduling not-due-before-tick-cost case for each of the four delays.
- [x] Scheduling fires-at-tick-cost case for each of the four delays.
- [x] Same-tick outputs deterministically ordered (repeatable).
- [x] `repeaterStateProperties` projection matches the schema.
- [x] Characterization updates for the new block/item.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (15/15).
- [x] Full `npm test` passes (182 files, 2157/2157 — prior 2142 + 15 new).
- [x] `npm run build` passes (registry edits in the live graph).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 160-comparator).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
