# Execution Campaign: Change 253 — Live World Architecture Convergence

Status: COMPLETED — Change 253 VERIFIED and archived as `2026-08-29-253-live-world-architecture-convergence`; canonical spec synced to `openspec/specs/live-world-architecture/spec.md`.
Planned-From: `a8021f55ef233fb8aa0f983905a22a3859add88a`
Planned-At: `2026-08-26T23:52:00+08:00`
Target-Branch: `main`
Requested-Active-Execution-Window: `12 hours`
OpenSpec archive: `openspec/changes/archive/2026-08-29-253-live-world-architecture-convergence/`
Canonical spec: `openspec/specs/live-world-architecture/spec.md`
Prompt queue archive: `openspec/changes/archive/2026-08-29-253-live-world-architecture-convergence/agent-prompts.md`

## Mission

Make the **actual playable game** use one modern, dimension-aware canonical world architecture.

The repository already contains `DimensionType`, `VerticalWorldAccess`, lazy `ChunkColumn`/`ChunkSection` storage, property-bearing `BlockStateId`s, section mesh versions, modern worldgen, persistence repositories, migrations, deterministic test infrastructure and strong release tooling. The live `Game`/`World` path still retains the original 16×64×16 legacy `Chunk` slab, legacy-height assumptions and a separate block-state overlay as part of playable world truth.

Change 253 converges these systems. It does **not** invent a third world store.

The target is:

```text
Game
  -> active OVERWORLD_DIMENSION_TYPE
  -> World
       -> one canonical dimension-aware block-state facade
            -> VerticalWorldAccess
                 -> ChunkColumn(chunkX, chunkZ)
                      -> lazy ChunkSection(sectionY)
                           -> BlockStateId
       -> section-aware generation / streaming / render / light
       -> gameplay + simulation consumers
       -> existing canonical persistence / migration
```

Success means verified subsystem architecture and user-facing runtime are the same architecture.

## Why this is the next campaign

`openspec/CHANGE_SEQUENCE_OVERRIDES.md` explicitly reserves `253-live-world-architecture-convergence` and says it MUST be activated under that name when its owner activation arrives. `openspec/PROGRAM_STATE.json` currently says the program is terminal after verified 254 and its next exact action is to await explicit product authorization for 253.

The owner’s next-campaign instruction that produced this file is that authorization.

Do not renumber or rewrite historical 001–252/254 work. 254 was owner-authorized and executed before reserved 253; preserve that truth in sequence/state.

## Read-first contract

On session start, fetch/prune/synchronize to current `origin/main`, record `session_start_head`, then read in order:

1. `AGENTS.md`
2. `.agent/PLANNER_HANDOFF.md`
3. this file
4. `openspec/AUTONOMOUS_GOAL.md`
5. `openspec/PROGRAM_STATE.json`
6. `openspec/PROGRAM_STATE.md`
7. `openspec/CHANGE_SEQUENCE.md`
8. `openspec/CHANGE_SEQUENCE_OVERRIDES.md`
9. `openspec/REVIEW_HANDOFF.md`
10. `openspec/SPEC_AUTHORING_PROTOCOL.md`
11. **every file** under `openspec/changes/253-live-world-architecture-convergence/`
12. broader master-plan/history only when a concrete design question requires it.

The active 253 package contains:

- `audit-findings.md` — refreshed planning-time audit and mandatory exhaustive-scan contract;
- `proposal.md` — scope, goals, non-goals, migration and Definition of Done;
- `design.md` — target architecture, invariants, flows, failure behavior and implementation guidance;
- `tasks.md` — dependency-ordered executable task graph;
- `specs/live-world-architecture/spec.md` — normative MUST/SHALL contract;
- `verification.md` — initially-unverified evidence matrix;
- `agent-prompts.md` — PROMPT 00 through PROMPT 11 for the requested 12-hour execution window.

## Mandatory start sequence

Do not begin production world edits immediately.

