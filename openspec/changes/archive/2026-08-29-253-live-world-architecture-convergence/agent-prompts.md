# Agent Prompt Queue: 253-live-world-architecture-convergence

Purpose: a self-contained, dependency-ordered prompt queue for one long autonomous executor session.
Requested execution window: **12 hours of active engineering work**.

## Global execution contract

These rules apply to every prompt below:

- Work in `quantdale/clone-MC_v3` from current `origin/main`.
- Obey `AGENTS.md`, OpenSpec control files, and the active 253 normative spec.
- Do not ask for routine confirmation. Make evidence-based engineering decisions and continue.
- Use the repository as source of truth; never trust stale chat memory over files/tests/Git.
- Before production edits, complete 253 activation/spec/governance tasks.
- Never create a second writable world authority.
- Fix root causes. Do not weaken tests, contracts, CI ancestry proof, save integrity, or performance budgets to manufacture green status.
- Add characterization/regression tests adjacent to changes.
- Run the narrowest relevant checks after each logical unit and full gates at closure.
- Update `tasks.md`, `verification.md`, and canonical program state after meaningful task groups, failures, verification, before compaction, and before ending.
- Commit coherent checkpoints and publish according to `REVIEW_HANDOFF.md`; never force-push.
- Continue safe independent work for the entire requested 12-hour window. If the implementation becomes feature-complete early, spend remaining active time on exhaustive post-audit, adversarial tests, race/failure injection, profiling, resource-leak hunting, regression hardening, specification reconciliation and exact canonical release evidence. Do not idle and do not invent unrelated game features.
- Stop early only for a genuine durable blocker where no other safe unblocked 253 work remains. Record the blocker precisely.

The pacing labels are targets, not deadlines. Correctness and evidence take priority. If a phase overruns, continue dependency order and use later prompts as a checklist; never skip mandatory work just to match the clock.

---

## PROMPT 00 — Bootstrap, rebaseline, and activate 253

**Target window:** hour 0:00–0:45

You are the primary autonomous executor for Change `253-live-world-architecture-convergence`.

1. Fetch/prune `origin`, synchronize safely to current `origin/main`, record `session_start_head`, remote head and clean/dirty state before edits.
2. Read, in order: `AGENTS.md`, `.agent/EXECUTION_PROMPT.md`, `openspec/AUTONOMOUS_GOAL.md`, `PROGRAM_STATE.json`, `PROGRAM_STATE.md`, `CHANGE_SEQUENCE.md`, `CHANGE_SEQUENCE_OVERRIDES.md`, `REVIEW_HANDOFF.md`, `SPEC_AUTHORING_PROTOCOL.md`, then **every file** under `openspec/changes/253-live-world-architecture-convergence/`.
3. Treat the owner’s next-campaign authorization as activation authorization for the reserved 253 described by the override file.
4. Reproduce the current baseline `validate-state` / canonical-CI lineage issue on the exact starting head. Distinguish failure from skipped downstream steps and record evidence.
5. Add 253 to the post-terminal sequence without rewriting 001–252/254 history. Reconcile the historical fact that owner-authorized 254 executed before reserved 253.
6. Set 253 as the sole ACTIVE change in canonical JSON/Markdown program state; 254 remains last completed until 253 verifies.
7. Repair the post-terminal/shallow-checkout validator/workflow assumptions so ACTIVE state validates truthfully. Prefer providing sufficient Git history to validation over disabling ancestry checks. Preserve strict final candidate exact-SHA + canonical `gate`/`e2e` proof.
8. Run the OpenSpec authoring quality gate against all 253 artifacts and repair any violation before production code.
9. Run `npm run validate-state`, typecheck, lint, unit and build baseline checks as appropriate. Capture exact counts/results. Run the Change-254 comparable benchmark baseline.
10. Update `tasks.md` and `verification.md` with only real evidence; commit/publish a coherent activation/governance checkpoint if repository policy requires a durable handoff before further work.

Do not touch production world architecture until activation/spec/state validation is truthful.

When this prompt is complete, immediately continue to PROMPT 01 without asking for confirmation.

---

## PROMPT 01 — Exhaustive every-file legacy-world inventory

**Target window:** hour 0:45–1:45

