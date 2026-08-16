# Tasks: 222-shared-simulation-package-boundary

## Implementation
- [x] `src/simulation/SimulationPackageBoundary.ts`: `SimulationModule` /
      `SimulationPackageBoundary` + `createSimulationPackageBoundary` /
      `validateSimulationPackageBoundary` (version, unique names, flags, deps, checksum;
      descriptive throws).
- [x] `boundaryViolations` (deterministic-with-deps; headlessSafe-with-dom/indexeddb) /
      `sharableModules` (the shareability rule) / `moduleByName`.

## Tests
- [x] `tests/unit/SimulationPackageBoundary.test.ts`: creation + round-trip; defaults.
- [x] Every rejection with exact messages.
- [x] Violations (both classes, order); clean modules yield none.
- [x] sharableModules filter; moduleByName; empty boundary.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2854/2854 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      223-network-protocol-codecs).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