1. Rebaseline to the actual current remote head; `Planned-From` is historical context, not permission to overwrite newer work.
2. Reproduce the known pre-existing post-terminal CI/state-lineage problem on the exact starting head and distinguish failed steps from skipped downstream steps.
3. Add 253 to the canonical post-terminal sequence while preserving that 254 executed first under the documented override.
4. Set 253 as the sole ACTIVE change in canonical program state; 254 remains the last completed change until 253 verifies.
5. Repair post-terminal/shallow-checkout `validate-state` / CI history assumptions truthfully. Prefer giving validation enough Git history rather than disabling ancestry checks.
6. Preserve strict final release proof: full exact candidate SHA in current lineage plus canonical `gate` and `e2e` evidence required by repository governance.
7. Run the pre-implementation `SPEC_AUTHORING_PROTOCOL.md` quality gate over the complete 253 package and fix any spec defect before production edits.
8. Run `npm run validate-state` after activation/governance repair; it must be truthful before world production implementation proceeds.
9. Capture typecheck/lint/unit/build and semantically comparable Change-254 benchmark baselines.
10. Execute the exhaustive pre-migration every-file inventory before changing the world architecture.

## Highest-risk audit findings

### 1. Split world authority — CRITICAL

The live path still uses `Chunk`/`ChunkManager` and a separate richer-state overlay. The end state permits one writable canonical block-state authority only. Compatibility APIs can project from canonical state but cannot maintain another independently writable copy.

### 2. Legacy 16×64×16 live vertical model — CRITICAL

`src/config/index.ts` still configures the legacy slab height as 64. The playable Overworld target is `OVERWORLD_DIMENSION_TYPE` with valid block Y `[-64,319]`. Live vertical bounds/section count must derive from `DimensionType`, not duplicated legacy constants.

### 3. Modern primitives already exist — REUSE, DO NOT REINVENT

`ChunkSection` already supplies paletted block-state storage and mesh versions. `ChunkColumn` already supplies lazy sections, arbitrary vertical range, dirty sections, heightmaps, status and serialization. `VerticalWorldAccess` already supplies dimension-aware negative-safe routing.

Use them. A new third backing store is prohibited.

### 4. Live composition is not dimension-authoritative — CRITICAL

The real `Game` must bind the active `OVERWORLD_DIMENSION_TYPE` and feed that contract through `World`, generation/streaming, rendering/lighting, gameplay/simulation and persistence.

### 5. Persistence architecture already exists — REUSE

Use existing `src/storage/**`, including canonical section persistence, dirty-save/autosave, migrations, entity/block-entity repositories and `GamePersistence`. Do not add a parallel world database.

Legacy migration must be deterministic, versioned, idempotent, failure-visible and non-destructive until canonical durable commit succeeds.

### 6. Change-254 performance evidence is a baseline — HIGH

253 may structurally supersede optimized legacy surfaces, but it must preserve bounded hot-path/resource behavior and run comparable 254 benchmarks. Do not remove benchmarks or inflate budgets merely because migration regresses.

### 7. CI lineage defect belongs to 253 workstream A — HIGH

Completed 254 records canonical CI state validation failing under shallow-checkout release-history assumptions both before and after 254, with repair assigned to reserved 253. Fix it honestly; do not weaken exact release evidence.

## Exhaustive every-file requirement

Before implementation and again after implementation, run a machine-checkable scan over all tracked source/test/config/script/OpenSpec files. Reuse/extend `scripts/audit-inventory.mjs` where suitable.

At minimum classify all occurrences of:

- `Chunk`, `ChunkManager`;
- `CONFIG.chunk.height`, old sea/bedrock/range assumptions, explicit 0..63/64 clamps;
- `cy`, `chunkY`, `cy === 0`, legacy slab-shaped keys;
- `stateOverlay` and duplicate writable world/edit/state maps;
- bare-ID persistence where canonical state is required;
- legacy geometry/light/worker keys;
- worldgen paths emitting legacy chunks instead of canonical states;
- collision/raycast/mining/placing/ticks/fluids/block behavior/redstone consumers;
- entity/item/block-entity ownership tied to slab lifecycle;
- persistence/import/export/network/shared-simulation/debug/E2E legacy projections;
- resource metrics/budgets whose units assume one legacy slab equals one world column.

