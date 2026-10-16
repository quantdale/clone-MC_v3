# Tasks: 161-observer

## Implementation
- [x] `src/world/BlockRegistry.ts`: `OBSERVER_SCHEMA` (facing 6-way, powered); `BlockId.Observer =
      44` with its definition and default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Observer = 44` with `placeBlock`.
- [x] `src/simulation/RedstoneObserver.ts`: `ObserverFacing` type (= 154's `Direction`);
      `OBSERVER_PULSE_START_DELAY_TICKS`, `OBSERVER_PULSE_DURATION_TICKS`.
- [x] `observedNeighborPosition` / `emissionNeighborPosition` (154's `offsetInDirection`/
      `OPPOSITE_DIRECTION`).
- [x] `scheduleObserverPulseStart` / `dueObserverPulseStarts` (047 bridge, phase 1).
- [x] `scheduleObserverPulseEnd` / `dueObserverPulseEnds` (047 bridge, phase 2).
- [x] `observerSignalStrength`; `observerStateProperties`.

## Tests
- [x] `tests/unit/RedstoneObserver.test.ts`: block carries schema + default.
- [x] Item places the block; cross-reference passes.
- [x] Block enumerates exactly 12 states including the default.
- [x] Watched/emission neighbour positions correct for all six facings; never equal.
- [x] Pulse-start scheduling not-due-before-tick case.
- [x] Pulse-start scheduling fires-at-tick case.
- [x] Pulse-start same-tick updates deterministically ordered (repeatable).
- [x] Pulse-end scheduling not-due-before-tick case.
- [x] Pulse-end scheduling fires-at-tick case.
- [x] `observerSignalStrength` powered/unpowered cases.
- [x] `observerStateProperties` projection matches the schema.
- [x] Characterization updates for the new block/item.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2176/2176 baseline) — 184 files / 2188 tests green.
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      162-redstone-consumer-blocks).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
