# Specification: Change-241 Replay Preactivation Repair

This specification governs **repair of the 241 specification package only**. It does not authorize replay implementation while 241 is inactive.

## Requirement RPR-1 — No replay implementation before activation

While Change 241 is not ACTIVE, replay-specific production/test implementation introduced for 241 MUST be absent from the active codebase. Future 241 specs remain present.

## Requirement RPR-2 — Tick-seed cardinality is singular and testable

The 241 package MUST choose one coherent cardinality model for `tickSeeds` and apply it consistently across types, invariants, valid/invalid examples, tasks, and verification.

### Scenario: `maxTick = 3`
- THEN the same explicit rule determines whether zero, three, sparse, or another count is valid; no scenario may contradict the normative invariant.

## Requirement RPR-3 — Stream ownership API

The 241 design MUST expose an explicit mechanism by which simulation systems consume the same deterministic RNG stream instances governed by replay verification. Test-only closure side channels MUST NOT be the required integration mechanism.

### Scenario: System requests named stream
- THEN the ownership API returns the verifier/simulation-governed stream for that name with deterministic creation/order semantics.

## Requirement RPR-4 — Seed state-transition model

The spec MUST define whether recorded values are initial stream seeds, pre-tick states, post-tick states, or another representation, including when state is set/read and how consumption advances it.

## Requirement RPR-5 — Canonical recording values

The spec MUST define the complete accepted value domain and canonical encoding. Unsupported values MUST fail deterministically with a typed/structured reason rather than being silently normalized by incidental `JSON.stringify` behavior.

## Requirement RPR-6 — Deep snapshot behavior

Capture/validation MUST define whether returned recordings are deeply immutable snapshots. If snapshot semantics are required, nested payload mutation after capture MUST NOT mutate the recording or future hash/comparison results.

## Requirement RPR-7 — Hash versioning

State-hash canonicalization MUST be versioned or otherwise contractually stable, including treatment of object key order, numeric edge cases (`-0`, non-finite values if accepted), undefined/missing keys, arrays, symbols, cycles, and non-plain objects.

## Requirement RPR-8 — Failure comparison

Replay comparison MUST include failure presence/type/tick/reason in equivalence semantics. Expected failure vs actual success MUST produce a mismatch even if all available state hashes match.

## Requirement RPR-9 — Honest fixture provenance

Pinned fixtures MUST document exactly how they were produced and the implementation SHA/verification status. Before legitimate 241 implementation is verified, fixtures MUST NOT claim verified provenance.

## Requirement RPR-10 — Activation gate

Change 241 may become ACTIVE only after this hardening interlock is VERIFIED and the repaired 241 package passes the repository spec-authoring/validation gate with no open replay-preactivation findings.
