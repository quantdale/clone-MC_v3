# Verification: 284-live-raid-wave-spawning

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

Authoring session scope: specification package only on branch
`wt/284-live-raid-wave-spawning`. No production implementation, no main
publication, no live `PROGRAM_STATE` mutation from this package alone.

## Authoring quality gate

| Checklist item | Result | Notes |
|---|---|---|
| Change number/name exactly matches `CHANGE_SEQUENCE.md` | NOT YET | `CHANGE_SEQUENCE.md` ends at 282 and reserves `283-live-raid-persistence` as next; 284 is an intentional advance package. Intended id is `284-live-raid-wave-spawning`. Sequence row addition is deferred to activation per `OVERRIDE_DRAFT.md`. |
| Previous change verified / advancement allowed | NOT YET (authoring exception) | 282 is still finishing on `main`. This package does not activate 284 or authorize production edits. Activation requires 282 VERIFIED and no incomplete lower-numbered change (see `OVERRIDE_DRAFT.md` for the 283 ordering constraint). |
| Scope is one narrow outcome | PASS | Spawn/despawn live wave entities via injectable backend only. |
| Proposal: goals, non-goals, deps, preconditions, risks, DoD | PASS | Required `proposal.md` sections present. |
| Design: current + target state, modules/symbols, downstream | PASS | Required `design.md` sections present (including `Performance/resource constraints`). |
| Invariants + deterministic rules explicit | PASS | Design Invariants + spec Invariants. |
| Failure/error behavior explicit | PASS | Design failure-mode table + spec Error/failure section + scenarios. |
| Migration/compatibility explicit | PASS | Additive non-persistent registry; no namespace. |
| Performance/resource bounds explicit | PASS | O(roster) apply, O(1) death, no unbounded retry. |
| Spec uses MUST/SHALL/MUST NOT | PASS | Requirements section. |
| Every MUST/SHALL has ≥1 scenario | PASS | Each requirement has GIVEN/WHEN/THEN scenarios. |
| Boundary/invalid/duplicate/stale/reload/failure scenarios | PASS | Non-finite center, unknown key, duplicate apply, stale generation, rollback, pause, reload, double dispose, double death. |
| Tasks: impl, unit, integration, edge, regression, docs/state, final gate | PASS | T1–T12 groups A–F. |
| Verification maps requirements → evidence | PASS | Requirement evidence + verification mapping table. |
| Baseline regression gate declared | PASS | typecheck/lint/test/build/e2e in Required gates. |
| No vague placeholders in normative sections | PASS | Package search found no TODO/`etc.` normative stubs. |
| No task silently includes the next numbered change | PASS | 283 persistence excluded; 258 GPU excluded. |

Authoring gate disposition: **PASS for spec-first package completeness**, with
the two sequence-position items explicitly deferred (not silently claimed).
T1 and T2 are complete for this session when the package is committed.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Raider registry keys append-only, non-persistent | Pending implementation | PENDING |
| Pure deterministic fail-closed spawn plan | Pending implementation | PENDING |
| Injectable backend + recording fake + production adapter | Pending implementation | PENDING |
| At-most-once wave apply + duplicate/generation guards | Pending implementation | PENDING |
| Partial failure rollback without tick throw | Pending implementation | PENDING |
| Terminal/clear/replace/dispose idempotent despawn | Pending implementation | PENDING |
| Death exactly-once → `recordRaiderDeath` | Pending implementation | PENDING |
| Pause freeze + reload non-resurrection | Pending implementation | PENDING |
| No bad omen / settlement / new persistence / 258 GPU | Pending implementation + audit | PENDING |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| Authoring quality gate (SPEC_AUTHORING_PROTOCOL checklist) | PASS with deferred sequence-position items | See Authoring quality gate table above; package files only |
| Package file inventory (`proposal`/`design`/`tasks`/`verification`/`specs/live-raid-wave-spawning/spec.md`/`OVERRIDE_DRAFT`) | PASS | Six files present under `openspec/changes/284-live-raid-wave-spawning/` |
| `npx vitest run tests/unit/RaidWaveSpawnPlan.test.ts tests/unit/RaidEntityBackend.test.ts tests/unit/LiveRaidWaveSpawning.test.ts` | PENDING | Not applicable until implementation activates |
| Headless recording-backend integration | PENDING | Required at implementation; no GPU |
| `npm run typecheck` | PENDING | Run at implementation verification |
| `npm run lint` | PENDING | Run at implementation verification |
| `npm test` | PENDING | Run at implementation verification |
| `npm run build` | PENDING | Run at implementation verification |
| `npm run test:e2e` | PENDING | Run at implementation verification |
| file-audit | PENDING | New files reviewed when implemented on main |
| `npm run validate-state` | PENDING | Only when control-plane state is updated at activation on main |

## Edge/adversarial validation

Pending implementation: non-finite center, unknown typeKey all-or-nothing,
duplicate wave apply, backend mid-wave throw rollback, double death, unknown
death id, stale generation, double dispose, pause without spawn, reload
without resurrection, append-only registry stability.

## Migration/compatibility validation

Pending. Intended contract: additive registry rows only, `isPersistent`
false for raiders, no new namespace, no `SerializedRaid` change, no 282
projection change.

## Performance/resource validation

Pending. Intended bound: O(roster) per wave apply, O(1) per death, no
unbounded retry, no new worker/GPU path.

## Regressions

Pending at implementation. Must hold: Change 258 remains BLOCKED; Changes
259–281 remain VERIFIED; Change 282 feedback behavior remains the authority
for HUD/ephemeral state; Change 152 machine tests remain green; existing
wither/HUD/container/smoker/furnace journeys remain green.

## Incomplete tasks

T3–T12 are pending activation. T1–T2 are complete for the authoring session
(package authored + quality gate recorded). T3–T12 require activation after
282 VERIFIED per override/sequence rules.

## Advancement Exception

Not applicable. The target is 100%. This package does not claim advancement
while status is NOT VERIFIED.

## Final decision

NOT VERIFIED — specification package authored; authoring quality gate PASS
with sequence-position deferrals documented; implementation and all command
evidence remain pending activation.
