# Verification: 253-live-world-architecture-convergence

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false
Exception used: false

This file begins intentionally unverified. Do not pre-fill PASS evidence. Replace `PENDING` only after the exact command/test/evidence exists on the implementation candidate.

## Baseline identity

| Item | Evidence | Status |
|---|---|---|
| Planning head | `a8021f55ef233fb8aa0f983905a22a3859add88a` observed during 2026-08-26 planning audit | INFORMATIONAL |
| Execution `session_start_head` | PENDING executor rebaseline | PENDING |
| Starting remote head | PENDING | PENDING |
| Existing 254 state | VERIFIED per canonical program state at planning time | INFORMATIONAL |
| Known pre-existing CI issue | 254 evidence: shallow-checkout/release-lineage `validate-state` defect + separately documented environment-marginal jump E2E | MUST REPRODUCE |

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 truthful activation/governance | PENDING | NOT VERIFIED |
| REQ-2 one canonical writable authority | PENDING | NOT VERIFIED |
| REQ-3 Overworld bounds/coordinate correctness | PENDING | NOT VERIFIED |
| REQ-4 lazy/bounded residency | PENDING | NOT VERIFIED |
| REQ-5 modern generation -> canonical storage | PENDING | NOT VERIFIED |
| REQ-6 section meshing/stale safety | PENDING | NOT VERIFIED |
| REQ-7 dimension-aware lighting | PENDING | NOT VERIFIED |
| REQ-8 gameplay/simulation canonical access | PENDING | NOT VERIFIED |
| REQ-9 exactly-once entity/block-entity lifecycle | PENDING | NOT VERIFIED |
| REQ-10 persistence/safe legacy migration | PENDING | NOT VERIFIED |
| REQ-11 property-bearing state preservation | PENDING | NOT VERIFIED |
| REQ-12 bounded performance/resources | PENDING | NOT VERIFIED |
| REQ-13 exhaustive pre/post audit | PENDING | NOT VERIFIED |
| REQ-14 playable vertical-world journey | PENDING | NOT VERIFIED |
| REQ-15 regression/publication gate | PENDING | NOT VERIFIED |

## Mandatory command matrix

Run from the exact intended candidate unless the row explicitly says baseline.

| Command / check | Result | Evidence / notes |
|---|---|---|
| `git status --short --branch` + `git rev-parse HEAD` + remote-head check | PENDING | record execution start/candidate/published identity |
| `npm run validate-state` baseline before governance repair | PENDING | reproduce/classify known defect |
| `npm run validate-state` after 253 activation/repair | PENDING | MUST PASS before world production edits |
| `npm run typecheck` baseline | PENDING | capture starting state |
| `npm run lint` baseline | PENDING | capture starting state |
| `npm test` baseline | PENDING | capture exact tests/skips |
| `npm run build` baseline | PENDING | capture exact result/bundle data |
| Change-254 benchmark suite baseline | PENDING | capture comparable benches |
| 253 pre-migration exhaustive inventory | PENDING | artifact path/hash/summary |
| focused canonical-storage tests | PENDING | exact files/counts |
| focused generation/streaming tests | PENDING | exact files/counts |
| focused render/light/stale-job tests | PENDING | exact files/counts |
| focused gameplay/simulation tests | PENDING | exact files/counts |
| focused persistence/migration tests | PENDING | exact files/counts |
| migration idempotency/failure tests | PENDING | exact files/counts |
| entity/block-entity lifecycle tests | PENDING | exact files/counts |
| 253 post-migration exhaustive inventory | PENDING | zero-unclassified-hit evidence |
| Change-254 comparable benches after migration | PENDING | before/after deltas |
| exploration/teleport resource stress | PENDING | plateau evidence |
| dense multi-section edit stress | PENDING | localized work/bounds evidence |
| dirty-save/migration stress | PENDING | queue/storage evidence |
| `npm run validate-state` final candidate | PENDING | MUST PASS |
| `npm run typecheck` final candidate | PENDING | MUST PASS |
| `npm run lint` final candidate | PENDING | MUST PASS |
| `npm test` final candidate | PENDING | exact files/tests/skips; mandatory suite green |
| `npm run test:coverage` final candidate | PENDING | repository thresholds |
| `npm run build` final candidate | PENDING | MUST PASS |
| required dependency/security/file-audit checks | PENDING | enumerate exact commands |
| `npm run test:e2e` final candidate | PENDING | include REQ-14 journey |
| publish candidate to `origin/main` | PENDING | candidate SHA |
| canonical GitHub Actions `gate` exact candidate | PENDING | MUST satisfy repository release policy |
| canonical GitHub Actions `e2e` exact candidate | PENDING | MUST satisfy repository release policy |
| lineage-valid evidence/state follow-up commit | PENDING | evidence SHA / published head |
| final remote-head refetch | PENDING | `published_head` |

## Exhaustive inventory evidence

### Pre-migration

Artifact: PENDING
Scanner/tool version: PENDING
Tracked files scanned: PENDING
Production hits: PENDING
Test/migration-only hits: PENDING
Unclassified hits: PENDING
Critical/High blockers: PENDING

Required disposition set:

- `REMOVE`
- `MIGRATE`
- `PROJECTION_ONLY`
- `MIGRATION_ONLY`
- `TEST_ONLY`
- `INTENTIONAL_COMPATIBILITY_WITH_EXPIRY`
- `BLOCKER`

### Post-migration