Perform the mandatory repository-wide pre-migration audit. This is not a changed-file review.

1. Reuse/extend `scripts/audit-inventory.mjs` or write the smallest deterministic scanner needed to enumerate **all tracked files relevant to code/config/tests/scripts/OpenSpec** and scan the exact legacy pattern families in `audit-findings.md` / `design.md`.
2. Inventory direct and indirect consumers of:
   - `Chunk`, `ChunkManager`;
   - `CONFIG.chunk.height`, legacy sea/bedrock assumptions, explicit 0..63/64 range clamps;
   - `cy`, `chunkY`, `cy === 0`, slab-shaped keys;
   - `stateOverlay` and any alternate writable block-state/edit map;
   - legacy bare-ID persistence;
   - old geometry/light/worker identities;
   - legacy generator outputs;
   - collision/raycast/mining/placing/ticks/fluids/block behaviors/redstone access;
   - entity/item/block-entity lifecycles;
   - import/export/network/shared-simulation/debug/E2E hooks;
   - resource metrics/budgets using obsolete chunk units.
3. Emit a machine-readable inventory with path, line/symbol when feasible, subsystem, severity, exact disposition and owning task.
4. Allowed dispositions are only: `REMOVE`, `MIGRATE`, `PROJECTION_ONLY`, `MIGRATION_ONLY`, `TEST_ONLY`, `INTENTIONAL_COMPATIBILITY_WITH_EXPIRY`, `BLOCKER`.
5. Trace call/data flow from `Game` to `World` and from canonical storage outward. Identify every translation boundary where state can diverge or properties can be flattened.
6. Characterize all legacy durable payloads currently accepted by `GamePersistence` / migration logic before changing codecs.
7. Add tests for current live `World` block/state behavior, negative coordinate boundaries, lazy canonical reads and deterministic modern worldgen fixtures.
8. Capture resource and queue baselines under startup, exploration/teleport, dense edits and save churn using existing tooling where possible.
9. Update `audit-findings.md` if the actual checkout disproves/extends planning findings. The scanner result, not the planner text, becomes the execution source of truth.
10. Record the scan artifact path/hash/summary in `verification.md` and assign every High/Critical hit to an explicit task before implementation.

Do not accept “grep showed nothing” without proving scanner coverage and tracked-file count.

Then continue to PROMPT 02.

---

## PROMPT 02 — Replace split-brain world truth with canonical storage

**Target window:** hour 1:45–3:00

Converge the live world core on the existing dimension-aware primitives.

1. Refactor `World` so one thin canonical facade over `VerticalWorldAccess`/`ChunkColumn`/`ChunkSection` owns live block-state truth.
2. Do **not** create a third backing store.
3. Preserve compatibility `getBlock()` only as a projection of canonical `BlockState.blockId`.
4. Resolve block-ID writes through registry default states; route property-bearing writes directly to canonical state.
5. Remove `stateOverlay` or any equivalent independent writable authority. Prove stateful properties survive without it.
6. Convert/replace `ChunkManager` so authoritative residency is `(chunkX,chunkZ)` canonical columns with lazy sections, not 64-high slabs.
7. Separate read-only lookup from section-materializing APIs so absent-air reads and out-of-range operations allocate nothing.
8. Remove canonical-path `cy === 0`, 0..63 clamps, slab-only serialization/edit assumptions and unsafe negative modulo.
9. Centralize canonical mutation consequences: heightmaps, dirty section/column, mesh version, neighbor invalidation, persistence scheduling.
10. Define dirty unload behavior so state cannot be dropped on write failure.
11. Demote/remove production `Chunk` ownership once direct consumers migrate; any retained use must match scanner disposition and be non-authoritative.
12. Add focused tests for every invariant and run them after each coherent unit.
13. Keep `Game.ts`/`World.ts` from growing into worse monoliths: extract cohesive adapters when it reduces coupling and can be tested.

Do not proceed with a permanent compatibility layer that can diverge from canonical state.

Then continue to PROMPT 03.

---

## PROMPT 03 — Bind the real Overworld and modern generation/streaming

**Target window:** hour 3:00–4:15

Make the normal playable composition root consume the modern world.

