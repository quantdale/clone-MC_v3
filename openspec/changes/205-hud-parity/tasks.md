# Tasks: 205-hud-parity

## Implementation
- [x] `src/ui/HudParity.ts`: `HudInputs` / `HudStatusEffect` / `HudBossBar` / `HudBars` /
      `HudState` types.
- [x] `projectHud`: hearts/hunger/armor half-icon projection with clamps.
- [x] Air bubbles (ceil, maxAir <= 0 -> 0, clamp [0, 10]).
- [x] Experience (level passthrough, progress clamp).
- [x] Effects (remainingFraction, blinking < 200); selected slot clamp; boss-bar progress clamp.

## Tests
- [x] `tests/unit/HudParity.test.ts`: bars (full/half/max clamp/negative clamp).
- [x] Air boundaries (0/1/30/31/300; zero maxAir).
- [x] Experience (level/progress clamps).
- [x] Effects (fractions at 0/199/200/600/601; blinking flags; empty list).
- [x] Selection and boss bars (clamps, passthrough, empty).
- [x] Totality on malformed inputs (NaN, negatives).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2696/2696 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      206-settings-persistence).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
