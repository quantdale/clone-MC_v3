# Tasks: 003-generic-registry-core

> Status: **VERIFIED. 41 / 41 tasks = 100%.**

## 1. Entry gate and baseline

- [x] 1.1 Confirm 002 is VERIFIED, advancement allowed, and program state activates 003 before modifying production code.
- [x] 1.2 Run and record the full pre-change repository baseline.
- [x] 1.3 Re-read 002 ResourceId API and use its canonical serialization rather than duplicating identifier validation.

## 2. Generic registry implementation

- [x] 2.1 Add generic immutable `RegistryEntry<T>` metadata with runtime ID, ResourceId, and value.
- [x] 2.2 Add registry storage keyed by canonical ResourceId and dense runtime-ID array.
- [x] 2.3 Implement registration assigning the next dense runtime ID.
- [x] 2.4 Reject duplicate ResourceId registration without changing original entry, size, or ID sequence.
- [x] 2.5 Implement strict ResourceId lookup.
- [x] 2.6 Implement optional ResourceId lookup that returns undefined for missing IDs.
- [x] 2.7 Implement O(1) runtime-ID lookup with integer/range validation.
- [x] 2.8 Implement ResourceId → runtime-ID lookup.
- [x] 2.9 Implement deterministic registration-order/runtime-ID-order entry iteration.
- [x] 2.10 Implement one-way finalize/freeze state.
- [x] 2.11 Make repeated finalize idempotent.
- [x] 2.12 Reject registration after finalize without mutating registry state.
- [x] 2.13 Implement stable error categories for duplicate, missing, invalid runtime ID, and finalized mutation cases.

## 3. Unit verification

- [x] 3.1 Test empty registry behavior.
- [x] 3.2 Test dense IDs 0..N-1 in registration order.
- [x] 3.3 Test equivalent independently created ResourceIds resolve the same entry.
- [x] 3.4 Test duplicate registration preserves original entry and next-ID sequence.
- [x] 3.5 Test strict and optional missing ResourceId lookup.
- [x] 3.6 Test runtime lookup for valid IDs and reject negative/fractional/NaN/Infinity/out-of-range IDs.
- [x] 3.7 Test ResourceId-to-runtime-ID round trip.
- [x] 3.8 Test deterministic iteration order.
- [x] 3.9 Test finalize, repeated finalize, and post-finalize registration rejection.
- [x] 3.10 Test failures do not partially mutate the registry.
- [x] 3.11 Test registry with at least two distinct generic value types at compile/runtime test boundaries.

## 4. Scope/compatibility

- [x] 4.1 Confirm existing `BlockRegistry` implementation and behavior are not migrated in 003.
- [x] 4.2 Confirm current saves and numeric BlockId values are unchanged.
- [x] 4.3 Confirm runtime IDs are documented/tested as local ephemeral IDs, not persistent IDs.
- [x] 4.4 Confirm no external dependency is added.

## 5. Final gate

- [x] 5.1 Reconcile implementation against proposal/design/spec.
- [x] 5.2 Run focused generic-registry tests and record exact result.
- [x] 5.3 Run typecheck.
- [x] 5.4 Run lint.
- [x] 5.5 Run full unit suite.
- [x] 5.6 Run build.
- [x] 5.7 Run E2E suite.
- [x] 5.8 Inspect diff for accidental 004+ migration work.
- [x] 5.9 Update verification with exact task count/percentage and requirement evidence.
- [x] 5.10 Update program checkpoint; activate 004 only after VERIFIED.
