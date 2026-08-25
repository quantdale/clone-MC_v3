# Verification: 252-live-world-architecture-convergence

Overall status: **NOT VERIFIED**

- Completion: **0/82 tasks (0%)**
- Mandatory requirements pass: **NO — implementation has not started**
- Required tests pass: **NO — final gate has not run**
- Critical risk open: **YES — live legacy/canonical world split and baseline release-evidence/state failure are the campaign's starting risks**
- Advancement allowed: **NO**
- Exception used: **NO**
- Planner baseline: `254d259c3193b6d7a74d04bf5a117309cd00794a`

This file is intentionally a verification plan at authorization time. No implementation requirement is pre-credited from historical roadmap verification. Historical evidence may establish that a primitive exists, but Change 252 requires evidence that the primitive is consumed correctly by the actual playable path.

## Baseline observation

At the planner baseline, canonical GitHub Actions run `32813182576` is not fully green:

- `e2e`: **SUCCESS**.
- `gate`: **FAILURE** at `npm run validate-state`.
- Observed state errors identify historical `releaseAuthority.candidateSha` / `publicationHistory[].head` SHAs that are not ancestor-or-self of current HEAD.
- Gate steps downstream of state validation were skipped, not independently failing.

This defect is a campaign input, not a verified 252 result. The executor must reproduce/rebaseline it on the actual session-start head.

## Requirement evidence

| Requirement | Status | Required evidence before PASS |
|---|---|---|
| REQ-1 Truthful post-terminal activation/release evidence | PENDING | Sequence/state activation, validator tests, state PASS, final lineage-valid candidate + canonical CI |
| REQ-2 One canonical live block-state authority | PENDING | World/storage implementation tests + zero unclassified writable legacy authority in post-audit |
| REQ-3 Live Overworld bounds/coordinate correctness | PENDING | Boundary matrix at -65,-64,-1,0,15,16,63,64,319,320 + negative x/z routing |
| REQ-4 Lazy bounded residency | PENDING | Non-allocation tests, sparse-section tests, exploration/resource plateau evidence |
| REQ-5 Modern worldgen/streaming canonical integration | PENDING | Deterministic modern generation integration, streaming/readiness/edit-over-generation tests |
| REQ-6 Section meshing/lighting/stale safety | PENDING | Section identity/version/neighbor dirty/stale worker/light boundary tests and live evidence |
| REQ-7 Gameplay/simulation convergence | PENDING | Collision/raycast/mining/placing/ticks/entities/block entities tests + negative-Y playable E2E |
| REQ-8 Legacy compatibility/persistence | PENDING | Characterized legacy fixtures, migration/idempotency/recovery/import-export/live save tests |
| REQ-9 Furnace/core regressions preserved | PENDING | Change-251 targeted suites + full existing E2E/regression pass |
| REQ-10 Resource/performance bounded | PENDING | Before/after measurements, stress tests, evidence for any budget/unit changes |
| REQ-11 Whole-codebase pre/post audit | PENDING | Machine-checkable before/after inventories, dispositions, adversarial downstream review |
| REQ-12 Full certification/publication | PENDING | Full local gate + exact published candidate + canonical `gate`/`e2e` SUCCESS + archival/state reconciliation |

## Mandatory validation matrix

All commands are **NOT RUN for Change 252** at planning time unless stated as a historical baseline observation.

| Check | Planning-time status | Final requirement |
|---|---|---|
| `npm run validate-state` | BASELINE FAIL observed on `254d259c` canonical CI; must be re-run | PASS |
| `npm run typecheck` | NOT RUN for 252 | PASS |
| `npm run lint` | NOT RUN for 252 | PASS |
| `npm test` | NOT RUN for 252 | PASS with exact counts; no unexplained mandatory skip |
| Targeted Change-252 unit/integration suites | NOT CREATED/RUN | PASS |
| `npm run test:coverage` | NOT RUN for 252 | PASS repository thresholds |
| `npm run build` | NOT RUN for 252 | PASS |
| Release bundle / bundle-size checks required by repository | NOT RUN for 252 | PASS |
| Production dependency audit | NOT RUN for 252 | PASS at repository severity threshold |
| Development dependency audit | NOT RUN for 252 | PASS at repository severity threshold |
| File-audit validator / reviewed-manifest checks | NOT RUN for 252 | PASS |
| `npm run test:e2e` | Historical baseline job SUCCESS, not 252 evidence | PASS complete suite including new 252 journeys |
| Canonical exact-SHA GitHub Actions `gate` | NOT RUN for a 252 candidate | SUCCESS |
| Canonical exact-SHA GitHub Actions `e2e` | NOT RUN for a 252 candidate | SUCCESS |

## Required targeted test matrix

### Governance/state

- Post-terminal ACTIVE state is accepted without terminal contradiction.
- 001–251 history remains VERIFIED/archived and unchanged in identity/order.
- Historical non-ancestral evidence is retained only as historical/non-authoritative.
- Final terminal candidate still rejects malformed/non-lineage SHA and non-success canonical jobs.

