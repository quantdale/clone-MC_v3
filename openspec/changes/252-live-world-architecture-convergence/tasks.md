# Tasks: 252-live-world-architecture-convergence

All tasks begin unchecked. Check a task only after the named implementation/evidence exists. Re-open any checked task whose evidence is later disproved. The campaign is intentionally large: complete every safe independent task before stopping.

## 0. Rebaseline, authorization, and governance

- [ ] Fetch/prune `origin`, fast-forward/reconcile local `main` to current `origin/main`, record `session_start_head`, and capture worktree/recent-commit/open-issue/open-PR state before edits.
- [ ] Reproduce the planner-observed baseline CI/state defect on the current head and record the exact `validate-state` failure, distinguishing failed from skipped downstream checks.
- [ ] Append `252-live-world-architecture-convergence` to the post-terminal epoch in `openspec/CHANGE_SEQUENCE.md` with the narrow outcome defined by this package; do not rewrite 001–251 history.
- [ ] Activate Change 252 in `openspec/PROGRAM_STATE.json` and `openspec/PROGRAM_STATE.md`: last completed remains 251, 252 becomes the sole active implementation change, completion starts from actual checked tasks, and terminal claims are removed while work is active.
- [ ] Repair `scripts/validate-state.mjs` and related state-schema assumptions as needed so a post-terminal ACTIVE change is representable truthfully while orphaned historical release evidence remains explicitly historical/non-authoritative.
- [ ] Preserve strict final release-evidence checks: a new terminal candidate must still be a full 40-hex lineage-valid commit with canonical `gate` and `e2e` SUCCESS; do not weaken these checks merely to make the baseline green.
- [ ] Run the pre-implementation spec-quality checklist from `SPEC_AUTHORING_PROTOCOL.md` against proposal/design/tasks/spec/verification and fix every failing item before production implementation.
- [ ] Run `npm run validate-state` after activation/governance repair and record the result before touching production world code.

## 1. Whole-codebase pre-migration audit and characterization

- [ ] Produce a machine-checkable pre-migration inventory of every production import/reference to legacy `Chunk`, `ChunkManager`, `CONFIG.chunk.height`/`CHUNK_DIMENSIONS.height`, `chunk.cy`/vertical `cy`, `cy === 0`, old 0..63 Y clamps, `stateOverlay`, legacy chunk keys, and old geometry/light/save identities.
- [ ] Trace downstream consumers of world blocks across generation, streaming, readiness/spawn, meshing, lighting, collision/raycast, mining/placing, falling blocks, fluids, random/scheduled ticks, redstone-facing access, entities, block entities, persistence, import/export, networking snapshots, test hooks, and resource metrics; assign every occurrence a disposition/task owner.
- [ ] Add characterization tests for current live `World` public block APIs and overlay behavior so intentional compatibility can be distinguished from obsolete assumptions during refactoring.
- [ ] Add fixtures/tests covering every legacy durable world/edit payload still accepted by live persistence, including stateful-block data and malformed/partial variants.
- [ ] Add/confirm canonical `VerticalWorldAccess` boundary tests at `y=-65,-64,-1,0,15,16,63,64,319,320`, including non-allocation on out-of-range/air reads and property-preserving state writes.
- [ ] Record deterministic modern-worldgen characterization for representative seeds/negative coordinates/section boundaries sufficient to detect accidental generation drift during live integration.
- [ ] Capture pre-migration resource/performance baselines for resident world units, allocated sections, geometries, pending generation/mesh/light jobs, dense edits, exploration/teleport churn, load and save flushes.

## 2. Canonical live block-state storage

- [ ] Refactor `World` to own/use one dimension-aware canonical block-state store based on `VerticalWorldAccess`/`ChunkColumn`/`ChunkSection` or a thin equivalent facade over those verified primitives.
- [ ] Convert or replace `ChunkManager` so production residency is column-based `(chunkX,chunkZ)` with section-aware access rather than an authoritative `Map<string, Chunk>` of 64-high slabs.
- [ ] Preserve compatibility `World.getBlock()` as a projection of canonical `BlockState.blockId`; route block-id writes through registry default states and stateful writes through canonical `setBlockState`.
- [ ] Remove `World.stateOverlay` as a writable/source-of-truth path and migrate every stateful read/write to canonical section storage.
- [ ] Remove production `cy === 0`, 0..63, and `CONFIG.chunk.height` assumptions from block access/import/edit logic where those assumptions exist solely because of the legacy slab model.
- [ ] Ensure negative-coordinate section/local-coordinate routing uses existing floor-division helpers and add regression tests across x/y/z negative boundaries.
- [ ] Make dirty-column/dirty-section ownership explicit and ensure writes update heightmaps/mesh versions/neighbor dirtiness through the single mutation path.
- [ ] Prove unload/remove semantics cannot discard dirty canonical state silently and that absent-air reads do not allocate columns or sections.
- [ ] Delete or demote legacy `Chunk` from production authority once all live consumers are migrated; any retained use must be explicitly test-only/migration-only with no writable live authority.

