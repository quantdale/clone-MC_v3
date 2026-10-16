# Spec: program-control

## Contract

- **Purpose:** Guarantee that a long-running autonomous development program can recover its exact ordered state from repository files across context compaction and fresh sessions.
- **Scope:** Program ordering, current-state persistence, task accounting, advancement gates, resume/checkpoint behavior, and pre-implementation spec authoring.
- **Out of scope:** Runtime game mechanics and external scheduling infrastructure.
- **Dependencies:** None.

## Definitions

- **Active change:** The one numbered parity change whose implementation may currently modify production behavior.
- **Mandatory requirement:** Any normative MUST, SHALL, or MUST NOT statement in the active spec package.
- **Required check:** A test/build/lint/typecheck/E2E/inspection command declared mandatory by the active verification contract.
- **Checkpoint:** Repository-persisted summary sufficient to identify current work, evidence state, blockers, and next action.
- **Advancement:** Changing the active implementation change from N to N+1.
- **Advancement exception:** Explicit permission at 90-99.99% completion when every incomplete task is non-mandatory and non-blocking.

## Invariants

1. There MUST be one canonical machine-readable current-state file.
2. There MUST be one canonical numeric change sequence.
3. No higher-numbered production implementation MAY begin while a lower-numbered active change is unverified.
4. Completion percentage MUST NOT override a failed or unverified mandatory requirement.
5. Evidence MUST NOT be recorded as passing before it actually exists.
6. Resume behavior MUST verify actual repository state before assuming the last intended action succeeded.

## Requirements

### Requirement: Durable session recovery

The repository SHALL contain first-read instructions and machine/human state sufficient for a fresh session to identify the active change, its status, the last completed change, the next queued change, completion state, gate state, blockers, and next exact action.

#### Scenario: Fresh session with no prior context
- **GIVEN** a development session has no previous conversation history
- **WHEN** it follows `AGENTS.md`
- **THEN** it can identify the canonical state file and active numbered change
- **AND** it can locate that change's tasks/specification/verification evidence before implementation.

#### Scenario: Stale optimistic checkpoint
- **GIVEN** state claims a task is complete
- **WHEN** actual implementation or required tests do not support that claim
- **THEN** the task MUST be reopened or state reconciled conservatively
- **AND** advancement MUST remain blocked until evidence is restored.

### Requirement: Strict numeric ordering

The program MUST implement numbered changes in ascending order and MUST permit no more than one implementation-ACTIVE numbered change at a time.

#### Scenario: Later change is documented early
- **GIVEN** change N+5 already has a complete spec package
- **WHEN** change N is still active
- **THEN** N+5 production implementation MUST NOT begin.

### Requirement: Completion accounting

Completion MUST equal completed task checkboxes divided by total task checkboxes. A partially implemented task MUST remain unchecked.

#### Scenario: Partial task
- **GIVEN** implementation exists but its required edge-case test fails
- **WHEN** completion is calculated
- **THEN** the task counts as incomplete.

### Requirement: Advancement gate

Normal advancement SHALL require 100% task completion, every mandatory requirement verified, every required check passing, and no unresolved blocking integrity/correctness risk.

Below 90% completion, advancement MUST be false.

At 90-99.99%, advancement MUST remain false unless an explicit Advancement Exception proves every unfinished task is non-mandatory, non-blocking, and not required by the next change.

#### Scenario: 95% but one SHALL requirement unverified
- **THEN** advancement MUST be false.

#### Scenario: 100% tasks but required E2E failing
- **THEN** advancement MUST be false.

#### Scenario: 92% with only optional documentation polish deferred
- **WHEN** mandatory requirements and required checks all pass and an explicit exception proves no dependency/risk
- **THEN** advancement MAY be true.

### Requirement: Checkpointing

The active work state SHALL be checkpointed after material progress, blockers, required-check failures, successful full verification, before change transitions, and before expected session/context boundaries.

#### Scenario: Context compaction
- **GIVEN** compaction is expected
- **WHEN** the agent reaches a safe checkpoint
- **THEN** state MUST record the active task, last completed task, completion percentage, validation summary, blockers, and next exact action.

### Requirement: Spec-before-code for future changes

If a numbered sequence entry lacks a complete OpenSpec package, production implementation MUST NOT begin until `SPEC_AUTHORING_PROTOCOL.md` has been applied and its pre-implementation quality gate passes.

#### Scenario: Only roadmap title exists
- **WHEN** the change becomes next in sequence
- **THEN** proposal/design/tasks/spec/verification artifacts SHALL be authored first
- **AND** ambiguous or placeholder normative behavior MUST be resolved before implementation.

## Error and failure behavior

- Missing canonical state MUST block autonomous advancement until repaired.
- Conflicting durable state MUST be resolved by inspecting actual code/tests and using the conservative status meanwhile.
- A mandatory command that cannot run MUST be recorded as blocked rather than passed.
- An unavailable future spec MUST trigger spec authoring, not ad-hoc implementation.

## Performance and resource bounds

Control files SHOULD remain compact enough that a ~250k-context model normally loads only program control, the active change, and directly affected code/tests rather than the full roadmap.

## Compatibility and migration

This change MUST NOT alter runtime save formats or gameplay behavior. Historical non-numbered OpenSpec changes remain untouched.

## Security and integrity

The control mechanism MUST prevent fabricated verification from being treated as a pass and MUST preserve conservative state when evidence is uncertain.

## Observability

Current change, completion, gate status, blocker summary, and next action MUST be readable from repository state without prior session context.

## Verification mapping

- Durable recovery/order/state: repository inspection of `AGENTS.md`, goal/state/sequence files.
- Advancement semantics: this spec plus config/agent instructions.
- Spec-before-code: `SPEC_AUTHORING_PROTOCOL.md` inspection.
- Runtime non-impact: changed-file inspection showing documentation/control-only scope.