Every hit receives one of exactly:

`REMOVE`, `MIGRATE`, `PROJECTION_ONLY`, `MIGRATION_ONLY`, `TEST_ONLY`, `INTENTIONAL_COMPATIBILITY_WITH_EXPIRY`, `BLOCKER`.

The post-scan must have zero unclassified production hits and zero unresolved Critical/High split-truth/data-loss/correctness/stale-worker/compatibility/resource blockers.

## Non-negotiable architecture constraints

- One writable canonical world authority.
- Playable Overworld valid Y `[-64,319]`; out-of-range operations are safe and non-allocating.
- Negative X/Y/Z routing uses floor-division/local-coordinate helpers.
- Absent-air reads do not allocate sections.
- Horizontal residency does not eagerly allocate/mesh all 24 Overworld sections.
- Property-bearing block states survive live read/write, unload/reload, save/reload and import/export.
- User/durable edits override generated baseline and are not lost by regeneration.
- Existing-world generation semantics are preserved unless a separate explicit world-upgrade decision exists.
- Dirty unload cannot silently discard world state.
- Section mesh/light jobs are identity/version guarded; stale results never replace current state.
- Interior edits stay localized; face edits invalidate required face-sharing neighbors, including vertical neighbors.
- Lighting/AO/tint sampling is dimension-aware and canonical-state-backed.
- Player physics, raycast, block interaction, ticks, fluids, entities/block entities and every audited live consumer work outside the old 0..63 slab.
- Entity/block-entity restore remains exactly once across residency cycles.
- Existing persistence/migration repositories remain the durable authority.
- Worker/resource/residency maps stay bounded under churn.
- No threshold inflation or test weakening to hide regressions.
- No force-push/history rewrite.

## Mandatory real-play proof

At least one normal-composition Playwright/live-game journey must prove all of the following together:

1. game boots through the real `Game` composition root;
2. active dimension is the modern Overworld range;
3. valid content below Y=0 participates in real collision/interaction;
4. a vertical section boundary is crossed/edited;
5. a property-bearing block state is mutated and observed canonically;
6. rendering/collision see the same state;
7. save/reload preserves exact semantics;
8. column unload/reload preserves exact semantics;
9. no hidden legacy-only debug mutation is used as the authoritative shortcut.

## 12-hour execution contract

Execute `openspec/changes/253-live-world-architecture-convergence/agent-prompts.md` from **PROMPT 00 through PROMPT 11** in dependency order.

The requested execution window is twelve hours of active engineering work. Pacing labels are guidance, not permission to cut requirements. If an early phase overruns, continue the task graph rather than skipping work. If implementation finishes early, use remaining active capacity for:

- exhaustive post-audit repetitions;
- adversarial boundary/failure/race testing;
- migration interruption/retry/idempotency testing;
- worker stale-result races;
- long exploration/teleport/dense-edit/save stress;
- benchmark repetitions and hot-path profiling;
- memory/geometry/job/listener/resource leak hunting;
- deterministic worldgen/replay/golden validation;
- E2E flake/root-cause analysis;
- full diff review and spec/source reconciliation;
- canonical CI/evidence closure.

Do not idle and do not invent unrelated product features merely to fill time. Stop early only for a genuine durable blocker when no safe independent 253 task remains; checkpoint it precisely.

## Prompt queue summary

