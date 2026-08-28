# Tasks: 213-resource-reload

## Implementation
- [x] `src/data/ResourceReload.ts`: `ResourceState` / `createInitialResourceState`.
- [x] `ReloadInput` / `ReloadProposal` / `ReloadResult` / `proposeReload` (defensive format
      checks, 212's resolution via the injected hasEntry, structured failures).
- [x] `commitReload` (version + 1, applies the proposal) / `abortReload` (identity).

## Tests
- [x] `tests/unit/ResourceReload.test.ts`: initial state.
- [x] Proposals: resources-only, data-only, both; no-input failure; unresolved-entries failure
      with exact ids; bad format version failures.
- [x] Transaction: commit version math; re-commit; abort identity.
- [x] Input immutability.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2781/2781 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      214-localization-framework).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
