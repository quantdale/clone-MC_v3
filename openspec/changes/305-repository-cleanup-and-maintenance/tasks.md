# Tasks: 305-repository-cleanup-and-maintenance

## T1 — Baseline and freshness

- [x] **T1.1.** Verify authoritative remote freshness: `git fetch --all --prune`,
  record `origin/main` SHA, confirm local HEAD equals it, confirm a clean worktree
  and a single linked worktree. Record the baseline statement in `verification.md`.
- [x] **T1.2.** Run the baseline gate and archive the raw logs:
  `npm run verify:deps`, `npm run validate-state`, `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run test:coverage`, `npm run build`,
  `node scripts/check-release-bundle.mjs`, `npm run test:e2e`.
- [x] **T1.3.** Record the authoritative CI state of the tip
  (`gh run list --branch main`, `gh run view <id> --json jobs`) and identify the
  failing step and its cause. Record it as a pre-existing failure, not a
  maintenance regression.

## T2 — Toolchain: clear the high-severity advisory

- [x] **T2.1.** Measure the advisory set (`npm audit --json`) and map each advisory
  to the declared version range.
- [x] **T2.2.** Raise `vite` to `^6.4.6`, `vitest` and `@vitest/coverage-v8` to
  `^4.1.12` (patch-level only), then rebuild the tree with `npm ci`.
- [x] **T2.3.** Confirm `npm run verify:deps` exit 0 and the installed versions equal
  the locked versions.
- [x] **T2.4.** Confirm `npm audit --audit-level=high` exit 0 and
  `npm audit --omit=dev` exit 0; record the remaining dev-only moderate set with the
  reason it is tolerated.
- [x] **T2.5.** Re-run `npm test` and `npm run test:coverage` on the upgraded
  toolchain; record the unit counts and the four coverage metrics against the floors.
- [x] **T2.6.** Run `npm run build` + `node scripts/check-release-bundle.mjs` and
  record the bundle sizes for comparison after the code batches.

## T3 — Dead-code removal (unreferenced, uncontracted exports)

- [x] **T3.1.** Re-run the whole-repository export census at the current HEAD and
  archive the output as the before-state evidence.
- [x] **T3.2.** Remove `aoPatternId` (`src/rendering/GreedyMesher.ts`).
- [x] **T3.3.** Remove `translucentSortKeys` and `partitionQuadsByStream`
  (`src/rendering/TranslucentGeometry.ts`), keeping `sortTranslucentBackToFront`,
  `partitionQuadsByLayer` and `quadCentroid` which the live mesher and the unit
  suite use.
- [x] **T3.4.** Remove `QUEUE_KINDS` (`src/rendering/RenderPerformanceMonitor.ts`)
  and `ATLAS_SIZE` (`src/rendering/TextureAtlas.ts`).
- [x] **T3.5.** Remove `UNPOWERED_WIRE_POWER` (`src/simulation/RedstoneWire.ts`).
- [x] **T3.6.** Remove `chunkLifecycleName` and its private `CHUNK_LIFECYCLE_NAMES`
  table (`src/world/ChunkStatus.ts`).
- [x] **T3.7.** Remove `worldXToSection` and `worldZToSection`
  (`src/world/WorldCoordinates.ts`), keeping `worldYToSection` which the boundary
  matrix suite pins.
- [x] **T3.8.** Remove the abandoned wither-skull explosion path
  (`computeSkullExplosion`, `isProtectedBlock`, `skullExplosionEntityDamage` and
  private `isProtectedWrapped`) from `src/simulation/WitherSkull.ts`, together with
  the `ExplosionCore` imports that only they used.
- [x] **T3.9.** Remove the unused `LAYER_TO_STREAM`/`streamForRenderLayer` layer-to-stream
  mapping and its now-unused `MeshStreamName` import from `src/rendering/RenderLayer.ts`
  (found during implementation: it was the only caller of the removed
  `partitionQuadsByStream`, and the live meshing path resolves streams through
  `renderStream`/`MESH_STREAM_NAMES` instead).
- [x] **T3.10.** Run `npm run typecheck`, `npm run lint` and the affected unit suites;
  confirm no reference to any removed identifier remains in `src/`, `tests/` or
  `scripts/`.

## T4 — One definition per duplicated value

- [x] **T4.1.** Import `WITHER_MAX_SKULLS` in `src/engine/Game.ts` and delete the
  local `WITHER_SKULL_CAP`; confirm the cap expression is behaviour-identical.
- [x] **T4.2.** Use `WITHER_RECORD_VERSION` in `SerializedWither` and
  `serializeWither`; prove a persisted record still carries `v: 1`.
- [x] **T4.3.** Make `damageWither` call `isWitherArmored`; prove the armour
  immunity, phase-change and threshold scenarios stay green.

## T5 — Helper consolidation

- [x] **T5.1.** Export `promisifyRequest` from
  `src/storage/WorldMetadataRepository.ts`; import it in
  `BlockEntityRepository`, `ChunkEditRepository`, `ChunkSectionRepository`,
  `EntityRepository`, `PlayerStateRepository` and `GamePersistence` (replacing the
  local `awaitRequest`).