- **PROMPT 00:** rebaseline, activate 253, repair governance/state validation, capture baselines.
- **PROMPT 01:** exhaustive every-file inventory + characterization.
- **PROMPT 02:** canonical live block-state authority; eliminate split truth.
- **PROMPT 03:** bind Overworld; modern generation and column/section streaming.
- **PROMPT 04:** section rendering, lighting and stale-worker correctness.
- **PROMPT 05:** gameplay/simulation/entity/block-entity migration.
- **PROMPT 06:** persistence, legacy migration, recovery, import/export.
- **PROMPT 07:** modularity hardening and compatibility-adapter deletion.
- **PROMPT 08:** performance/resource reconciliation and stress.
- **PROMPT 09:** whole-repository post-audit + adversarial defect hunt.
- **PROMPT 10:** full verification, E2E certification, spec reconciliation.
- **PROMPT 11:** publish, canonical CI evidence, archive, remaining-time hardening.

The full instructions are in `agent-prompts.md`; do not treat this summary as a substitute.

## Validation contract

Use focused tests after every logical unit, then complete closure at minimum includes:

```bash
npm run validate-state
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

Also run:

- 253 exhaustive inventory pre/post;
- every targeted 253 suite;
- repository-required dependency/security/file audits;
- semantically comparable Change-254 benchmarks;
- generation/mesh/light queue stress;
- exploration/teleport resource plateau stress;
- dense multi-section edit stress;
- dirty-save/migration/import stress;
- exact canonical GitHub Actions evidence required by `REVIEW_HANDOFF.md` and state policy.

Do not fabricate evidence. A failed/unverified mandatory requirement blocks VERIFIED status.

## Git and durable-state behavior

- Begin from current remote main and record `session_start_head`.
- Reconcile `Planned-From` with newer landed work; never clobber it.
- Update tasks/verification/program state after meaningful groups, failures, successful verification, before compaction and before ending.
- Commit coherent checkpoints with detailed engineering messages.
- Publish to `origin/main` normally as repository policy requires.
- Refetch remote and verify exact head after publication.
- Never force-push or rewrite published history.
- Mark `Status: COMPLETED` here only after 253 is truthfully VERIFIED/archived and the final published state is self-consistent. This condition is satisfied by canonical run `33256432099` on candidate `bbffe560706841d5ef44ebfe7f74f6b2dda6279d`.

## Definition of Done

The campaign is complete only when:

- normal playable `Game` uses dimension-aware canonical `ChunkColumn`/`ChunkSection` block-state truth;
- active Overworld valid Y is `[-64,319]` through real runtime composition;
- legacy `Chunk`/overlay is not another writable production authority;
- generation/streaming/render/light/gameplay/simulation/entity/persistence consumers converge on canonical state;
- legacy world data migrates/loads safely, idempotently and without silent loss;
- property-bearing states round-trip live and durably;
- negative-Y and vertical-boundary real-play behavior is proven;
- worker stale-result and resource/disposal invariants are proven;
- Change-254 comparable performance remains defensible;
- exhaustive pre/post scan leaves zero unclassified production legacy authority and zero unresolved Critical/High blockers;
- mandatory local tests, stress/bench and full E2E satisfy repository policy;
- exact published candidate has truthful canonical CI/release evidence;
- OpenSpec/state/tasks/verification match implementation;
- intended changes are published and remote head verified;
- 253 reaches 100% task completion unless a repository-valid explicit advancement exception is both necessary and proven.

## Final executor report

Report exactly:

- `session_start_head`;
- implementation candidate SHA(s);
- final `published_head`;
- 253 lifecycle status;
- completed / total tasks and percentage;
- pre/post exhaustive inventory counts and unresolved classifications;
- mandatory local command results with exact unit/E2E counts;
- benchmark/resource/stress summary;
- migration/property-preservation evidence;
- canonical CI run/job evidence;
- fixed Critical/High findings;
- residual non-blocking debt;
- blockers, if any;
- next exact action.

## Human one-line handoff

After the executor pulls the repository, the only instruction needed is:

> Change 253 is complete. Its 138/138 task ledger, hosted resource evidence, exact-SHA canonical gate/E2E evidence, archived OpenSpec package, synced capability spec, and terminal program state are authoritative. No further 253 execution is required.