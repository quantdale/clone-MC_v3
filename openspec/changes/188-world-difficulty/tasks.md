# Tasks: 188-world-difficulty

## Implementation
- [x] `src/simulation/WorldDifficulty.ts`: `DIFFICULTY_LEVELS` (4) / `DifficultyLevel` /
      `DEFAULT_DIFFICULTY` ('normal').
- [x] `DifficultyDefinition` + frozen table (peaceful: no spawns, 0/0, no starve; easy 0.5/0.5;
      normal 1/1; hard 1.5/1.5; spawns + starve true except peaceful).
- [x] Five accessors (definition + 4 knobs).
- [x] `parseDifficultyLevel` (trim + lowercase; null for unknown/null).
- [x] `SerializedDifficulty` / `serializeDifficulty` / `deserializeDifficulty` (validated).

## Tests
- [x] `tests/unit/WorldDifficulty.test.ts`: four levels + default.
- [x] Peaceful full definition; easy/normal/hard knobs.
- [x] All accessors.
- [x] Parsing: case/trim variants; unknown text and null → null.
- [x] Persistence round-trip; malformed rejection (null, bad version, unknown/non-string level).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2482/2482 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 189-gamerule-framework).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
