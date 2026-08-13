# Autonomous Goal: Minecraft-Parity Program

## Mission

Continuously evolve `clone-MC_v3` toward the behavior and systemic depth defined in `MINECRAFT_PARITY_MASTER_PLAN.md` by executing the numbered OpenSpec changes in strict order.

This file defines the durable `/goal` loop. It is intentionally self-contained so a fresh CLI session can continue development without prior conversational context.

## Goal loop

Repeat until the parity program is complete:

1. Read the durable program-control files listed by `AGENTS.md`, including `openspec/REVIEW_HANDOFF.md`.
2. At session start, synchronize safely with current `origin/main` and record `session_start_head` before modifying repository files.
3. Read `openspec/PROGRAM_STATE.json` and identify the active numbered change.
4. Verify that no lower-numbered change is incomplete.
5. Read all artifacts in the active change directory:
   - `proposal.md`
   - `design.md`
   - `tasks.md`
   - all `specs/**/spec.md`
   - `verification.md`
6. Reconstruct current work from:
   - task checkboxes;
   - verification evidence;
   - program state;
   - actual Git and repository state.
7. Re-run the active change's resume checks before editing code.
8. Execute the first unchecked, unblocked task.
9. Add or adjust tests in the same task or immediately adjacent validation task.
10. Run the narrowest relevant validation after each logical unit.
11. Update task checkboxes only after evidence exists.
12. Periodically checkpoint state files so context loss cannot erase progress.
13. When implementation tasks are complete, set the change to `VERIFYING` and perform the full verification contract.
14. Reconcile implementation against every normative requirement and scenario.
15. Compute task completion exactly: completed checkboxes / total checkboxes × 100.
16. Apply the advancement gate.
17. If verified, update state and activate the next numbered change. If blocked, record the blocker precisely and stop only when no safe independent work inside the active change remains.
18. Before the final session response, reconcile OpenSpec state, inspect the intended diff, commit the coherent session checkpoint, publish it directly to `origin/main`, verify the remote head, and record `published_head` as required by `openspec/REVIEW_HANDOFF.md`.
19. Final session output must include the starting and published SHAs, active change/status, task completion, validation results, blockers, and next exact action.

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
- before publishing the session checkpoint;
- before ending a session;
- before an expected context compaction.

## Resume safety

On resume, never assume the previous session successfully committed or completed its last intended action. Verify from repository and test state.

If `PROGRAM_STATE.json` and `tasks.md` disagree, treat the more conservative state as authoritative until reconciled. For example, a checked task with missing implementation must be reopened.

The previous session's prose result is not authoritative. For a published session, recover the actual state from `origin/main` and the reported commit SHAs.

## Change ordering

The canonical order is `openspec/CHANGE_SEQUENCE.md`. Resolve any directory-name exception through `openspec/CHANGE_SEQUENCE_OVERRIDES.md`.

A higher-numbered change may be prepared/documented in advance, but implementation MUST NOT begin until the current change's advancement gate is satisfied and the state file activates the next change.

## Publication and external review

The repository uses `origin/main` as the handoff point for review.

A changed session is not fully handed off until its intended work is committed and visible on `origin/main`. Publication does not itself make a change `VERIFIED`; the normal OpenSpec advancement rules still apply.

The session final result must provide enough information for an external reviewer to compare the exact Git range. The reviewer is expected to inspect GitHub directly rather than trusting the prose summary alone.

## Program completion

The program is complete only when:

- every planned numbered change is `VERIFIED` or intentionally `DEFERRED` by an explicit product decision;
- the final parity audit passes;
- no unresolved mandatory requirement remains;
- regression and performance suites pass;
- the parity matrix accurately records supported behavior and known differences;
- durable state is marked `COMPLETE`;
- the final state is published to `origin/main` and independently reviewable from GitHub.
