# Tasks: 201-ambient-audio

## Implementation
- [x] `src/simulation/AmbientAudioFramework.ts`: `AmbientEnvironment` / `AmbientEnvironmentDef` /
      `AMBIENT_ENVIRONMENTS` (6 original entries) + `ambientEnvironment` lookup.
- [x] Music constants (`MUSIC_INTERVAL_MIN` 12000, `MUSIC_INTERVAL_MAX` 24000, day/night events).
- [x] `AmbientState` + `createDefaultAmbientState(rng)` (rolls via injected rng).
- [x] `tickAmbient` (decrement-then-fire; music precedence; weather/environment cue selection;
      environment-change re-roll; one cue per tick; no mutation).

## Tests
- [x] `tests/unit/AmbientAudioFramework.test.ts`: table (6 entries, order, validity, lookup);
      music constants.
- [x] Default state roll math with fixed rng.
- [x] Music firing (day/night; re-roll; precedence with both at 0).
- [x] Cues (environment clear; rain; thunder; re-roll).
- [x] Environment change (cue delay re-roll, music untouched).
- [x] Quiet ticks (null cue, decrements, input immutability).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2643/2643 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      202-inventory-screen-parity).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
