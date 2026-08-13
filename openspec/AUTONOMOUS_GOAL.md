# Autonomous Goal: Minecraft-Parity Program

## Mission

Continuously evolve `clone-MC_v3` toward the behavior and systemic depth defined in `MINECRAFT_PARITY_MASTER_PLAN.md` by executing the numbered OpenSpec changes in strict order.

This file defines the durable `/goal` loop. It is intentionally self-contained so a fresh CLI session can continue development without prior conversational context.

## Goal loop

Repeat until the parity program is complete:

1. Read `openspec/program-state.json`.
2. Identify `current_change` and verify that no lower-numbered change is incomplete.
3. Read all artifacts in the active change directory:
   - `proposal.md`
   - `design.md`
   - `tasks.md`
   - all `specs/**/spec.md`
   - `verification.md`
4. Reconstruct current work from:
   - task checkboxes;
   - verification evidence;
   - program state;
   - Git status and HEAD when available.
5. Re-run the active change's resume checks before editing code.
6. Execute the first unchecked, unblocked task.
7. Add/adjust tests in the same task or immediately adjacent validation task.
8. Run the narrowest relevant validation after each logical unit.
9. Update task checkboxes only after evidence exists.
10. Periodically checkpoint state files so context loss cannot erase progress.
11. When implementation tasks are complete, set the change to `VERIFYING` and perform the full verification contract.
12. Reconcile implementation against every normative requirement and scenario.
13. Compute task completion exactly: completed checkboxes / total checkboxes × 100.
14. Apply the advancement gate.
15. If verified, update state and activate the next numbered change.
16. If blocked, record the blocker precisely and stop only when no safe independent work inside the active change remains.

## Advancement algorithm

```text
mandatory_requirements_pass = all MUST/SHALL requirements verified
required_tests_pass = all mandatory tests/checks pass
completion = completed_tasks / total_tasks
critical_risk_open = unresolved security/data-loss/corruption/determinism/compatibility blocker

if !mandatory_requirements_pass:
    advancement_allowed = false
else if !required_tests_pass:
    advancement_allowed = false
else if critical_risk_open:
    advancement_allowed = false
else if completion == 1.0:
    advancement_allowed = true
else if completion >= 0.90 and all incomplete tasks are documented non-blocking:
    advancement_allowed = explicit_exception_review == true
else:
    advancement_allowed = false
```

The agent MUST prefer completing the remaining 10% instead of using an exception. Exceptions are for genuinely non-blocking work that cannot be completed in the current environment.

## Headless execution

Assume headless mode by default. Use:

- Vitest for deterministic unit/integration tests;
- Playwright in headless Chromium for browser behavior;
- fixtures for world/save/entity state;
- deterministic seeds for world generation;
- golden hashes/snapshots where appropriate;
- generated screenshots or traces only when visual verification is necessary;
- performance scripts/metrics where performance is normative.

Do not ask for routine approval between tasks or changes.

## State update frequency

Update durable state at minimum:

- after each completed task group;
- after discovering a blocker;
- after a failed mandatory validation;
- after a successful full validation;
- before switching changes;
- before ending a session;
- before an expected context compaction.

## Resume safety

On resume, never assume the previous session successfully committed or completed its last intended action. Verify from repository and test state.

If `program-state.json` and `tasks.md` disagree, treat the more conservative state as authoritative until reconciled. For example, a checked task with missing implementation must be reopened.

## Change ordering

The canonical order is `openspec/CHANGE_SEQUENCE.md`. A higher-numbered change may be prepared/documented in advance, but implementation MUST NOT begin until the current change's `advancement_allowed` is true and the state file activates the next change.

## Program completion

The program is complete only when:

- every planned numbered change is `VERIFIED` or intentionally `DEFERRED` by an explicit product decision;
- the final parity audit passes;
- no unresolved mandatory requirement remains;
- regression and performance suites pass;
- the parity matrix accurately records supported behavior and known differences;
- durable state is marked `COMPLETE`.
