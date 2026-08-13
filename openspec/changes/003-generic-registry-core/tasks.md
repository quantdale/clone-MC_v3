# Tasks: 003-generic-registry-core

> Status: **PLANNED. Do not implement until 002 is VERIFIED.**

## 1. Entry gate and baseline

- [ ] 1.1 Confirm 002 is VERIFIED, advancement allowed, and program state activates 003 before modifying production code.
- [ ] 1.2 Run and record the full pre-change repository baseline.
- [ ] 1.3 Re-read 002 ResourceId API and use its canonical serialization rather than duplicating identifier validation.

## 2. Generic registry implementation

- [ ] 2.1 Add generic immutable `RegistryEntry<T>` metadata with runtime ID, ResourceId, and value.
- [ ] 2.2 Add registry storage keyed by canonical ResourceId and dense runtime-ID array.
- [ ] 2.3 Implement registration assigning the next dense runtime ID.
- [ ] 2.4 Reject duplicate ResourceId registration without changing original entry, size, or ID sequence.
- [ ] 2.5 Implement strict ResourceId lookup.
- [ ] 2.6 Implement optional ResourceId lookup that returns undefined for missing IDs.
- [ ] 2.7 Implement O(1) runtime-ID lookup with integer/range validation.
- [ ] 2.8 Implement ResourceId → runtime-ID lookup.
- [ ] 2.9 Implement deterministic registration-order/runtime-ID-order entry iteration.
- [ ] 2.10 Implement one-way finalize/freeze state.
- [ ] 2.11 Make repeated finalize idempotent.
- [ ] 2.12 Reject registration after finalize without mutating registry state.
- [ ] 2.13 Implement stable error categories for duplicate, missing, invalid runtime ID, and finalized mutation cases.

## 3. Unit verification

- [ ] 3.1 Test empty registry behavior.
- [ ] 3.2 Test dense IDs 0..N-1 in registration order.
- [ ] 3.3 Test equivalent independently created ResourceIds resolve the same entry.
- [ ] 3.4 Test duplicate registration preserves original entry and next-ID sequence.
- [ ] 3.5 Test strict and optional missing ResourceId lookup.
- [ ] 3.6 Test runtime lookup for valid IDs and reject negative/fractional/NaN/Infinity/out-of-range IDs.
- [ ] 3.7 Test ResourceId-to-runtime-ID round trip.
- [ ] 3.8 Test deterministic iteration order.
- [ ] 3.9 Test finalize, repeated finalize, and post-finalize registration rejection.
- [ ] 3.10 Test failures do not partially mutate the registry.
- [ ] 3.11 Test registry with at least two distinct generic value types at compile/runtime test boundaries.

## 4. Scope/compatibility

- [ ] 4.1 Confirm existing `BlockRegistry` implementation and behavior are not migrated in 003.
- [ ] 4.2 Confirm current saves and numeric BlockId values are unchanged.
- [ ] 4.3 Confirm runtime IDs are documented/tested as local ephemeral IDs, not persistent IDs.
- [ ] 4.4 Confirm no external dependency is added.

## 5. Final gate

- [ ] 5.1 Reconcile implementation against proposal/design/spec.
- [ ] 5.2 Run focused generic-registry tests and record exact result.
- [ ] 5.3 Run typecheck.
- [ ] 5.4 Run lint.
- [ ] 5.5 Run full unit suite.
- [ ] 5.6 Run build.
- [ ] 5.7 Run E2E suite.
- [ ] 5.8 Inspect diff for accidental 004+ migration work.
- [ ] 5.9 Update verification with exact task count/percentage and requirement evidence.
- [ ] 5.10 Update program checkpoint; activate 004 only after VERIFIED.
