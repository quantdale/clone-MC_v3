# Design: 005-tag-registry

## Target

A tag belongs to exactly one typed registry domain and resolves to an immutable set of registry runtime IDs after validation/finalization.

## Invariants

- Tag IDs are ResourceIds and unique within a tag registry.
- Direct members must exist in the associated value registry.
- Nested tag references must exist in the same tag registry.
- Cycles are invalid.
- Repeated/transitive members appear once in resolved membership.
- Resolution order is deterministic.
- Membership queries after finalize do not recursively expand definitions.
- Finalized tag membership cannot mutate until a future explicit reload mechanism exists.

## Representation

A definition stores ordered references of two kinds: direct resource member or nested tag reference. During finalization, use depth-first resolution with visiting/resolved states for cycle detection, then store a Set/bitset-like structure of runtime IDs plus deterministic ordered member output where needed for tests/debugging.

## Failure behavior

Duplicate tag IDs, missing direct members, missing nested tags, and cycles fail finalization and must not expose a partially finalized membership graph.

## Performance

Finalization may be proportional to definitions and transitive edges. Membership after finalization should be constant-time average or better. Repeated membership checks must not re-run graph traversal.

## Verification

Unit tests cover direct membership, nested membership, dedupe, deterministic order, duplicate definitions, missing references, self-cycle, multi-tag cycle, finalization, and post-finalize immutability.
