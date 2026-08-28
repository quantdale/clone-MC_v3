# Tasks: 189-gamerule-framework

## Implementation
- [x] `src/simulation/GameRuleFramework.ts`: `GAMERULE_VERSION` (1); `GameRuleKind` /
      `GameRuleValue` / `GameRuleDefinition`.
- [x] `GAME_RULE_KEYS` (9) / `GameRuleKey` / `GameRuleStore`; the frozen rule registry with vanilla
      kinds and defaults.
- [x] `gameRuleDefinitions` / `gameRuleDefinition`.
- [x] `createDefaultGameRules` / `getGameRule`.
- [x] `isValidGameRuleValue` / `setGameRule` (identity no-op on illegal values).
- [x] `parseGameRuleValue` (boolean case-insensitive, integer strict, string verbatim).
- [x] `SerializedGameRules` / `serializeGameRules` / `deserializeGameRules` (validated).

## Tests
- [x] `tests/unit/GameRuleFramework.test.ts`: 9-rule registry (kinds + defaults).
- [x] Default store values.
- [x] Set with immutability; illegal values and same-value sets are identity no-ops.
- [x] `isValidGameRuleValue` per kind (incl. unknown key).
- [x] Parsing: booleans (case/trim), integers (strict, negative, rejects 1.5/abc), unknown key null.
- [x] Persistence round-trip.
- [x] Malformed rejection (null, bad version, wrong kinds, missing keys, unknown key).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2490/2490 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 190-command-parser).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