Artifact: PENDING
Tracked files scanned: PENDING
Remaining legacy references: PENDING
Unclassified production hits: **must be 0**
Remaining Critical/High blockers: **must be 0**

## Coordinate and canonical-state evidence

Record explicit results for at least:

- Y: `-65,-64,-33,-32,-17,-16,-1,0,15,16,31,32,63,64,319,320`;
- X/Z: negative and positive chunk boundaries `-17,-16,-1,0,15,16`;
- out-of-range read/write non-allocation;
- absent-air read non-allocation;
- default-state ID projection;
- property-bearing state exact semantics;
- dirty/heightmap/neighbor invalidation.

Evidence: PENDING

## Generation / streaming evidence

Record:

- active `OVERWORLD_DIMENSION_TYPE` bound through normal `Game` composition;
- deterministic seed/world-version fixtures;
- modern generation committing into canonical sections;
- existing-world compatible-baseline policy;
- spawn/readiness behavior outside old 0..63 assumptions;
- sparse columns not eagerly materializing 24 sections;
- unload/reload preserving edits/state.

Evidence: PENDING

## Rendering / lighting / stale-job evidence

Record:

- canonical section key format;
- interior edit invalidation set;
- horizontal-face edit invalidation set;
- vertical-face edit invalidation set;
- stale mesh/light result rejection after mutation/unload/replacement;
- negative-Y and top-bound light behavior;
- geometry/resource disposal exactly once;
- visual evidence if used.

Evidence: PENDING

## Gameplay / simulation evidence

Record focused evidence for:

- player collision below zero;
- raycast/selection negative/high Y;
- mine/place across 15/16 and at least one additional vertical section boundary;
- scheduled/random tick world access outside old slab;
- fluids/block behaviors discovered by audit;
- entity and block-entity lifecycle;
- debug/shared-simulation/network projections using canonical truth.

Evidence: PENDING

## Persistence / migration evidence

Record every legacy payload fixture supported by pre-253 runtime and map it to:

- decoder/validator;
- canonical conversion;
- property preservation;
- transactional/durable commit;
- idempotent retry/restart;
- malformed/corrupt handling;
- quota/private-mode/partial-write behavior;
- dirty unload failure behavior;
- import/export round trip;
- entity/block-entity dedupe.

Evidence: PENDING

## Playable REQ-14 journey

Test name/path: PENDING

Required proof:

1. normal `Game` composition root boots;
2. active dimension exposes expected Overworld range;
3. valid below-zero content is traversed/interacted with;
4. vertical section boundary edit occurs;
5. property-bearing state is mutated/observed;
6. render/collision sees the canonical mutation;
7. save/reload preserves exact semantics;
8. column unload/reload preserves exact semantics;
9. no hidden legacy-only mutation hook is the authoritative shortcut.

Result: PENDING

## Performance and resource evidence

### Change-254 comparable benchmarks

| Bench | Baseline | Final | Delta | Disposition |
|---|---:|---:|---:|---|
| PENDING |  |  |  |  |

Any material regression requires root-cause analysis. Do not delete/relabel a comparable benchmark merely because it regresses.

### Canonical resource metrics

Record units and measured bounds for:

- resident columns;
- allocated sections;
- section geometries;
- pending generation/mesh/light/save jobs;
- dirty columns/sections;
- entities/block entities;
- storage/migration health;
- memory where repository tooling exposes it.

Evidence: PENDING

### Budget changes

No threshold may change without:

1. old unit/threshold;
2. new unit/threshold;
3. before/after measurement;
4. architecture rationale;
5. proof the change does not simply hide a regression.

Changes/evidence: PENDING

## Edge / adversarial validation

Must cover:

- out-of-range write never allocating;
- malformed/partial legacy payload;
- migration interrupted before durable commit;
- repeated migration/startup;
- dirty unload save failure;
- async worker result after edit/unload/replacement;
- rapid teleport/residency churn;
- dense edits across vertical boundaries;
- import collision/duplicate IDs;
- entity/block-entity dedupe races;
- pagehide/abrupt-close where testable;
- storage quota/private-mode/degraded health;
- current debug/test hooks cannot diverge from canonical store.

Evidence: PENDING

## Regression disposition

Every failure observed during 253 verification must be classified with evidence as one of:

- `253_REGRESSION` — fix before verification;
- `PRE_EXISTING_REPRODUCED_AT_SESSION_START` — cite exact starting-head reproduction and determine whether it blocks 253 governance;
- `ENVIRONMENT_LIMITATION` — only if repository policy permits and objective evidence supports it;
- `INTENTIONAL_SPEC_CHANGE` — only after the normative spec is explicitly amended/authorized.

Unexplained failures block verification.

## Regressions

PENDING

## Incomplete tasks

PENDING. List exact unchecked tasks and why.

## Advancement Exception

Not applicable unless completion is 90–99.99% and repository policy permits an explicit exception. The default and expected outcome for this campaign is 100% completion.

If used, it MUST prove every incomplete task is non-blocking and implements/verifies no mandatory requirement. Critical/High data-loss/corruption/determinism/compatibility/security/architecture defects can never be waived through this section.

## Publication / CI evidence

`session_start_head`: PENDING
Implementation candidate: PENDING
Canonical CI run(s): PENDING
Evidence/state commit: PENDING
`published_head`: PENDING
Remote-head verification: PENDING

## Final decision

NOT VERIFIED.

Do not change this decision until the requirement table, mandatory command matrix, exhaustive post-audit, full regression gate, exact publication and canonical CI evidence are complete and truthful.