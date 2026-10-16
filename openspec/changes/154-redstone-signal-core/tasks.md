# Tasks: 154-redstone-signal-core

## Implementation
- [x] `src/simulation/RedstoneSignal.ts`: `Direction` type, `DIRECTIONS`, `OPPOSITE_DIRECTION`,
      `DIRECTION_OFFSETS`, `offsetInDirection`.
- [x] `MIN_SIGNAL_STRENGTH`, `MAX_SIGNAL_STRENGTH`, `clampSignal`.
- [x] `attenuate`, `strongestSignalFrom`.
- [x] `RedstonePowerSource` interface.
- [x] `getDirectPower` (six-face strong-power maximum, clamped).
- [x] `getIndirectPower` (direct power folded with each conductive neighbour's direct power,
      recursing exactly one level).
- [x] `isBlockPowered`.

## Tests
- [x] `tests/unit/RedstoneSignal.test.ts`: `OPPOSITE_DIRECTION` involution case.
- [x] `offsetInDirection` round-trip-through-opposite case.
- [x] `offsetInDirection` Minecraft-convention axis case.
- [x] `clampSignal` in-range case.
- [x] `clampSignal` out-of-range clamping case.
- [x] `clampSignal` non-finite case.
- [x] `attenuate` distance-zero case.
- [x] `attenuate` per-block decay case.
- [x] `attenuate` floor-at-zero case.
- [x] `strongestSignalFrom` maximum case.
- [x] `strongestSignalFrom` empty-list case.
- [x] `getDirectPower` single-neighbour case.
- [x] `getDirectPower` strongest-of-several case.
- [x] `getDirectPower` ignores-weak-power case.
- [x] `getDirectPower` clamps an out-of-domain source value.
- [x] `getIndirectPower` conductive-neighbour re-emission case.
- [x] `getIndirectPower` non-conductive-neighbour case.
- [x] `getIndirectPower` direct-power-wins case.
- [x] `getIndirectPower` never-below-direct-power case.
- [x] `isBlockPowered` unpowered case.
- [x] `isBlockPowered` powered-at-one case.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (29/29).
- [x] Full `npm test` passes (177 files, 2063/2063 — prior 2034 + 29 new).
- [x] `npm run build` passes (103 modules, unchanged — additive/unconsumed, mirroring 148-153's
      own identical evidence).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — nothing wired into the live
      game).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 155-redstone-wire-connectivity).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
