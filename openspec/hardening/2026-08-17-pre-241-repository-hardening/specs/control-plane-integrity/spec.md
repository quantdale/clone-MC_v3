# Specification: Control-Plane Integrity

## Requirement CPI-1 — Canonical truth precedence

The repository MUST treat exact-SHA evidence from canonical `origin/main` and its GitHub Actions run as higher authority than stale narrative/local claims about the same published state. Local evidence MAY supplement canonical evidence but MUST be labeled local.

### Scenario: Local green but canonical red
- GIVEN a state document says a change passed locally
- AND the canonical Actions run for the claimed published SHA failed
- WHEN advancement eligibility is evaluated
- THEN the change/interlock is not canonically VERIFIED
- AND the failed canonical run is recorded and reconciled before advancement.

## Requirement CPI-2 — State artifact agreement

`openspec/PROGRAM_STATE.json` and `openspec/PROGRAM_STATE.md` MUST agree on the last completed change, current/next change, status, and published head fields that exist in both representations.

### Scenario: Markdown says 240 complete but JSON says 239
- WHEN the integrity validator runs
- THEN validation MUST fail with the conflicting fields and values
- AND numbered advancement MUST remain blocked.

## Requirement CPI-3 — Exactly one legal implementation state

A numbered change MUST NOT have production/test implementation committed before it is ACTIVE under the sequence rules. Ahead-of-time specification artifacts are permitted only as authoring artifacts.

### Scenario: Inactive 241 code exists
- GIVEN 241 is not ACTIVE
- AND 241-owned source/test behavior exists
- THEN hardening MUST remove/quarantine that implementation while preserving its specs
- AND the state/task ledgers MUST NOT be rewritten to pretend the premature work was validly executed.

## Requirement CPI-4 — Ledger fidelity

Task checkboxes and verification status MUST describe actual code/evidence. A file implemented while its implementation task is unchecked is an integrity failure requiring reconciliation.

### Scenario: Source exists but task is 0%
- THEN the executor MUST identify provenance and either restore the preactivation boundary or legitimately execute the task only after activation; this interlock chooses restoration for Change 241.

## Requirement CPI-5 — Unambiguous publication policy

Governance documents MUST expose one precedence-ordered rule for whether successful sessions publish to `origin/main`. Contradictory “do not push” and “must push” instructions MUST NOT coexist without explicit scope explaining both.

### Scenario: Fresh autonomous session
- WHEN it reads the prescribed governance chain
- THEN it MUST be able to determine publication behavior without guessing.

## Requirement CPI-6 — Machine-checkable invariants

The repository SHALL include a deterministic state-integrity validator that checks at least JSON/Markdown coherence, illegal active/verified combinations, required hardening interlocks, and required provenance fields.

### Scenario: Invalid fixture
- GIVEN a representative stale or contradictory state fixture
- WHEN the validator runs
- THEN it MUST exit non-zero with an actionable diagnostic.

### Scenario: Current valid state
- WHEN the validator runs against the reconciled repository
- THEN it MUST exit zero without mutating files.

## Requirement CPI-7 — Hardening precedence

While this hardening package is not VERIFIED, governance MUST treat advancement to 241 as blocked even if a stale state file names 241 as next.

### Scenario: `/goal` on a fresh session before hardening completion
- THEN the agent MUST execute/resume this interlock rather than start Change 241 implementation.
