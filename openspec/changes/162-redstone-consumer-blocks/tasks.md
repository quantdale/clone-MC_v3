# Tasks: 162-redstone-consumer-blocks

## Implementation
- [x] `src/world/BlockRegistry.ts`: `LAMP_SCHEMA` (`lit`); `OPEN_SCHEMA` (`open`, shared by door and
      trapdoor); `BlockId.RedstoneLamp = 45`, `BlockId.Door = 46`, `BlockId.Trapdoor = 47` with
      their definitions and default states.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.RedstoneLamp = 45`, `ItemId.Door = 46`,
      `ItemId.Trapdoor = 47` with `placeBlock`.
- [x] `src/simulation/RedstoneConsumers.ts`: `LAMP_OFF_DELAY_TICKS`.
- [x] `lampShouldBeLit`; `scheduleLampOff` / `dueLampOffs` (047 bridge).
- [x] `doorShouldBeOpen`; `trapdoorShouldBeOpen`.
- [x] `lampStateProperties`; `doorStateProperties`; `trapdoorStateProperties`.

## Tests
- [x] `tests/unit/RedstoneConsumers.test.ts`: lamp block carries schema + default.
- [x] Lamp item places the block; cross-reference passes.
- [x] Lamp block enumerates exactly 2 states including the default.
- [x] Door block carries schema + default; item places it; cross-reference passes; enumerates
      exactly 2 states.
- [x] Trapdoor block carries schema + default (same shared `OPEN_SCHEMA` instance as door); item
      places it; cross-reference passes; enumerates exactly 2 states.
- [x] Each of the three predicates returns `true` when powered.
- [x] Each of the three predicates returns `false` when unpowered.
- [x] Lamp off-recheck scheduling not-due-before-tick case.
- [x] Lamp off-recheck scheduling fires-at-tick case.
- [x] Lamp off-recheck same-tick updates deterministically ordered (repeatable).
- [x] The three state projections match their schemas.
- [x] Characterization updates for the new blocks/items.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2188/2188 baseline) — 185 files / 2205 tests green.
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      163-piston-move-planner).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
