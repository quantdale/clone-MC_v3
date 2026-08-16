# Tasks: 221-current-release-delta

## Implementation
- [x] `src/data/ReleaseDelta.ts`: `RELEASE_CONTENT_KINDS` (10) / `BehaviorOverride` /
      `ReleaseDelta` + `createReleaseDelta` (release, kinds, override validation; defaults).
- [x] `contentForKind` / `isEnabled` / `overridesFor` (registration order, total).

## Tests
- [x] `tests/unit/ReleaseDelta.test.ts`: creation incl. defaults (all kinds empty).
- [x] Every rejection with exact messages.
- [x] Queries (contentForKind incl. absent kinds, isEnabled, overridesFor incl. empty).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2846/2846 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      222-shared-simulation-package-boundary).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