1. Bind `OVERWORLD_DIMENSION_TYPE` from `Game` and make active dimension metadata observable to tests/debugging.
2. Derive Overworld bounds/section range everywhere from `DimensionType`: valid Y `[-64,319]`, section range derived rather than duplicated.
3. Audit the actual current `src/worldgen/**` stage graph before editing. Document which verified stages are composed live and which adapter is required.
4. Make missing-column generation emit canonical `BlockState`s into canonical sections at real world Y.
5. Do not implement six independent 64-high authoritative chunks as the final design.
6. Preserve deterministic generation for fresh worlds.
7. Preserve existing-world semantics where persistence is seed/version + sparse edits; do not silently regenerate existing worlds using a materially different baseline.
8. Apply durable/user edits after compatible generated baseline and prove regeneration cannot overwrite them.
9. Reconcile horizontal render/simulation distance, generation status, preload/readiness, spawn/surface logic and unload with canonical column residency + lazy sections.
10. Prove loading a horizontal column does not allocate/mesh 24 sections by default.
11. Add integration tests for negative Y, upper valid Y, negative chunk coordinates, section boundaries, sparse columns and long exploration.
12. Run relevant worldgen golden/determinism tests and compare against baseline before accepting changes.

Then continue to PROMPT 04.

---

## PROMPT 04 — Section rendering, lighting, and worker correctness

**Target window:** hour 4:15–5:30

Converge the live visual pipeline on canonical section identity.

1. Map current render/light/worker ownership from the pre-audit and migrate each live consumer.
2. Make geometry/job identity explicitly section-scoped `(chunkX,sectionY,chunkZ)` or equivalent.
3. Capture `ChunkSection.meshVersion` plus any required neighbor snapshot/version at async job submission.
4. Before applying a result, verify section residency/identity/version and discard stale/duplicate/mismatched output safely.
5. Feed canonical block states and canonical neighbors into meshing. Preserve model/render-layer/AO/biome-tint/vertex-light semantics.
6. Interior edit: invalidate only the affected section absent documented dependency.
7. Face edit: invalidate affected section + required existing face-sharing neighbor, including vertical faces.
8. Make skylight/blocklight initialization/update and AO/tint sampling dimension-aware from -64 through 319. Remove hidden 0..63 clamps.
9. Dispose superseded/unloaded GPU resources exactly once.
10. Preserve worker queue backpressure/cancellation and bounded job counts under rapid edit/unload/teleport churn.
11. Add race tests that intentionally return old worker results after mutation/unload/replacement.
12. Add vertical-boundary light/mesh tests and user-visible/visual evidence if unit assertions cannot detect seams.
13. Run resource metrics and confirm one edit does not trigger a 384-high rebuild.

Then continue to PROMPT 05.

---

## PROMPT 05 — Migrate gameplay, simulation, entities, and block entities

**Target window:** hour 5:30–6:45

Migrate every live world consumer discovered by the scanner.

1. Player collision/shape queries must use canonical dimension-aware state below zero and near world bounds.
2. Raycast/selection must target canonical states across all valid Y.
3. Mining/placing must preserve property-bearing states and trigger canonical render/light/save consequences.
4. Falling-block/world-mutation helpers must stop using legacy slab authority.
5. Scheduled/random ticks and neighbor-update paths must work at negative/high Y.
6. Fluids/waterlogging and all live block simulations found by audit (fire/crops/farmland/etc.) must consume canonical access.
7. Current redstone-facing/block-behavior access must migrate without adding unrelated redstone content.
8. Reconcile item/entity/block-entity ownership with horizontal column residency. Vertical sections must not duplicate lifecycle ownership.
9. Add stable identity/dedupe tests for entity and block-entity unload/reload.
10. Migrate networking/shared-simulation/debug/E2E projections so they observe canonical truth rather than hidden legacy arrays.
11. Add tests at `-64/-1/0`, `15/16`, `63/64`, `319/320` where relevant.
12. Build the normal-composition playable test journey: below-zero collision/interaction + section-boundary property-state edit + visible canonical update. Persistence portions can be finished in the next prompt.
13. Run focused and existing core gameplay suites before proceeding.

Then continue to PROMPT 06.

---

## PROMPT 06 — Persistence, migration, recovery, and import/export

**Target window:** hour 6:45–8:00

Make canonical live world truth durable without data loss.