## 3. Live Overworld composition, modern generation, and streaming

- [ ] Wire `OVERWORLD_DIMENSION_TYPE` into the real `Game` composition root so the playable world uses minY `-64`, height `384`, and the derived section range.
- [ ] Audit the verified `src/worldgen/**` pipeline end-to-end and implement the narrowest adapter/composition needed to generate canonical columns/sections from the modern Overworld terrain/biome/surface/carver/aquifer/feature/structure stages.
- [ ] Remove the live dependency on generating independent 64-high authoritative slabs; commit generated output into one canonical column with lazy sections.
- [ ] Reconcile preload, ready-progress, render-distance, simulation-distance, generation-status and unload behavior around horizontal column residency plus section work.
- [ ] Migrate spawn/surface-height/readiness logic away from legacy slab constants while preserving bounded startup and safe playable spawn selection.
- [ ] Preserve deterministic seed behavior and ensure durable/user edits override generated baseline without being overwritten on regeneration or reload.
- [ ] Add integration tests for generation spanning negative Y, `y=63/64`, upper sections, negative chunk coordinates, and horizontal/vertical section boundaries.
- [ ] Add stress coverage proving large exploration does not eagerly allocate all Overworld sections for every resident column.

## 4. Section-scoped rendering and lighting convergence

- [ ] Migrate live render ownership/keys from legacy slab identity to explicit `(chunkX, sectionY, chunkZ)` or equivalent canonical section identity.
- [ ] Use `ChunkSection.meshVersion`/dirty-section semantics for mesh request identity and reject stale/duplicate/mismatched worker results after edits, unloads, or replacements.
- [ ] Ensure one block edit remeshes only the affected section plus required face-sharing neighbors; test horizontal and vertical section boundaries.
- [ ] Dispose superseded/unloaded GPU geometries/material resources exactly once and keep geometry accounting consistent with section ownership.
- [ ] Feed canonical block states, neighboring state queries, biome tint, AO and vertex-light data into live section meshing without falling back to legacy block arrays.
- [ ] Make skylight/block-light live queries dimension-aware across negative Y and top/bottom boundaries; remove hidden 0..63 clamps.
- [ ] Preserve worker/backpressure/cancellation semantics and bounded pending-job counts under rapid edit/unload/teleport churn.
- [ ] Add renderer/light integration or visual-regression coverage for negative-Y sections, `15/16` and `63/64` vertical boundaries, and stale-job rejection.

## 5. Gameplay and simulation consumer migration

- [ ] Migrate collision/shape queries and player movement to canonical dimension-aware block access, including terrain below Y=0 and section transitions.
- [ ] Migrate raycast/selection, mining and placing to canonical block states; verify stateful block placement/breaking does not flatten properties.
- [ ] Migrate falling-block/world-mutation helpers and any live neighbor-update/scheduled/random-tick access that still assumes the legacy vertical slab.
- [ ] Migrate fluid, waterlogging, fire/crop/farmland and other block-simulation consumers discovered by the pre-audit to canonical world access where they are live.
- [ ] Migrate redstone-facing/block-behavior world access used by the playable path without broadening this campaign into new redstone content.
- [ ] Reconcile entity/item-entity/block-entity chunk lifecycle with column unload/reload and negative-Y positions.
- [ ] Preserve Change-251 furnace place/open/insert/smelt/collect/walk-away/autosave/reload/unload/reload/break semantics through the new world lifecycle.
- [ ] Add a real playable integration/E2E journey that reaches below Y=0, edits blocks, crosses a vertical section boundary, saves/reloads, and observes the same canonical states.
- [ ] Add explicit gameplay regression coverage at lower/upper world bounds so out-of-range mutation/collision/raycast behavior is deterministic and safe.

## 6. Persistence, migration, recovery, and compatibility

