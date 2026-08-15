# Tasks: 144-shield-blocking

## Implementation
- [ ] `src/simulation/ShieldBlocking.ts`: constants `SHIELD_BLOCK_ARC_DEGREES`, `SHIELD_DISABLE_TICKS`,
      `SHIELD_BLOCK_DAMAGE_REDUCTION`.
- [ ] `bearingYawDegrees(fromX, fromZ, toX, toZ)`.
- [ ] `angleBetweenYawDegrees(a, b)`.
- [ ] `isWithinBlockingArc(defenderFacingYawDegrees, attackerX, attackerZ, defenderX, defenderZ, arcDegrees?)`.
- [ ] `computeShieldDurabilityDamage(incomingDamage)`.
- [ ] `ShieldBlockResult` interface.
- [ ] `resolveShieldBlock(...)`.
- [ ] `ShieldCooldownTracker` class (`disable`/`isDisabled`/`clear`).

## Tests
- [ ] `tests/unit/ShieldBlocking.test.ts`: bearings at the four cardinal directions.
- [ ] `angleBetweenYawDegrees` wraparound case.
- [ ] `isWithinBlockingArc`: directly-ahead and just-inside/just-outside-arc-edge cases.
- [ ] `computeShieldDurabilityDamage`: floor-of-1 and monotonicity cases.
- [ ] `resolveShieldBlock`: not-raised, disabled, out-of-arc (all non-blocking), and successful
      block including the axe-disable-flag echo.
- [ ] `ShieldCooldownTracker`: window gating (`isDisabled` true then false across the boundary tick)
      and `clear`.

## Verification
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `tests/unit/ShieldBlocking.test.ts` passes in isolation.
- [ ] Full `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:e2e` passes (21/21, unaffected).

## Checkpoint
- [ ] `verification.md` updated with real evidence; status VERIFIED.
- [ ] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change pointer
      to 145-passive-mob-baseline).
- [ ] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
