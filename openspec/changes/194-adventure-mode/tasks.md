# Tasks: 194-adventure-mode

## Implementation
- [x] `src/simulation/AdventureModeRules.ts`: `canBreakBlock(mode, blockId, allowed)` — the four-mode
      vanilla table.
- [x] `canPlaceBlock(mode, blockId, allowed)` — same table.
- [x] `resolveBlockPermissionSet(directIds, tagIds, lookupTag)` — deduplicated union, unknown tags
      skipped, empty inputs -> empty set.

## Tests
- [x] `tests/unit/AdventureModeRules.test.ts`: break table (survival/creative true, spectator false,
      adventure set-dependent, empty set grants nothing).
- [x] Place table (mirror).
- [x] Resolution: direct ids; tag expansion; missing tag skipped; dedupe; empty inputs.
- [x] Composed flow: resolved set feeds `canBreakBlock`/`canPlaceBlock` for an adventure player.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2555/2555 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 195-spectator-mode).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
