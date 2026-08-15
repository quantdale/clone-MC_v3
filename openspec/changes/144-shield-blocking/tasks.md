# Tasks: 144-shield-blocking

## Implementation
- [x] `src/simulation/ShieldBlocking.ts`: constants `SHIELD_BLOCK_ARC_DEGREES`, `SHIELD_DISABLE_TICKS`,
      `SHIELD_BLOCK_DAMAGE_REDUCTION`.
- [x] `bearingYawDegrees(fromX, fromZ, toX, toZ)`.
- [x] `angleBetweenYawDegrees(a, b)`.
- [x] `isWithinBlockingArc(defenderFacingYawDegrees, attackerX, attackerZ, defenderX, defenderZ, arcDegrees?)`.
- [x] `computeShieldDurabilityDamage(incomingDamage)`.
- [x] `ShieldBlockResult` interface.
- [x] `resolveShieldBlock(...)`.
- [x] `ShieldCooldownTracker` class (`disable`/`isDisabled`/`clear`).

## Tests
- [x] `tests/unit/ShieldBlocking.test.ts`: bearings at the four cardinal directions.
- [x] `angleBetweenYawDegrees` wraparound case.
- [x] `isWithinBlockingArc`: directly-ahead and just-inside/just-outside-arc-edge cases.
- [x] `computeShieldDurabilityDamage`: floor-of-1 and monotonicity cases.
- [x] `resolveShieldBlock`: not-raised, disabled, out-of-arc (all non-blocking), and successful
      block including the axe-disable-flag echo.
- [x] `ShieldCooldownTracker`: window gating (`isDisabled` true then false across the boundary tick)
      and `clear`.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] `tests/unit/ShieldBlocking.test.ts` passes in isolation (24/24).
- [x] Full `npm test` passes (165 files, 1866/1866).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (21/21, unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [ ] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change pointer
      to 145-passive-mob-baseline).
- [ ] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