1. Route canonical columns/sections through existing `ChunkSectionRepository`, codecs, dirty-save/autosave, migrations and `GamePersistence` integration. Do not add a parallel database.
2. For every characterized legacy payload, implement deterministic versioned read-old/write-new conversion into canonical states.
3. Preserve compatible generated baseline semantics for old sparse-edit worlds.
4. Preserve property-bearing states; prohibit ID-only flattening when properties exist.
5. Migration must be idempotent across repeated startup/retry.
6. Prevent duplicate columns, edits, entities, block entities, inventories, item entities or other persistent records.
7. Keep the only recoverable old source untouched until canonical durable commit succeeds.
8. Dirty column unload must save successfully or remain retained/requeued/visibly degraded.
9. Exercise malformed/corrupt data, partial write, quota/private mode, storage-health, abrupt close/pagehide and recovery paths supported by repository tooling.
10. Reconcile export/import around canonical columns and associated player/entity/block-entity data.
11. Complete the playable journey with save/reload + column unload/reload and assert exact state semantics after both.
12. Add repeated migration/restart tests and failure-injection tests.
13. Run all persistence/migration/storage suites plus core E2E affected by persistence.

Then continue to PROMPT 07.

---

## PROMPT 07 — Modularity hardening and compatibility adapter deletion

**Target window:** hour 8:00–8:45

Harden the architecture after the main convergence works.

1. Measure responsibility/dependency hot spots in `Game.ts`, `World.ts` and newly modified orchestrators.
2. Extract cohesive modules only where they genuinely reduce coupling and improve testability: canonical storage facade, residency coordinator, generation adapter, render coordinator, persistence adapter, typed section/column keys, etc. Fit repository conventions rather than these exact names.
3. Do not do cosmetic file splitting or unrelated inventory/UI rewrites.
4. Remove temporary writable compatibility bridges. Remaining adapters must be read/projection-only or migration-only with explicit disposition/expiry.
5. Check for circular dependencies, duplicated lifecycle ownership, hidden mutation channels and cache invalidation gaps.
6. Add contract/dependency tests around extracted seams.
7. Re-run affected full subsystem tests after each extraction.
8. Update design/spec if implementation reveals a justified architectural change; never silently diverge from normative text.

Then continue to PROMPT 08.

---

## PROMPT 08 — Performance/resource reconciliation and adversarial stress

**Target window:** hour 8:45–10:00

Treat performance and bounded resources as correctness properties.

1. Expose/read canonical metrics for active dimension range, resident columns, allocated sections, geometries, dirty state, pending generation/mesh/light/save jobs, entities/block entities and storage health.
2. Reconcile release/resource budgets from obsolete slab units to column/section units only where required. Record old/new units, before/after measurements and rationale for every threshold change.
3. Run all semantically comparable Change-254 benchmarks. Investigate material regressions; do not delete a benchmark because it became inconvenient.
4. Inspect canonical hot voxel paths for avoidable per-operation allocations/lookups introduced by the migration.
5. Stress modern-height generation/meshing/lighting queue saturation.
6. Run long exploration/teleport churn until maps/sections/geometries/jobs demonstrate stable plateaus.
7. Run dense edits spanning horizontal and vertical boundaries; verify localized remesh/relight and bounded dirty-save work.
8. Stress large sparse worlds and repeated save/migration/import operations.
9. Hunt memory/resource leaks: geometry disposal, worker/job maps, listeners, entity registries, persistence queues, caches.
10. Fix root causes and add regression benchmarks/oracles for every meaningful issue.

Then continue to PROMPT 09.

---

## PROMPT 09 — Whole-repository post-audit and adversarial defect hunt

**Target window:** hour 10:00–10:45

Repeat the audit over the entire repository and assume the migration is wrong until evidence proves otherwise.

