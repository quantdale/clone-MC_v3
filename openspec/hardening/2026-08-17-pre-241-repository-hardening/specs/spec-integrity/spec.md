# Specification: Future Spec Integrity (Changes 241-250)

## Requirement SI-1 — Complete package inventory

Every Change 241-250 package MUST contain the artifacts required by `SPEC_AUTHORING_PROTOCOL.md` before its implementation can become ACTIVE. Missing artifacts are blocking gaps.

### Scenario: Missing verification or capability spec
- THEN that numbered change remains non-implementable and the gap is recorded.

## Requirement SI-2 — Normative consistency

Within each package, MUST/SHALL requirements, invariants, examples, scenarios, design text, task ledger, and verification plan MUST be mutually satisfiable.

### Scenario: Cardinality invariant contradicts valid example
- GIVEN a requirement says one `tickSeeds` entry exists for every tick 1..maxTick
- AND a valid example has `maxTick > 0` with zero tick seeds
- THEN the package fails spec integrity until one coherent contract is chosen and all artifacts are updated.

## Requirement SI-3 — Requirement traceability

Every normative requirement MUST map to at least one scenario, one implementation/validation task, and one verification evidence slot. Every implementation task MUST trace back to a requirement or explicit design obligation.

### Scenario: Requirement has no test/evidence path
- THEN the spec audit marks it incomplete rather than assuming implementation will cover it.

## Requirement SI-4 — Explicit ownership/lifetime semantics

Shared mutable state, RNG streams, worker resources, persistence handles, network ownership, and similar dependencies MUST define creator, consumer, lifetime, mutation authority, and teardown/replacement semantics.

### Scenario: Replay verifier creates streams systems cannot access
- THEN 241 MUST be redesigned at the spec level so systems consume the exact governed streams through an explicit API, not a test-only closure convention.

## Requirement SI-5 — Explicit deterministic seed semantics

Change 241 MUST define exactly what a recorded seed value represents: initialization, per-tick pre-state, per-tick post-state, or another explicit state transition model. Verifier and fixture expectations MUST follow that one model.

### Scenario: Same recording replayed twice
- THEN stream creation/consumption/order is deterministic and mismatch reports identify the earliest divergent tick/stream under the specified model.

## Requirement SI-6 — Canonicalization and immutability

Change 241 MUST define accepted replay payload value types and deep immutability/canonicalization semantics, including object-key ordering, arrays, `undefined`, `NaN`/Infinity if relevant, `-0`, symbols, cycles, and unsupported objects.

### Scenario: Caller mutates original payload after capture
- THEN the captured recording/hash behavior MUST remain unchanged if the payload was valid at capture time.

### Scenario: Semantically equivalent objects have different insertion order
- THEN duplicate detection and canonical hashing MUST follow the specified canonical representation rather than incidental insertion history.

## Requirement SI-7 — Failure trace semantics

Replay comparison MUST specify how expected failure and actual completion/failure are compared. A trace that expected a failure MUST NOT compare identical to an unexpected successful completion merely because tick hashes align.

## Requirement SI-8 — Truthful provenance

No design, fixture, report, or comment may claim “generated from verified implementation” or equivalent before the referenced verification actually exists for the cited SHA.

### Scenario: 241 verification is NOT VERIFIED
- THEN fixtures/specs may state intended provenance or placeholder status, but not verified provenance.

## Requirement SI-9 — Spec-only repair boundary

This hardening interlock MAY edit 241-250 specification artifacts to remove defects. It MUST NOT implement the corresponding future production behavior.

## Requirement SI-10 — Whole-range audit

The executor MUST audit 242-250 with the same contradiction/ownership/failure/migration/performance/evidence rubric used for 241. Known 241 defects do not reduce the obligation to inspect every other future package.
