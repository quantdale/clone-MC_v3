# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **001-autonomous-program-control — VERIFIED 100%**
- Active implementation change: **002-resource-id-foundation**
- Next change: **003-generic-registry-core**
- 002 task ledger: **40 total tasks, 0 completed**
- 002 completion: **0%**
- 002 advancement allowed: **No**
- 002 implementation/tests: **not started by the initial spec-authoring pass**
- Next exact action: read all 002 artifacts, confirm 001, inspect actual Git/code state, then execute the baseline/characterization tasks before implementing ResourceId.

## Machine-state reconciliation note

`openspec/PROGRAM_STATE.json` correctly identifies 002 as active but its initial task counters may still show zero total tasks because a later counter-update write was not accepted. The active `002-resource-id-foundation/tasks.md` is authoritative for checkbox counting and contains 40 tasks. On the next `/goal` session, reconcile the JSON counters to `completedTasks=0`, `totalTasks=40`, and `currentTask=1.1` before or alongside the first checkpoint update.

This discrepancy does **not** authorize advancement. Use the more conservative state: 002 remains ACTIVE, unimplemented, and blocked from advancing.

## Read order

1. `AGENTS.md`
2. `openspec/AUTONOMOUS_GOAL.md`
3. `openspec/PROGRAM_STATE.json`
4. this file
5. `openspec/CHANGE_SEQUENCE.md`
6. `openspec/CHANGE_SEQUENCE_OVERRIDES.md`
7. all active-change artifacts
8. `openspec/SPEC_AUTHORING_PROTOCOL.md` when a future package is incomplete

Actual repository/test state overrides stale optimistic checkpoint information.

## Pre-authored coverage

The initial authoring pass created the ordered program through change 250 and pre-authored OpenSpec artifacts through the early data foundation (up to 012) with several explicitly recorded future-package gaps.

Read `openspec/CHANGE_SEQUENCE_OVERRIDES.md` for:

- canonical directory-name overrides for 008 and 009;
- future missing artifacts that MUST be repaired before those changes can become ACTIVE.

A missing artifact is a hard spec-quality block, never implicit completion.

## Completion arithmetic

For the active change:

```text
completion = completed task checkboxes / total task checkboxes * 100
```

Partial tasks remain unchecked.

## Advancement rules

- Target: **100%** tasks plus every MUST/SHALL requirement and required check passing.
- Below **90%**: advancement forbidden.
- 90-99.99%: only an explicit documented non-blocking Advancement Exception can permit advancement.
- Any failed/unverified mandatory requirement or required check blocks advancement regardless of percentage.

## Checkpoint requirements

At meaningful progress, blocker/failure discovery, successful verification, change transition, session end, or expected compaction, persist:

- active change/task;
- last completed task;
- exact completion percentage;
- focused/full validation results;
- Git HEAD when known;
- changed files when known;
- blockers;
- next exact action.

Update `PROGRAM_STATE.json`, active `tasks.md`, active `verification.md`, and this summary when materially changed.

## Resume rule

Never assume the previous session completed its intended last action. Inspect code/Git/tests, rerun the active resume checks, repair stale state, then continue the first unchecked task.
