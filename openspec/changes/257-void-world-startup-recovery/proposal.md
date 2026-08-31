# Proposal: 257-void-world-startup-recovery

## Problem

A user can start the playable game and encounter no terrain/blocks, with the player falling into an empty world. Repository history already triaged the symptom against a fresh world and found that fresh generation is healthy; the failure is reproducible/expected when persisted IndexedDB data is classified as `legacy-unknown` or `unsupported`.

The current implementation protects incompatible saved terrain from silent replacement by refusing to generate missing columns. That integrity rule is correct in isolation, but the surrounding startup path is not safe:

1. `GamePersistence.open()` can classify a save as `legacy-unknown` or `unsupported`.
2. `World.processGeneration()` then marks missing columns Full/canonical air instead of generating them.
3. `World.getMotionBlockingHeight()` still uses the current generator for an absent column.
4. `Game.spawnPlayerSafely()` therefore chooses a height as if terrain exists even though generation is forbidden.
5. A persisted player snapshot can later overwrite the safe spawn using only seed/finite/Y-range validation, without proving supporting terrain exists.
6. `World.getReadyProgress()` also predicts the surface from the current generator instead of the persisted baseline/actual canonical column.
7. The product has no explicit recovery screen or one-click world-data recovery; the historical workaround is DevTools -> clear IndexedDB/site data.

This is a product correctness defect, not an acceptable operator workaround.

A second class of problems made this escape certification:

- Change 256 is marked VERIFIED although its own verification states full E2E was not rerun, while `AGENTS.md` declares `npm run test:e2e` part of the baseline final gate.
- `openspec/PROGRAM_STATE.json/.md` still claim publication is blocked and `origin/main` is `54d4ea0`, but GitHub `main` is already `507ce669c2912aee59b2ae231d765b25fac8a0ac`.
- The accepted risk register explicitly calls out browser-level proof gaps for real IndexedDB corruption/startup recovery (R-6).

## Goals

- Make it impossible for an incompatible/partial persisted world to transition into normal playable simulation over an unverified empty-air spawn.
- Preserve the existing no-silent-terrain-replacement invariant for legacy/unsupported saves.
- Make spawn selection and loading readiness use actual compatible canonical terrain, not a generator prediction that is invalid for the selected save baseline.
- Validate restored player state against live world support/coverage before accepting it.
- Provide an in-product recovery path so users do not need DevTools or manual site-data deletion.
- Preserve old data non-destructively until the user explicitly chooses a destructive reset.
- Add deterministic unit/integration/browser tests that reproduce the original failure from real IndexedDB state.
- Add visible/browser smoke evidence proving blocks render and the player remains supported after recovery.
- Re-run every mandatory repository gate, including the full E2E suite.
- Reconcile OpenSpec/Git publication state to current GitHub truth.
- Revalidate the current accepted risk register and promote any newly reachable/user-facing blocker into this change rather than silently carrying stale debt.

## Non-goals

- Rewriting historical world generation to emulate every pre-253 generator.
- Silently converting an unsupported terrain baseline to the current generator.
- Deleting all browser/site data as a recovery mechanism.
- Broad gameplay/parity feature work unrelated to live startup/playability.
- Opportunistically fixing low-severity accepted debt unless this campaign proves it is reachable and blocking/high severity in the current live game.
- Replacing IndexedDB, the chunk-column persistence architecture, or the rendering engine.

## Preconditions

- Change 256 is historically complete at the source level.
- Current GitHub `main` is the session source of truth; at plan authoring it is `507ce669c2912aee59b2ae231d765b25fac8a0ac`.
- Before implementation, the agent MUST fetch `main`, reconcile stale publication fields, record a new `session_start_head`, and activate Change 257 in program state.
- No production implementation may begin until this package passes the pre-implementation spec quality gate in `SPEC_AUTHORING_PROTOCOL.md`.

## Dependencies

