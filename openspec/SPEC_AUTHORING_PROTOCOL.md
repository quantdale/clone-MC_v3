# OpenSpec Authoring Protocol for Future Numbered Changes

This protocol exists so the autonomous `/goal` loop can continue even when a future change in `CHANGE_SEQUENCE.md` has not yet been fully expanded into artifacts. It does **not** permit implementation from a title alone.

## Rule: spec first, implementation second

When the next numbered change directory is absent or incomplete, the agent MUST author and validate the complete OpenSpec package before changing production code for that change.

Required artifacts:

```text
openspec/changes/<NNN-name>/
  proposal.md
  design.md
  tasks.md
  verification.md
  specs/<capability>/spec.md
```

Additional capability spec files are required when one change contains multiple independently testable contracts, but the change itself should be split first whenever those contracts can be delivered independently.

## Pre-implementation spec quality gate

Before production implementation begins, the agent MUST verify all of the following:

- [ ] Change number/name exactly matches `CHANGE_SEQUENCE.md`.
- [ ] Previous change is verified and advancement is allowed.
- [ ] Scope implements exactly one narrow outcome from the sequence.
- [ ] Proposal states goals, non-goals, dependencies, preconditions, risks and definition of done.
- [ ] Design documents current state and exact target state.
- [ ] Design identifies affected modules/symbols and downstream consumers.
- [ ] Data invariants and deterministic rules are explicit.
- [ ] Failure/error behavior is explicit.
- [ ] Migration/backward compatibility is explicit when stored/public data changes.
- [ ] Performance/resource bounds are explicit when hot paths or stored data change.
- [ ] Spec uses MUST/SHALL/MUST NOT for mandatory behavior.
- [ ] Every MUST/SHALL has at least one scenario.
- [ ] Boundary, invalid-input, duplicate/replay, stale-state and failure scenarios are included when applicable.
- [ ] Tasks cover implementation, unit tests, integration tests, edge cases, regression, documentation/state, and final gate.
- [ ] Verification file maps requirements to commands/tests/evidence.
- [ ] Baseline regression gate is declared.
- [ ] There are no vague placeholders (`TODO`, `handle errors`, `etc.`) in normative sections.
- [ ] No task silently includes work belonging to the next numbered change.

If any checkbox fails, fix the spec package before implementation.

## Required `proposal.md` structure

```markdown
# Proposal: <NNN-name>

## Problem
## Goals
## Non-goals
## Preconditions
## Dependencies
## Proposed change
## Compatibility and migration
## Risks
## Rollback strategy
## Definition of Done
## Advancement gate
```

The proposal should be concise enough to orient a new session, while the design/spec contain the detailed contract.

## Required `design.md` structure

```markdown
# Design: <NNN-name>

## Context/current state
## Target state
## Invariants
## API and data model
## Control/data flow
## Detailed behavior
## Failure modes
## Compatibility/migration
## Performance/resource constraints
## Testing seams
## Observability/debugging
## Affected files/symbols
## Rejected alternatives
## Downstream dependencies
```

For data structures, include concrete TypeScript sketches where useful. Sketches describe intent and do not override normative spec requirements.

## Required capability `spec.md` structure

```markdown
# Spec: <capability>

## Contract
## Definitions
## Invariants
## Requirements
### Requirement: ...
#### Scenario: ...
- **GIVEN** ...
- **WHEN** ...
- **THEN** ...
- **AND** ...

## Error and failure behavior
## Performance and resource bounds
## Compatibility and migration
## Security and integrity
## Observability
## Verification mapping
```

Omit a section only when it is truly inapplicable, and state why in the Contract.

## Requirement quality

A requirement is acceptable only if a test author can determine pass/fail without guessing intent.

Bad:

> The registry should handle invalid IDs gracefully.

Good:

> `parseResourceId(input)` MUST reject empty namespace/path, uppercase namespace characters, whitespace, a missing colon when no default namespace is supplied, and characters outside `[a-z0-9_.-]` in the namespace or `[a-z0-9/._-]` in the path. Rejection MUST return/throw the documented validation error and MUST NOT insert a partial registry entry.

## Task sizing

Prefer tasks that touch one conceptual unit and can be validated immediately. Split a task when it combines unrelated production behavior.

Each task group should generally contain:

1. failing/characterization tests or explicit baseline evidence;
2. implementation;
3. focused tests;
4. edge/failure tests;
5. migration/compatibility check if relevant;
6. full regression gate at the end.

## Verification template

`verification.md` begins unverified:

```markdown
# Verification: <NNN-name>

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|

## Commands
| Command | Result | Evidence/notes |
|---|---|---|

## Edge/adversarial validation
## Migration/compatibility validation
## Performance/resource validation
## Regressions
## Incomplete tasks
## Advancement Exception
Not applicable unless completion is 90-99.99%.

## Final decision
```

Never pre-fill passing evidence before commands/tests are actually run.

## Final spec reconciliation

Before marking a change VERIFIED, re-read every artifact and compare it to actual implementation. Update stale specs/design/tasks rather than leaving historical intent that contradicts current behavior.

## Context-window discipline

For a ~250k context model:

- load only the active change, state files, directly affected source/test files, and narrow dependency files;
- do not load the entire 2,500+ line master plan unless the active design requires broader rationale;
- summarize discovered architecture into the active `design.md` or checkpoint state instead of keeping it only in context;
- write state before compaction;
- prefer deterministic command output summaries in `verification.md` over retaining raw logs in context;
- use `CHANGE_SEQUENCE.md` to know future direction without opening future change specs.
