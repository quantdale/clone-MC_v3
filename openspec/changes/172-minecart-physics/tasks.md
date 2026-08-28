# Tasks: 172-minecart-physics

## Implementation
- [x] `src/simulation/MinecartPhysics.ts`: `MinecartState`; `MinecartWorld` seam
      (`getRailShapeAt`/`isBlocking`).
- [x] `MINECART_MAX_SPEED` (0.4) / `MINECART_GRAVITY` (0.04) / `MINECART_OFFRAIL_DECAY` (0.98).
- [x] `minecartOnRails` (rail in the cart's cell).
- [x] `tickMinecart`: straight rules (hold height, zero cross axis).
- [x] `tickMinecart`: ascent rules (vy coupled to slope, all four directions).
- [x] `tickMinecart`: corner rules (pure-axis turns; diagonal arrival stops).
- [x] `tickMinecart`: speed clamping on rails.
- [x] `tickMinecart`: off-rail gravity + horizontal decay.
- [x] `tickMinecart`: collision rule (blocking next cell -> stop dead).

## Tests
- [x] `tests/unit/MinecartPhysics.test.ts`: `minecartOnRails` true on rail / false off.
- [x] `north_south` slides along z at rail height.
- [x] `east_west` slides along x at rail height.
- [x] All eight ascent cases (up/down × four directions) with expected velocities.
- [x] All eight corner turns (pure incoming axis) with expected velocities.
- [x] Diagonal arrival at a corner stops (both components zeroed).
- [x] Rail speed clamped to `MINECART_MAX_SPEED`.
- [x] Off-rail: gravity applied, horizontal decayed.
- [x] Wall collision: cart one tick from a blocking cell stops at the pre-wall position.
- [x] Falling cart lands on solid ground (stops, zero velocity).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2336/2336 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      173-redstone-regression-worlds).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