1. Run the exact pre-migration scanner again over all tracked files.
2. Diff pre vs post inventories and explain every remaining legacy occurrence.
3. Require zero unclassified production `Chunk`/`ChunkManager`, old-height clamp, `cy===0`, state-overlay, duplicate writable store, slab-key render/light/save, or legacy-debug authority hits.
4. Audit every changed module **and upstream/downstream consumer**, not just changed lines.
5. Attack data-loss paths: migration interruption, dirty unload failure, repeated startup, partial writes, import collisions.
6. Attack concurrency/staleness: worker results after edit/unload/replacement, rapid residency churn, duplicated entity/block-entity restoration.
7. Attack coordinate boundaries and negative math.
8. Attack performance/resource bounds with worst-case sparse/dense patterns.
9. Fix all Critical/High findings and add regression tests. Medium/Low debt must be explicitly recorded, not hidden.
10. Update `audit-findings.md`, inventory artifacts, tasks and verification with the actual post-state.

Then continue to PROMPT 10.

---

## PROMPT 10 — Full verification, E2E certification, and spec reconciliation

**Target window:** hour 10:45–11:30

Prepare an exact release candidate.

1. Re-read proposal/design/spec/tasks/verification and compare every normative requirement to actual code/tests. Amend stale documentation before claiming verification.
2. Ensure every checked task has real evidence and reopen anything disproved.
3. Run final `npm run validate-state`.
4. Run final typecheck and lint.
5. Run complete unit suite and record exact file/test/skip counts.
6. Run 253 targeted suites and the exhaustive inventory validator.
7. Run coverage and satisfy repository policy without excluding critical migration code merely to improve percentages.
8. Run build and relevant bundle/release/file/dependency/security audits.
9. Run comparable Change-254 benches and resource/stress gates.
10. Run full Playwright E2E, including the mandatory normal-composition below-zero + vertical-boundary + property-state + save/reload + unload/reload journey.
11. For every failure, reproduce against `session_start_head` before declaring it pre-existing. All 253 regressions must be fixed.
12. Fill requirement evidence in `verification.md` with exact command/test paths/results. No vague “looks good” evidence.

If anything mandatory remains red/unverified, continue fixing rather than proceeding to false closure.

Then continue to PROMPT 11.

---

## PROMPT 11 — Publish, obtain canonical CI evidence, archive, and use remaining time for hardening

**Target window:** hour 11:30–12:00+, continuing until the requested active window is exhausted or all release work is truthfully complete.

1. Reconcile `PROGRAM_STATE.json`/`.md`, tasks and verification to the exact candidate without prematurely marking VERIFIED.
2. Inspect the full intended diff and commit a coherent detailed campaign checkpoint.
3. Push normally to `origin/main`; fetch/refetch and record the exact candidate remote SHA.
4. Obtain canonical GitHub Actions `gate` and `e2e` results required by repository governance for the exact candidate.
5. If either mandatory job fails, diagnose, fix, rerun local gates, commit/push again and obtain fresh exact evidence. Do not mark conditional success as VERIFIED.
6. Record lineage-valid release authority in a later evidence/state commit as required so a candidate does not claim its own SHA.
7. Re-run state validation against the evidence commit.
8. Only now, if every MUST/SHALL and mandatory gate is proven, mark 253 VERIFIED and archive the OpenSpec package per repository convention. Sync canonical capability specs if required.
9. Mark `.agent/EXECUTION_PROMPT.md` `Status: COMPLETED` and set truthful next action.
10. Push final evidence/handoff commit, refetch `origin/main`, record `published_head` and ensure repository state alone can resume/review the session.
11. If time remains in the requested 12-hour active window after successful verification, do **not** invent new product scope. Re-run adversarial audits, targeted stress loops, benchmark repetitions, leak checks, deterministic replay/golden tests, E2E flake diagnosis, documentation/source reconciliation and review the entire `session_start_head..published_head` diff for missed edge cases. Fix any 253 defect discovered and repeat the necessary release evidence.
12. Final report must include: start SHA, final published SHA, 253 status, checked/total tasks and percentage, exact mandatory command results, unit/E2E counts, inventory pre/post summary, benchmark/resource summary, canonical CI run evidence, blockers/residual debt, and next exact action.

## One-line bootstrap for the human operator

After pulling the repository, the executor can be told:

> Read `.agent/EXECUTION_PROMPT.md` and execute Change 253 autonomously from PROMPT 00 through PROMPT 11. Work continuously through the full 12-hour campaign contract, obey OpenSpec/state/Git gates, fix all Critical/High findings, publish coherent checkpoints to `origin/main`, and stop early only for a genuine durable blocker with no safe independent 253 work remaining.