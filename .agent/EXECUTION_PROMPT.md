# Execution Campaign: Change 252 — Live World Architecture Convergence

Status: ACTIVE
Planned-From: 254d259c3193b6d7a74d04bf5a117309cd00794a
Planned-At: 2026-08-25T15:21:00+08:00
Target-Branch: main

## Mission

Make the playable single-player game actually run on the modern dimension-aware world architecture already implemented in this repository. Replace the live legacy `Chunk` / 16×64×16 block-id slab as the authoritative runtime with the existing `DimensionType` + `VerticalWorldAccess` + `ChunkColumn` + `ChunkSection` block-state model, wire the Overworld dimension through the real `Game` composition root, migrate generation/streaming/meshing/lighting/simulation/persistence consumers, and remove the split-brain state overlay/legacy-Y assumptions from live execution.

This is an implementation campaign. It is not a documentation-only hardening pass and it must not be reduced to isolated edits around the files named below.

## Why this is the highest-value next campaign

The numbered program says modern vertical storage, dimension types, modern-height world generation, dimensions, persistence, networking and final verification are already VERIFIED, but the current playable runtime still composes `World` without an active `DimensionType`, keeps block data in legacy `Chunk`, clamps many live paths to the configured 0–63 slab, and stores richer block-state mutations in a separate session overlay. The result is a structural gap between verified headless architecture and the actual game.

Concrete planner findings at `Planned-From`:

- `src/config/index.ts` still defines a 16×64×16 legacy chunk height.
- `src/world/Chunk.ts` is a flat block-id array for 16×64×16 slabs.
- `src/world/ChunkManager.ts` explicitly retains the legacy `Chunk` map as source of truth for `World.ts` callers.
- `src/world/VerticalWorldAccess.ts`, `ChunkColumn.ts`, `ChunkSection.ts`, and `DimensionType.ts` already provide modern full-height block-state storage, negative-Y-safe section routing, lazy sections, dirty propagation, heightmaps and serialization.
- `src/engine/Game.ts` creates the live `World` without passing a `DimensionType`; its later Overworld identifier is not the live world type.
- `src/world/World.ts` still contains single-slab checks, `cy === 0` import restrictions, 0..chunkHeight clamps and a separate block-state overlay despite partial dimension scaffolding.
- Historical `PROGRAM_STATE.json` entries repeatedly record modules as additive/unconsumed or having no `Game.ts` consumer. A VERIFIED roadmap entry is therefore not sufficient evidence that a capability is live.
- Current GitHub Actions on `Planned-From` are not fully green: run 32813182576 has E2E SUCCESS but `gate` FAILS at `npm run validate-state` because release-authority/publication SHAs (`67aafd3…`, `c58f972…`, `e56b83a…`) are no longer ancestors of current `HEAD`. Downstream gate steps were skipped, not failed.

## Non-negotiable execution behavior

1. Start by fetching/pruning and reconciling against current `origin/main`; do not assume `Planned-From` is still HEAD.
2. Read `AGENTS.md`, `.agent/PLANNER_HANDOFF.md`, this file, `openspec/AUTONOMOUS_GOAL.md`, `PROGRAM_STATE.json`, `PROGRAM_STATE.md`, `CHANGE_SEQUENCE.md`, `CHANGE_SEQUENCE_OVERRIDES.md`, `REVIEW_HANDOFF.md`, `SPEC_AUTHORING_PROTOCOL.md`, and every artifact under `openspec/changes/252-live-world-architecture-convergence/`.
3. Before production implementation, formally authorize/activate Change 252 in the native OpenSpec control plane. Append the exact change name/outcome to the post-terminal sequence and reconcile JSON/Markdown state. Repair any post-terminal validator/schema assumptions required for a truthful ACTIVE state rather than weakening validation.
4. Treat the current failed `validate-state` CI as a real baseline defect. Do not hide it, delete evidence, force-push history, or mark it resolved merely because ACTIVE-state validation bypasses terminal release-authority checks. Preserve orphaned historical evidence in an explicitly historical/non-authoritative representation and establish lineage-valid release authority during final closure.
5. Perform a whole-codebase consumer/dependency audit before implementation. Trace every production consumer of legacy `Chunk`, `CHUNK_DIMENSIONS.height`, `chunk.cy`, block-state overlay data, hard-coded Y bounds, chunk keys, chunk streaming, meshing, lighting, collision/raycast, random/scheduled ticks, entities/block entities, persistence, imports/exports, networking snapshots, tests and E2E hooks. Do not audit only recently changed files.
6. Implement the campaign through the real playable path. Headless adapters or tests alone do not satisfy the mission.
7. After implementation, perform another whole-codebase audit specifically looking for stale legacy consumers, duplicated sources of truth, new regressions, architecture drift, data-loss risk and performance blowups caused by the migration.
8. Continue through all safe independent work. Stop only for a genuine durable blocker defined by repository goal rules; do not stop because one workstream completed.
9. Do not implement unrelated new game content, Nether/End live switching, Wither content, multiplayer UI, or broad visual redesign in this campaign.
10. End only after required validation, state reconciliation, detailed full-session commit reporting, direct publication to `origin/main`, and remote-head verification.

