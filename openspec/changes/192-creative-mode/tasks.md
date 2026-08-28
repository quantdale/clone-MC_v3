# Tasks: 192-creative-mode

## Implementation
- [x] `src/simulation/GameModeFramework.ts`: `GAME_MODES` tuple + `GameMode` type.
- [x] `GameModeState`, `createDefaultGameModeState` (survival), `setGameMode` (new state on change,
      identity no-op on same/invalid).
- [x] `parseGameMode` (case-insensitive, trimmed; `null` outside the set).
- [x] Behavior predicates: `canFly`, `instantBlockBreak`, `depletesItems`, `survivalStatsDeplete`.
- [x] `serializeGameModeState` / `deserializeGameModeState` (version 1, validate-before-accept,
      descriptive throws).

## Tests
- [x] `tests/unit/GameModeFramework.test.ts`: mode set exact order; default state; deep-equality
      with `CoreCommands.GAMEMODES`.
- [x] `setGameMode`: change yields a new object; same mode yields the identical object.
- [x] `parseGameMode`: `'creative'`, `'  CREATIVE  '`, `'hard'`, `''`.
- [x] Behavior table: 4 modes x 4 predicates (flight/instant/depletion/survival-stats).
- [x] Persistence: round-trip; non-object; bad version; unknown mode; unknown key — each rejection
      named.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2525/2525 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 193-hardcore-mode).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
