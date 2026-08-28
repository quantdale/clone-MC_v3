# Spec: generic-registry

## Contract

Provide a reusable typed registry keyed by 002 ResourceId values and backed by compact dense runtime IDs. This change defines registry mechanics only; domain migrations begin in 004.

## Invariants

- One ResourceId maps to at most one entry.
- Runtime IDs MUST be non-negative dense integers assigned in deterministic registration order.
- Runtime ID lookup MUST be direct O(1) array lookup.
- Runtime IDs MUST be documented as local to the finalized registry data set and MUST NOT become persistent external identity in 003.
- Finalization is one-way for mutation.
- Failed operations MUST preserve registry size, existing entries, and next runtime ID.

## Requirements

### Requirement: Registration

Registering a previously absent ResourceId SHALL add exactly one entry and assign runtime ID equal to the previous registry size.

#### Scenario: First entries
- **WHEN** A then B are registered into an empty registry
- **THEN** A has runtime ID 0 and B has runtime ID 1.

### Requirement: Duplicate rejection

Registering a ResourceId already present MUST fail and MUST NOT replace the original value or consume a runtime ID.

#### Scenario: Duplicate then new entry
- Register A as ID 0.
- Attempt duplicate A and observe failure.
- Register B.
- B MUST receive ID 1.

### Requirement: ResourceId lookup

Strict lookup by ResourceId SHALL return its value when present and fail predictably when absent. A separately named optional lookup SHALL return undefined when absent.

#### Scenario: Equivalent ResourceId object
- **GIVEN** two separately constructed but logically equal ResourceIds
- **WHEN** one registers an entry and the other is used for lookup
- **THEN** lookup succeeds.

### Requirement: Runtime-ID lookup

Valid runtime IDs SHALL resolve in O(1). Negative, fractional, non-finite, and out-of-range IDs MUST be rejected by strict runtime lookup.

### Requirement: Reverse runtime identity

The registry SHALL expose the runtime ID for a registered ResourceId and preserve the invariant that lookup by that runtime ID resolves the same entry.

### Requirement: Deterministic iteration

Entry iteration SHALL occur in ascending runtime-ID/registration order without locale-dependent sorting.

### Requirement: Finalization

After finalize, registration MUST fail and existing entries MUST remain readable. Calling finalize repeatedly SHALL be safe and MUST NOT change entries or runtime IDs.

### Requirement: Failure atomicity

Duplicate registration, invalid runtime lookup, missing strict lookup, and registration-after-finalize MUST NOT partially mutate registry state.

### Requirement: Generic typing

The registry implementation SHALL be generic over value type and MUST NOT embed block/item-specific properties.

## Error behavior

Stable error categories SHOULD distinguish duplicate identifier, missing identifier, invalid runtime ID, and finalized-registry mutation. Optional lookup is the only missing-ID path expected to return undefined.

## Performance

ResourceId lookup SHOULD be O(1) average via canonical-key map. Runtime-ID lookup MUST be O(1). Iteration MUST be O(n) without sorting. Finalization MAY perform O(n) freezing/copying once.

## Compatibility

003 MUST NOT migrate or alter current `BlockRegistry`, current BlockId numeric values, current save payloads, or gameplay behavior.

## Verification mapping

Unit tests MUST cover registration/IDs, duplicate atomicity, logically equal ResourceIds, strict/optional lookup, invalid runtime IDs, reverse ID lookup, deterministic iteration, finalization/idempotency, post-finalize failure, generic typing, and state invariants after failure. Full repository regressions verify compatibility.
