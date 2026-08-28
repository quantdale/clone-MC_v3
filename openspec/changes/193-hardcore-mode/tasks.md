# Tasks: 193-hardcore-mode

## Implementation
- [x] `src/simulation/HardcoreFramework.ts`: `HardcoreState { hardcore: boolean }` and
      `createDefaultHardcoreState` (disabled).
- [x] `setHardcore` (new state on change, identity no-op on same value).
- [x] Difficulty lock: `locksDifficulty` and `effectiveDifficulty` (always `'hard'` when enabled,
      consuming 188's `DifficultyLevel`).
- [x] Death-world rules: `forcesPermanentDeath` and `respawnModeAfterDeath` (always `'spectator'`
      when enabled, consuming 192's `GameMode`).
- [x] `serializeHardcoreState` / `deserializeHardcoreState` (version 1, validate-before-accept,
      descriptive throws).

## Tests
- [x] `tests/unit/HardcoreFramework.test.ts`: default disabled; set change/new-object vs
      same-value/identical-object.
- [x] Difficulty lock: locks flag both states; effective level for every configured level when
      enabled; pass-through when disabled.
- [x] Death-world: permanent-death flag both states; post-death mode for every mode when enabled;
      pass-through when disabled.
- [x] Persistence: round-trip both states; rejections (non-object, bad version, non-boolean,
      unknown key) each named.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2541/2541 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 194-adventure-mode).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