- [ ] Route live canonical column persistence through the existing `ChunkSectionRepository`/serialized-column and versioned migration infrastructure rather than a new parallel save format.
- [ ] Implement deterministic versioned migration/compatibility loading from every legacy live sparse/block-id edit representation identified by characterization tests.
- [ ] Preserve full `BlockStateId`/properties through durable save/load; prohibit flattening stateful blocks to bare block ids.
- [ ] Make successful migration idempotent across repeated startup and prevent duplicate columns, edits, entities, block entities, furnace inventory or item entities.
- [ ] Coordinate dirty canonical column saves with unload so write failures requeue/retain dirty ownership instead of silently dropping state.
- [ ] Re-run abrupt-close, partial-write, migration-version, quota/private-mode, storage-health and recovery scenarios against the actual new live path.
- [ ] Reconcile import/export so canonical columns, player state, entities and block entities round-trip without duplication or lost edits.
- [ ] Verify legacy data remains untouched/recoverable until replacement durable state is committed, and failed migration is surfaced as degraded/blocked rather than falsely completed.
- [ ] Add end-to-end save/reload tests for negative-Y edits, upper sections, stateful blocks, live furnace data, and unload/reload persistence.

## 7. Resource/performance reconciliation

- [ ] Update live resource observability to report meaningful column count, allocated section count, section geometries, pending jobs, dirty columns, entities/block entities and storage health from canonical sources.
- [ ] Reconcile `MemoryResourceBudget` and related release measurements with the new column/section units; any changed budget must be supported by measured architecture rationale, not threshold inflation.
- [ ] Re-run generation/meshing/lighting worker saturation on modern-height canonical data and fix root-cause regressions that exceed defensible budgets.
- [ ] Re-run exploration/teleport churn and dense-edit stress, proving resident maps, section allocation, geometry count and pending jobs plateau within justified bounds.
- [ ] Re-run load/save performance and dirty-queue stress on canonical columns, including large sparse worlds where most vertical sections remain empty.
- [ ] Verify one-block edits do not trigger full-column remeshing/relighting absent an explicitly measured and documented exceptional dependency.

## 8. Whole-repository post-migration audit, reconciliation, and certification

- [ ] Repeat the entire legacy-consumer scan after implementation and classify every remaining `Chunk`, old-height clamp, `cy === 0`, state-overlay, old chunk-key and duplicate-store occurrence as removed, test-only, migration-only, intentionally compatible with expiry, or blocking.
- [ ] Audit all changed modules plus their upstream/downstream consumers for correctness, reliability, data-loss, concurrency, determinism, performance, architecture and compatibility regressions; fix all discovered Critical/High issues and add regression oracles.
- [ ] Reconcile proposal/design/spec/tasks/verification with actual implementation; remove stale intent and ensure every normative requirement/scenario has evidence.
- [ ] Reconcile `PARITY_MATRIX.md` and validator assumptions for Change 252 without corrupting the historical 001–251 bijection/evidence; add explicit post-terminal evidence as appropriate.
- [ ] Run `npm run validate-state` and record exact PASS evidence.
- [ ] Run `npm run typecheck` and record exact PASS evidence.
- [ ] Run `npm run lint` and record exact PASS evidence.
- [ ] Run the complete unit suite and targeted 252 suites; record exact counts and zero unexplained failures/skips.
- [ ] Run `npm run test:coverage` and meet repository thresholds without excluding migration-critical code merely to preserve percentages.
- [ ] Run `npm run build` and required release-bundle/bundle-size checks.
- [ ] Run production/development dependency audits and required file-audit validators; record exact results.
- [ ] Run the complete Playwright E2E suite including the new negative-Y/section-boundary/save-reload journey and existing furnace journey.
- [ ] Publish the implementation candidate to `origin/main`, fetch/refetch, and verify the exact remote head.
- [ ] Obtain canonical GitHub Actions `gate` and `e2e` SUCCESS for the exact candidate; if either fails, diagnose/fix/re-publish rather than recording conditional success as VERIFIED.
- [ ] Record the new lineage-valid release authority/canonical CI evidence in a subsequent evidence/state commit so the candidate never claims its own SHA; preserve old non-ancestral evidence only as historical context.
- [ ] Mark Change 252 VERIFIED only after all mandatory requirements/tests are green and task completion is 100%; archive the package under the date-prefixed archive path and sync any canonical capability specs required by repository convention.
- [ ] Mark `.agent/EXECUTION_PROMPT.md` `Status: COMPLETED`, reconcile final `PROGRAM_STATE.json`/`.md`, and set the next exact action truthfully (await a future explicitly authorized change if no successor exists).
- [ ] Commit the final coherent session report/evidence with a detailed full-session message, push directly to `origin/main`, refetch, and report `session_start_head`, `published_head`, task count/percentage, validation commands, CI ids, blockers/non-blocking debt, and next exact action.