### Canonical world authority

- Canonical state read/write/default-state projection.
- Stateful property preservation.
- No independent writable state overlay.
- No authoritative legacy slab after convergence.
- Dirty/heightmap/mesh-version mutation propagation.

### Coordinate boundaries

Explicitly cover world Y:

`-65, -64, -1, 0, 15, 16, 63, 64, 319, 320`

Also cover negative x/z section/chunk transitions. For out-of-range Y, prove no mutation and no allocation.

### Generation/streaming

- Deterministic seed fixtures spanning negative coordinates and vertical sections.
- Modern generation commits into canonical block states.
- Edits survive unload/reload/regeneration.
- Spawn/readiness is dimension-aware.
- Sparse columns do not allocate every vertical section.

### Rendering/lighting

- Interior section edit.
- Horizontal section-face edit.
- Vertical section-face edit.
- Stale job after edit.
- Stale job after unload/reload.
- Negative-Y and top-bound light sampling.
- Geometry disposal/resource accounting.

### Gameplay/simulation

- Collision below zero.
- Raycast/mining/placing across `15/16` and `63/64`.
- Tick-driven block/fluid/falling mutation outside legacy range.
- Entity/block-entity lifecycle in negative/upper sections.
- Full furnace Change-251 journey.

### Persistence/migration

- Every characterized supported legacy payload.
- Migration success and second-run idempotency.
- Stateful block property round-trip.
- Dirty unload save and failure requeue/retention.
- Abrupt close / partial write / quota / corrupt or unsupported version behavior.
- Export/import equivalence.
- Negative-Y and upper-section live save/reload.

### Resource/performance

- Resident column/allocated-section accounting.
- Sparse vs dense column behavior.
- Generation/mesh/light backpressure.
- Exploration/teleport plateau.
- Dense edit plateau.
- Save queue and load/save throughput.
- Any changed release budget with measured justification.

## Whole-codebase audit evidence

### Pre-migration audit

Status: **PENDING**

Required artifact/evidence must inventory direct and downstream production consumers of:

- legacy `Chunk` / authoritative `ChunkManager` storage;
- old chunk-height constants/clamps;
- vertical `cy`/`cy === 0` assumptions;
- `stateOverlay`/duplicate block-state maps;
- old chunk/mesh/light/save identity conventions;
- bare-block-id generation/persistence paths that flatten state;
- related tests/debug hooks/resource metrics.

Every relevant occurrence requires a disposition/task owner.

### Post-migration audit

Status: **PENDING**

Required artifact/evidence must rerun the inventory and classify every remaining occurrence as removed, test-only, migration-only, intentionally compatible with expiry/rationale, or blocking. Zero unclassified Critical/High production occurrence is permitted.

### Adversarial downstream review

Status: **PENDING**

Review changed modules plus affected callers for correctness, reliability, data loss, concurrency, determinism, performance, architecture and compatibility. Every discovered Critical/High finding must be fixed with a regression oracle before final verification.

## Migration evidence

Status: **PENDING**

Final verification must identify:

- supported legacy source formats/versions;
- canonical destination version/schema;
- read-old/write-new sequence;
- idempotency mechanism;
- failure/rollback/retention behavior;
- stateful-block preservation evidence;
- entity/block-entity/player/furnace association evidence;
- import/export and recovery results.

## Performance/resource evidence

Status: **PENDING**

Final verification must record comparable before/after measurements for at least resident world units, allocated sections, geometries, pending generation/mesh/light jobs, dirty save units, exploration/teleport churn, dense edits, canonical generation, load, and save flush. Any modified budget requires a rationale based on changed units or measured defensible cost.

## Regression evidence

Status: **PENDING**

The final report must include exact results for the full current unit/E2E suites and targeted Change-251 furnace coverage. Previously passing core gameplay is part of the regression gate, not assumed by compilation.

## Canonical exact-SHA publication evidence

Status: **PENDING**

Before VERIFIED:

1. Publish the implementation candidate to `origin/main` and refetch.
2. Record the exact candidate SHA.
3. Obtain canonical GitHub Actions `gate` SUCCESS and `e2e` SUCCESS for that exact SHA.
4. If either job fails, keep the change unverified and fix/re-publish.
5. In a later evidence/state commit, record the candidate and canonical run/job ids under a lineage-valid release-authority schema.
6. Refetch final `origin/main` and prove the final published head contains the candidate/evidence and matches the session report.

## Incomplete tasks

All 82 tasks in `tasks.md` are incomplete at authorization time.

## Advancement exception

Not applicable. The target is 100% completion. The repository's >=90% explicit-exception path is not pre-authorized for this campaign and cannot waive a mandatory requirement, failed required test, Critical/High risk, migration integrity, or canonical CI proof.

## Final decision

**NOT VERIFIED.** Change 252 is an authorized, execution-ready implementation campaign. Verification begins only as tasks produce evidence; historical verification of underlying primitives does not substitute for proving the live convergence.