- `src/storage/GamePersistence.ts`
- `src/storage/WorldMetadata.ts` / `WorldMetadataRepository.ts`
- `src/storage/ChunkSectionRepository.ts` and other per-world repositories used for a targeted reset/backup
- `src/world/World.ts`
- `src/engine/Game.ts`
- `src/main.ts`
- Existing world export/import facilities under `src/storage/WorldArchive.ts` / `WorldArchiver.ts`
- Existing loading/error/save-health UI
- Existing Playwright + real IndexedDB persistence harness
- Existing visual-regression/browser screenshot harness

## Proposed change

Introduce one explicit startup-compatibility decision between persistence open and playable simulation.

The decision MUST distinguish:

- current + safe to generate missing terrain;
- preserved legacy/unsupported world with sufficient persisted canonical coverage to load safely;
- recovery-required because the selected save cannot prove a safe spawn/playable coverage;
- fatal storage corruption only when the repository genuinely cannot be read safely.

For recovery-required worlds:

- keep simulation paused;
- do not accept a persisted player position into unverified air;
- show a clear recovery overlay explaining that the saved world is incompatible/partial;
- offer non-destructive export/backup where technically available;
- offer a one-click "Start Fresh World" / reset-current-world action that clears only the current world's records after explicit user confirmation, then restarts into a current generated world;
- never require DevTools.

World queries used during startup MUST be baseline-aware. For non-current baselines, an absent canonical column MUST NOT fall back to current-generator terrain for spawn/readiness truth.

## Compatibility and migration

Existing current-baseline worlds MUST load exactly as before.

Legacy/unsupported saves MUST NOT be silently rewritten to the current generation version.

A destructive reset MUST be scoped to the selected world, not the entire origin/site, and MUST require explicit user intent. When backup/export is feasible, create it before destructive mutation and surface failures before reset proceeds.

If a preserved incompatible world has sufficient canonical data to load safely, it may remain playable without regeneration; missing out-of-coverage terrain remains protected until an explicit compatible migration exists.

## Risks

- Recovery UX can accidentally become destructive: mitigate with explicit confirmation, world-scoped deletion, backup/export first where available, and failure-atomic tests.
- Height/readiness changes can regress fresh-world startup: preserve current-baseline fast path and pin fresh-world E2E.
- Persisted player safety validation can relocate legitimate players: only reject when support/coverage cannot be proven; record reason in diagnostics.
- Browser IndexedDB fixtures can be flaky: use deterministic seed, exact record construction, polling on explicit game state, and generous bounded timeouts.
- State-file edits are large and historically stale: reconcile only current truth, validate with `scripts/validate-state.mjs`, and do not rewrite historical evidence.

## Rollback strategy

Implementation slices MUST be small, individually testable commits. A slice that regresses current-world startup can be reverted independently.

Recovery/reset mutations MUST be designed so a failed operation leaves the original persisted world intact. No migration step may make destructive changes before all prerequisites/backup checks pass.

## Definition of Done

- The original empty-world/free-fall scenario is reproduced by an automated browser test before the fix or by an equivalent deterministic fixture/characterization proof.
- The fixed build never enters playable simulation over an unverified void.
- Fresh current worlds render solid terrain and spawn supported.
- Legacy/unsupported partial worlds enter recovery-required UI instead of free-fall.
- Preserved compatible-enough legacy worlds use actual persisted terrain for spawn/readiness.
- Restored player positions that have no proven support are rejected/relocated safely.
- One-click world-scoped recovery produces a fresh generated world without requiring DevTools.
- Real IndexedDB browser tests cover current, legacy-unknown, unsupported, partial/corrupt, recovery, reload, and failure-atomic cases.
- Browser visual evidence shows terrain present after fresh boot and after recovery.
- Relevant accepted-risk entries are revalidated and updated.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, state validation, file audit, and any required visual tests PASS on the final candidate.
- Program state and publication fields match fetched GitHub `main`.
- No Critical/High live-playability finding remains open.

## Advancement gate

100% of mandatory tasks and every MUST/SHALL requirement must pass. An Advancement Exception MUST NOT be used for any startup, persistence, migration, data-loss, world-generation compatibility, spawn-safety, readiness, browser-E2E, or publication-truth requirement.