## Target architecture

### Authoritative world storage

- `VerticalWorldAccess`/`ChunkColumn`/`ChunkSection` become the authoritative live block-state store.
- Every live block read/write operates on `BlockState`, with `BlockId` projected only where a legacy API genuinely requires an id.
- The session-only `World.stateOverlay` must be removed from the authoritative path. Temporary compatibility adapters are allowed only if they have an explicit removal task inside this campaign and cannot diverge from the canonical store.
- The live Overworld uses `OVERWORLD_DIMENSION_TYPE` (`minY=-64`, `height=384`) and its derived section range. Out-of-range reads resolve safely; writes do not allocate or mutate.

### Streaming and generation

- Loaded residency is column/section aware. Do not materialize all 24 sections in every column merely because the dimension is 384 blocks high.
- Reuse the modern world-generation pipeline (`OverworldTerrain` and subsequent verified stages) where possible rather than scaling the old 64-high generator by six.
- Generation results must populate canonical block states across the true Overworld Y range and preserve deterministic seed behavior.
- Existing spawn/readiness semantics must remain bounded and usable; if spawn selection depends on old sea-level/Y constants, migrate it deliberately.

### Meshing and lighting

- Mesh ownership/versioning must align to 16³ sections and existing `ChunkSection.meshVersion`/dirty-section semantics.
- Edits at section/column boundaries must invalidate the correct neighbors without remeshing an entire 384-high column unnecessarily.
- Skylight, block light and AO/tint sampling must use dimension bounds and section-local storage. No implicit 0..63 clamp may remain in live lighting paths.
- Stale worker results must remain rejectable by identity/version checks.

### Simulation and interaction

- Collision, raycast, mining, placing, falling blocks, random ticks, scheduled ticks, fluids, redstone-facing world access, entities/block entities and gameplay systems must work across negative Y and section boundaries where they consume world blocks.
- Preserve existing live furnace behavior from Change 251 through open/operate/tick/persist/unload/reload/break flows.
- Boundary contract must be explicitly tested at `y=-65,-64,-1,0,15,16,63,64,319,320` as applicable.

### Persistence and compatibility

- Reuse the existing versioned `ChunkSectionRepository`/column codecs and migration infrastructure instead of inventing a parallel save format.
- Existing user worlds/legacy sparse edits must not be silently lost. Define and implement deterministic one-way migration or compatibility loading, with idempotency and partial-failure behavior covered by tests.
- Block-state properties must survive save/reload; no downgrade to bare block ids on the live path.
- Dirty save behavior must remain bounded and failure-visible. Do not reintroduce the data-loss classes previously fixed by persistence hardening.

### Performance/resource constraints

- Do not create a 6× residency/geometry explosion by eagerly allocating full-height data for every loaded column.
- Empty sections stay lazy; reads do not allocate.
- Meshing, generation and lighting work must be section-scoped/budgeted and compatible with current worker/backpressure/stale-result machinery.
- Rebaseline `MemoryResourceBudget`, release performance measurements and relevant streaming bounds when the old chunk-count semantics no longer describe the real resource model. Do not merely raise ceilings to silence regressions.

## Ordered workstreams

### A. Rebaseline, governance and characterization

- Capture branch/HEAD/origin/worktree/recent commits/open PR/issue state.
- Reproduce the current canonical CI/state failure and document exact root cause.
- Authorize Change 252 in `CHANGE_SEQUENCE.md`; activate it in `PROGRAM_STATE.json` and `PROGRAM_STATE.md` without rewriting 001–251 history.
- Make `validate-state` model post-terminal ACTIVE epochs truthfully, including historical release evidence whose commits are outside the current ancestry. Never weaken exact-SHA release proof for the eventual new terminal candidate.
- Build a machine-checkable legacy-consumer inventory and characterization tests before migration.

### B. Canonical block-state world core

