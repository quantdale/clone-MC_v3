# Tasks: 191-core-commands

## Implementation
- [x] `src/simulation/CoreCommands.ts`: `GAMEMODES` / `WEATHERS` const tuples with derived types.
- [x] `CommandEffect` union (`set_time`/`add_time`/`set_weather`/`set_gamemode`/`give_item`/`teleport`).
- [x] `CoreCommandResult` union (`ok`/`error`/`denied`).
- [x] Five `CommandSpec`s at permission level 2 (`time`, `weather`, `gamemode`, `give`, `tp`) and
      `coreCommandSpecs()`.
- [x] `runHandler` with semantic validation (time actions, weather/gamemode value sets, give count
      default/positivity).
- [x] `executeCoreCommand`: split -> lookup -> permission check (before parse) -> typed parse ->
      handler -> effect.

## Tests
- [x] `tests/unit/CoreCommands.test.ts`: registry shape (five commands, level 2, mode/weather sets).
- [x] Time: set/add effects; unknown action; non-integer value parse error.
- [x] Weather: all three values; unknown weather rejected.
- [x] Gamemode: survival/creative effects; unknown gamemode rejected.
- [x] Give: explicit count; default count 1; non-positive count rejected.
- [x] Tp: float coordinates effect; missing argument error.
- [x] Permission: level 1 denied before parsing (well-formed command); level 2 allowed.
- [x] Dispatch: unknown command; empty input.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (13 tests).
- [x] Full `npm test` passes (no regression against the prior 2512/2512 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 192-creative-mode).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
