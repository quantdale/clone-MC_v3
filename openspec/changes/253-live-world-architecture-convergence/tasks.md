# Tasks: 253-live-world-architecture-convergence

Status: PLANNED — all implementation/evidence tasks intentionally begin unchecked.

Rules:

- Check `[x]` only after implementation **and** named evidence exist.
- If later evidence disproves a checked task, reopen it.
- Production edits MUST NOT begin until Phase 0 activation/spec gates are complete.
- Fix root causes; do not weaken requirements/tests/budgets to manufacture green results.
- The 12-hour pacing in `agent-prompts.md` is a scheduling aid, not permission to skip unfinished mandatory work.
- Continue safe independent work for the full requested execution window; if implementation finishes early, spend remaining capacity on post-audit, adversarial testing, profiling, hardening, documentation reconciliation and exact release evidence rather than inventing unrelated features.

## Phase 0 — Rebaseline, activation, governance, and spec gate

- [x] Fetch/prune `origin`, reconcile local `main` to current `origin/main`, and record `session_start_head`, remote head, worktree, recent commits, open PR/issue context relevant to 253.
- [x] Read `AGENTS.md`, `openspec/AUTONOMOUS_GOAL.md`, canonical program state JSON/MD, sequence, overrides, review handoff, authoring protocol, `.agent/EXECUTION_PROMPT.md`, and every file in this 253 package.
- [x] Reproduce the current pre-existing `validate-state`/canonical-CI lineage failure on the exact starting head and record failed vs skipped steps.
- [x] Add `253-live-world-architecture-convergence` to the post-terminal sequence without rewriting 001–252/254 history; preserve the documented fact that owner-authorized 254 executed before reserved 253.
- [x] Activate 253 as the sole ACTIVE change in `openspec/PROGRAM_STATE.json` and `PROGRAM_STATE.md`; keep 254 as last completed until 253 verifies.
- [x] Repair `scripts/validate-state.mjs`, state schema, and/or CI checkout-history assumptions so a post-terminal ACTIVE epoch can validate truthfully under CI.
- [x] Preserve strict final exact-SHA/ancestry/canonical `gate`+`e2e` release proof; do not bypass or delete historical evidence merely to make validation pass.
- [x] Run the full pre-implementation checklist from `SPEC_AUTHORING_PROTOCOL.md` against proposal/design/tasks/spec/verification/audit findings and fix every violation.
- [x] Run `npm run validate-state` after activation/governance repair and record exact output in `verification.md`.
- [x] Record baseline `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and targeted Change-254 benches before world-production edits where environment permits.

## Phase 1 — Exhaustive repository inventory and characterization

- [x] Extend/reuse repository audit tooling (prefer `scripts/audit-inventory.mjs` where suitable) to scan every tracked source/test/config/script/OpenSpec file for legacy-world patterns defined by `audit-findings.md`.
- [x] Emit a machine-readable 253 pre-migration inventory containing file, symbol/line where possible, subsystem, pattern, risk, disposition, owning task, and notes.
- [x] Inventory every production import/reference to legacy `Chunk` and `ChunkManager`.
- [x] Inventory every height/range assumption derived from `CONFIG.chunk.height`, `seaLevel`, `bedrockY`, explicit 0..63/64 clamps, `cy === 0`, vertical `cy`/`chunkY`, or old slab keys.
- [x] Inventory every duplicate writable state surface including `stateOverlay`, block-state maps/caches, edit maps, and bare-ID stores.
- [x] Trace world reads/writes through generation, streaming, readiness/spawn, meshing, lighting, collision, raycast, mining/placing, falling blocks, scheduled/random ticks, fluids, block behavior, redstone-facing access, entities, item entities, block entities, persistence, import/export, networking/shared simulation, debug hooks, resource metrics and E2E.
- [x] Assign every relevant occurrence one allowed disposition: `REMOVE`, `MIGRATE`, `PROJECTION_ONLY`, `MIGRATION_ONLY`, `TEST_ONLY`, `INTENTIONAL_COMPATIBILITY_WITH_EXPIRY`, or `BLOCKER`.
- [x] Add characterization tests for current live `World` block/state APIs and the overlay/slab interaction before removing it.
- [x] Add fixtures/tests for every durable legacy world/edit format accepted by `GamePersistence` and legacy migration paths, including malformed/partial records.
- [x] Add/confirm canonical coordinate tests for Y `-65,-64,-33,-32,-17,-16,-1,0,15,16,31,32,63,64,319,320` and negative X/Z boundaries.
- [x] Prove absent-air reads and out-of-range reads/writes do not allocate canonical sections.
- [x] Capture deterministic modern-worldgen baselines for representative positive/negative chunk coordinates and section boundaries.
- [ ] Capture resource baselines: resident legacy units, allocated canonical sections where used, geometries, pending generation/mesh/light/save jobs, dirty units, memory, startup, exploration/teleport churn and dense edits. Deterministic ownership, startup, churn, dense-edit, queue, and production-mesher baselines are recorded; browser heap/renderer/entity sampling remains blocked by a standalone headless-Chrome 2D-canvas `fillRect()` hang before app boot.
- [x] Capture Change-254 benchmark results on the starting head and identify which benches remain semantically comparable after migration.

## Phase 2 — Canonical live block-state authority

- [x] Introduce/refine a thin dimension-aware live-world storage facade over `VerticalWorldAccess`/`ChunkColumn`/`ChunkSection`; do not create a third backing store.
- [x] Make `World` own/use the canonical storage as the single writable block-state authority.
- [x] Preserve `World.getBlock()` only as a projection from canonical `BlockState.blockId` where compatibility requires it.
- [x] Route block-ID writes through registered default `BlockState` and stateful writes through canonical `setBlockState`.
- [x] Remove `World.stateOverlay` (or equivalent) as an independent writable/read authority.
- [x] Convert/replace `ChunkManager` residency so authoritative ownership is horizontal `(chunkX,chunkZ)` columns with lazy vertical sections.
- [x] Remove production `cy === 0`, legacy 0..63 range guards, and slab-only import/edit assumptions from canonical world operations.
- [x] Ensure all negative X/Y/Z coordinate routing uses existing floor-division/local-coordinate helpers.
- [x] Make canonical mutation update heightmaps, dirty sections, dirty columns, mesh versions and face-neighbor invalidation through one mutation path.
- [x] Ensure absent-air reads do not call APIs that eagerly materialize sections (e.g. distinguish read-only lookup from `getSection()` if needed).
- [x] Define dirty unload semantics: removal cannot silently discard unsaved canonical state.
- [x] Demote/delete legacy `Chunk` from production authority after its consumers migrate; retained uses must be classified and non-writable relative to live truth.
- [x] Add focused tests for ID projection, property-bearing state writes, negative coordinates, bounds, lazy allocation, dirty tracking and overlay elimination.

## Phase 3 — Live Overworld composition, generation, and streaming

- [x] Bind `OVERWORLD_DIMENSION_TYPE` in the real `Game` composition root and expose its active range to `World`/debug/test seams.
- [x] Derive `minY`, `maxY`, `minSectionY`, `sectionCount`, spawn bounds and vertical iteration from `DimensionType`, not duplicated literals.
- [x] Audit the current `src/worldgen/**` stage graph and document the exact live adapter/composition chosen.
- [ ] Make missing-column generation populate canonical `BlockState`s across the active Overworld range.
- [ ] Eliminate permanent generation of independently authoritative 64-high slabs.
- [ ] Preserve deterministic seed/world-version semantics for fresh worlds.
- [ ] Preserve existing-world baseline semantics when persistence stores seed/version + sparse edits; do not silently regenerate old worlds under a materially different algorithm.
- [ ] Apply durable/user edits after generated baseline so regeneration cannot overwrite them.
- [ ] Reconcile generation status, preload, readiness progress, render distance, simulation distance and unload around horizontal columns + section work.
- [ ] Migrate surface/spawn selection to canonical heightmaps/dimension bounds.
- [ ] Ensure loading a column does not eagerly allocate all 24 Overworld sections.
- [ ] Add integration tests for generation below zero, upper valid Y, negative chunk coordinates, and vertical/horizontal section boundaries.
- [ ] Add sparse-column and long-exploration tests proving bounded section allocation/residency.

## Phase 4 — Section-scoped rendering and lighting

- [ ] Inventory the exact live render/light ownership keys and all worker protocols before modifying them.
- [x] Change live geometry/mesh identity to explicit canonical section identity `(chunkX,sectionY,chunkZ)` or equivalent.
- [ ] Capture `ChunkSection.meshVersion` (and required neighbor versions/snapshots) at job submission.
- [ ] Reject stale/duplicate/mismatched mesh/light results after edit, unload, replacement or version advance.
- [x] Feed canonical block states into live meshing instead of legacy block arrays.
- [x] Preserve render-layer/model/AO/biome-tint/vertex-light behavior through canonical neighbor queries.
- [ ] Make one interior edit invalidate only the affected section unless a documented dependency proves more work is necessary.
- [ ] Make a face edit invalidate the affected section plus only required existing face-sharing neighbor(s), including vertical faces.
- [ ] Make skylight/blocklight initialization/propagation dimension-aware from -64 through 319.
- [ ] Remove hidden legacy-height clamps from lighting/AO/tint neighbor sampling.
- [ ] Dispose superseded/unloaded GPU geometries and worker resources exactly once.
- [ ] Preserve bounded worker/backpressure/cancellation behavior under rapid edit/unload/teleport churn.
- [ ] Add focused vertical-boundary render/light tests and stale-job race tests.
- [ ] Add visual/E2E evidence where unit assertions cannot prove user-visible section seams.

## Phase 5 — Gameplay and simulation consumer migration

- [x] Migrate player collision/shape queries to canonical dimension-aware world access, including terrain below Y=0 and top/bottom boundaries.
- [x] Migrate raycast/selection to canonical states and negative/high Y.
- [x] Migrate mining and placing so stateful blocks are not flattened and section invalidation/persistence triggers correctly.
- [x] Migrate falling-block and general world-mutation helpers discovered by inventory.
- [x] Migrate scheduled/random tick access and neighbor-update paths that still depend on legacy slab assumptions.
- [x] Migrate live fluids/waterlogging and block simulations (fire/crop/farmland/etc.) discovered by inventory.
- [x] Migrate current redstone-facing/block-behavior world access without adding unrelated new redstone content.
- [x] Reconcile item/entity/block-entity lifecycle with horizontal column residency and valid negative/high Y.
- [ ] Verify stable entity/block-entity identity across unload/reload; no duplicates or resurrection.
- [ ] Migrate networking/shared-simulation/debug/test projections that expose legacy world representation.
- [ ] Add gameplay tests at `-64/-1/0`, `15/16`, `63/64`, and `319/320` boundaries as applicable.
- [ ] Add a real playable journey that reaches/interacts below zero, crosses a vertical section boundary, mutates a property-bearing state, and observes correct collision/rendering.

## Phase 6 — Persistence, migration, import/export, and recovery

- [x] Route canonical column persistence through existing `ChunkSectionRepository`/column codecs and migration infrastructure.
- [x] Integrate canonical world storage with live `GamePersistence` rather than adding a parallel database.
- [ ] Implement deterministic legacy read-old/write-new conversion for every characterized supported payload.
- [x] Preserve property-bearing `BlockStateId`/properties through save/load.
- [ ] Make migration idempotent across repeated startup.
- [ ] Prevent duplicate edits, columns, entities, block entities, inventories, item entities and other persisted records after migration/retry.
- [ ] Keep the only recoverable legacy source untouched until replacement canonical data is durably committed.
- [ ] Surface malformed/corrupt/unsupported data through existing storage-health/recovery behavior; do not silently overwrite recoverable content.
- [ ] Coordinate dirty canonical saves with unload; failed writes retain/requeue dirty ownership.
- [ ] Re-run autosave/pagehide/abrupt-close/partial-write/quota/private-mode/storage-health/recovery scenarios against the new live path.
- [ ] Reconcile import/export around canonical columns plus player/entity/block-entity data.
- [x] Add save/reload + unload/reload integration for negative-Y, upper-section and property-bearing edits.
- [ ] Add repeated migration/restart tests proving exact idempotency.

## Phase 7 — Modularity and architecture hardening while touching hotspots

- [ ] Measure current line/complexity/dependency hotspots for `Game.ts`, `World.ts` and directly affected orchestrators before adding migration code.
- [ ] Extract cohesive world composition/residency/generation/render/persistence adapters where doing so reduces coupling and keeps behavior testable.
- [ ] Avoid moving code mechanically without reducing responsibility/coupling.
- [ ] Prevent new circular dependencies between engine/world/render/storage/simulation layers.
- [ ] Keep compatibility adapters narrow, read/projection-oriented, documented with removal criteria, and prohibited from owning a second writable truth.
- [ ] Add dependency/contract tests where extraction changes public seams.
- [ ] Re-run full affected subsystem tests after each extraction.

## Phase 8 — Performance/resource reconciliation

- [ ] Expose canonical metrics: active dimension range, resident columns, allocated sections, section geometries, pending generation/mesh/light/save jobs, dirty columns/sections, entities/block entities and storage health.
- [ ] Reconcile `MemoryResourceBudget` and release metrics from obsolete slab-count units to actual column/section units where required.
- [ ] For every changed threshold, record old/new units, before/after measurements and architecture rationale.
- [ ] Re-run Change-254 hot-path benches that remain comparable and investigate material regressions.
- [ ] Ensure canonical hot block access does not add avoidable per-voxel temporary allocations.
- [ ] Stress generation/meshing/lighting with modern-height data and bounded worker queues.
- [ ] Stress long exploration/teleport churn until resident maps/sections/geometries/jobs demonstrate a plateau.
- [ ] Stress dense multi-section edits and verify localized remesh/relight rather than full-column work.
- [ ] Stress dirty-save/migration/import workloads on sparse large worlds.
- [ ] Verify unloaded resources/geometry/listeners/workers are reclaimed and no monotonically growing ownership map remains.

## Phase 9 — Post-migration exhaustive audit and adversarial review

- [ ] Re-run the exact pre-migration inventory scanner over the entire tracked repository.
- [ ] Require every remaining `Chunk`/`ChunkManager` occurrence to be explicitly classified and non-authoritative in production.
- [ ] Require zero unclassified old-height/slab-key/`cy===0`/state-overlay/duplicate-store production hits.
- [ ] Audit changed modules plus upstream/downstream consumers for correctness, data loss, corruption, determinism, race/stale-result behavior, compatibility, performance and architecture regressions.
- [ ] Adversarially test out-of-range reads/writes, malformed migration records, worker result races, dirty-unload failure, repeated startup, import collisions, entity/block-entity dedupe, and resource churn.
- [ ] Fix every discovered Critical/High issue and add a regression oracle before closure.
- [ ] Record Medium/Low residual debt with explicit rationale/owner; do not relabel a blocking High issue as non-blocking to advance.

## Phase 10 — Full verification and playable certification

- [ ] Reconcile proposal/design/spec/tasks/verification with actual implementation before running final gates.
- [ ] Run `npm run validate-state` and record exact PASS evidence.
- [ ] Run `npm run typecheck` and record exact PASS evidence.
- [ ] Run `npm run lint` and record exact PASS evidence.
- [ ] Run the complete unit suite and record exact files/tests/skips/failures.
- [ ] Run targeted 253 suites and the exhaustive inventory validator.
- [ ] Run `npm run test:coverage` and preserve repository thresholds without excluding migration-critical files merely to make percentages pass.
- [ ] Run `npm run build` and relevant bundle-size/release checks.
- [ ] Run dependency/security/file-audit validators required by repository policy.
- [ ] Run Change-254 benchmark suite / replacement equivalent and record before/after measurements.
- [ ] Run exploration/teleport/dense-edit/save/resource stress suites.
- [ ] Run full `npm run test:e2e`, including the new negative-Y + section-boundary + save/reload journey.
- [ ] Diagnose any failure against `session_start_head` before classifying it as pre-existing; fix all 253 regressions.

## Phase 11 — Publication, canonical CI, archival, and handoff

- [ ] Reconcile canonical `PROGRAM_STATE.json`/`.md`, active tasks and verification to the exact candidate; do not mark VERIFIED prematurely.
- [ ] Commit a coherent implementation candidate with a detailed session/campaign message.
- [ ] Push normally to `origin/main`, fetch/refetch, and verify exact remote head.
- [ ] Obtain canonical GitHub Actions `gate` and `e2e` results for that exact candidate.
- [ ] If canonical jobs fail, diagnose/fix/re-publish; do not record conditional SUCCESS as VERIFIED.
- [ ] Record lineage-valid release authority in a later evidence/state commit so a commit does not claim its own SHA.
- [ ] Re-run state validation after evidence recording.
- [ ] Mark 253 VERIFIED only when mandatory requirements/tests and completion gate are satisfied.
- [ ] Archive the completed OpenSpec package under repository convention and sync canonical capability specs if required by the project.
- [ ] Mark `.agent/EXECUTION_PROMPT.md` COMPLETED and set the next exact action truthfully.
- [ ] Push final coherent evidence/handoff commit, refetch `origin/main`, and record `published_head`.
- [ ] Final executor report MUST include `session_start_head`, `published_head`, active/final status, completed/total tasks and %, every mandatory command result, benchmark/stress summary, CI run evidence, blockers/residual debt, post-audit result, and next exact action.