- Refactor `World` around one dimension-aware block-state access layer.
- Convert or replace `ChunkManager` so canonical residency is `(chunkX,chunkZ)` columns with section data, not `(cx,cy,cz)` legacy slabs.
- Eliminate live state-overlay dual truth and explicit `cy===0` / 0..64 assumptions.
- Preserve public seams used by gameplay while migrating them to projections over canonical state.

### C. Modern Overworld generation and streaming

- Wire `OVERWORLD_DIMENSION_TYPE` from the real composition root.
- Populate canonical columns/sections from the modern worldgen pipeline across `[-64,319]`.
- Reconcile preload/readiness/streaming/unload semantics with column residency and lazy sections.
- Preserve deterministic edits over regenerated terrain and safe unload/reload behavior.

### D. Section rendering and lighting convergence

- Migrate mesh construction, mesh identity/versioning, geometry bookkeeping and neighbor invalidation to section units.
- Feed canonical block states and dimension-aware light samples into the renderer.
- Keep worker/stale-job correctness and dispose GPU resources on unload/replacement.

### E. Gameplay/simulation consumer migration

- Migrate every audited world consumer away from old slab bounds/data access.
- Explicitly cover negative-Y and section-boundary collision/raycast/mining/placing/falling/ticks/fluids/block entities.
- Prove the Change-251 furnace live path remains correct.

### F. Persistence and migration

- Persist/load canonical columns through the verified IndexedDB repositories and migration chain.
- Convert legacy sparse/block-id-only data without loss; preserve block-state properties.
- Validate abrupt close, quota/write failure, import/export and unload/reload against the new live path.

### G. Resource/performance reconciliation

- Reconcile memory/geometry/job metrics with columns+sections.
- Run dense/edit/exploration/load/save stress tests and investigate regressions rather than masking them with budget inflation.
- Keep empty-section allocation and remesh work bounded.

### H. Whole-repository post-migration audit and certification

- Re-scan the entire repository for direct production imports/usages of legacy `Chunk`, old chunk-height Y clamps, `cy===0`, state-overlay authority, or duplicated chunk stores.
- Classify every remaining occurrence as removed, test-only, migration-only, intentional compatibility adapter with expiry, or blocker.
- Run the full required repository gate plus targeted new integration/E2E tests.
- Reconcile OpenSpec/design/tasks/verification/PARITY_MATRIX/state against actual implementation.
- Establish a new lineage-valid release candidate and exact-SHA canonical CI evidence before returning the program to COMPLETE/VERIFIED.

## Acceptance criteria

The campaign is complete only when all of the following are true:

- The actual playable `Game` constructs and uses a dimension-aware Overworld with canonical `ChunkColumn`/`ChunkSection` block states.
- Live world reads/writes cover the Overworld `[-64,319]` range and no production gameplay path assumes 0..63 solely because of the legacy chunk model.
- Legacy `Chunk` is not an authoritative production store. Any remaining reference is explicitly non-authoritative/test/migration-only and audited.
- The separate live block-state overlay is gone as a source of truth.
- Modern worldgen feeds the canonical storage path and deterministic seed behavior remains tested.
- Section-scoped meshing/dirtying/stale-result handling works across horizontal and vertical boundaries.
- Lighting and gameplay queries are dimension-aware.
- Existing saves/edits migrate or load compatibly without silent loss, including stateful blocks.
- Change-251 furnace behavior and all previously working core gameplay remain passing.
- New integration/E2E coverage proves negative-Y traversal/edit/save-reload and a vertical section-boundary edit/render path.
- Pre- and post-implementation whole-codebase audits are recorded and no unresolved Critical/High correctness, data-loss, security or architecture regression remains.
- `npm run validate-state`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`, dependency audits, file-audit checks, and `npm run test:e2e` all satisfy repository thresholds with zero mandatory skips unless a repository-defined environment-only exception is explicitly evidenced.
- The exact published terminal candidate has canonical GitHub Actions `gate` and `e2e` SUCCESS, and release-authority evidence references only lineage-valid commits under the repaired schema.
- Change 252 is VERIFIED/archived, state and parity evidence match reality, `.agent/EXECUTION_PROMPT.md` is marked COMPLETED, and `origin/main` equals the reported published head.

## Completion and Git requirements

Use detailed commits that explain the complete engineering checkpoint, including architecture migrated, compatibility behavior, tests/evidence, unresolved non-blocking debt and next action. Never force-push or rewrite published history. Publish coherent checkpoints directly to `origin/main` as required by repository policy. The final report must include `session_start_head`, `published_head`, active change/status, exact completed/total task count, validation results, blockers/debt, canonical CI evidence and next exact action.