- [x] **T5.2.** Add `src/simulation/MovementGuards.ts` with `Position` and
  `isFinitePosition`; make `MovementAuthority` and `MovementReconciler` re-export
  `Position` and import the guard, keeping the existing test import paths working.
- [x] **T5.3.** Add `src/data/PackManifestPaths.ts` with `isValidRelativePath`; make
  `DataPackManifest` and `ResourcePackManifest` import it.
- [x] **T5.4.** Export `emptyGamepad` from `src/simulation/InputCoordinator.ts`;
  make `InputWiring` import it and delete `disconnectedGamepadFrame`.
- [x] **T5.5.** Run the storage, movement, manifest and input suites plus
  `npm run typecheck` and `npm run lint`; confirm the consolidated bodies are
  byte-identical to the replaced ones.

## T6 — Duplicate and obsolete artifacts

- [x] **T6.1.** Delete `openspec/changes/256-production-readiness-hardening`
  (the archived copy at
  `openspec/changes/archive/2026-08-31-256-production-readiness-hardening` remains
  authoritative); confirm the archive is untouched.
- [x] **T6.2.** Delete `playwright.253.config.ts`; confirm no npm script, workflow,
  test or script consumed it and that `npm run test:e2e` still resolves
  `playwright.config.ts`.
- [x] **T6.3.** Update every prose citation of the removed paths
  (`PARITY_MATRIX.md` C256 evidence cell and any archive note) so no reference
  points at a deleted file.

## T7 — Enforce the unreferenced-source gate

- [x] **T7.1.** Rewrite `scripts/orphan-check.mjs` with the reviewed allow-list
  (`src/main.ts`, `src/rendering/MeshWorkerEntry.ts`,
  `src/worldgen/WorldgenWorkerEntry.ts`), a `--root` flag for testability, and
  `exit 1` on an unexpected orphan.
- [x] **T7.2.** Prove the pass path on the real tree (`npm run verify:orphans` exit 0,
  three allow-listed entries reported).
- [x] **T7.3.** Prove the fail path on a synthetic root (one allow-listed entry plus
  one extra importer-free file → exit 1 naming the extra file).
- [x] **T7.4.** Pin the gate contract in `tests/unit/VerificationGateWiring.test.ts`:
  allow-list contents, exit 0 on the real tree, exit 1 on the synthetic orphan.

## T8 — Records and documentation

- [x] **T8.1.** Add `C298`–`C304` rows to `PARITY_MATRIX.md` citing each change's
  VERIFIED `verification.md`; update the header scope line, the summary counts and
  the coverage statement to 001–304 while keeping C258 `deferred`.
- [x] **T8.2.** Update `ONBOARDING.md`: the locked coverage-provider version and the
  enforced orphan-gate description (allow-list + failure behaviour).
- [x] **T8.3.** Correct the stale coverage-provider note in `vitest.config.ts` if it
  still contradicts the locked version, without changing any threshold.
- [x] **T8.4.** Regenerate/repair the reviewed file-audit manifest so it is a
  bijection with the post-change `git ls-files`; run
  `npm run verify:file-audit` to PASS.

## T9 — Spec, state and sequence artifacts

- [x] **T9.1.** Author this change's `proposal.md`, `design.md`,
  `specs/repository-maintenance/spec.md`, `tasks.md` and `verification.md` before
  production edits, per `openspec/SPEC_AUTHORING_PROTOCOL.md`.
- [x] **T9.2.** Add the change row to `openspec/CHANGE_SEQUENCE.md` and an override
  section to `openspec/CHANGE_SEQUENCE_OVERRIDES.md` recording activation,
  authorization and outcome.
- [x] **T9.3.** Update `openspec/PROGRAM_STATE.json` and `.md` with the coherent
  checkpoint: active change, current status, completion, last completed task,
  validations, blockers, Git SHAs, modified files and the next exact action.

## T10 — Final gate and publication

- [ ] **T10.1.** Full mandatory gate on the final tree: `npm run verify:deps`,
  `npm run validate-state`, `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run test:coverage`, `npm run build`, `node scripts/check-release-bundle.mjs`,
  `npm run verify:file-audit`, `npm run verify:orphans`,
  `npm run verify:mcp`, `npm run verify:visual-goldens`, `npm run test:e2e`, plus
  `npm run test:perf:multiplayer` run in isolation.
- [ ] **T10.2.** Confirm `git diff --numstat -- tests/visual-golden/` is empty and
  the coverage floors are unchanged.
- [ ] **T10.3.** Final freshness gate: re-fetch `origin/main`, confirm no new upstream
  commits overlap the changes, and that the candidate is based on the current tip.
- [ ] **T10.4.** Review the complete diff for unintended files, secrets or generated
  artifacts; commit in coherent batches and push normally to `origin/main`.
- [ ] **T10.5.** Verify the remote head after publication and record
  `published_head`.
- [ ] **T10.6.** Confirm campaign temp resources are removed and the pre-existing
  branch/worktree/stash inventory is unchanged, then reconcile `verification.md` and
  the state files with the published result.
