# Design: 007-block-state-runtime-registry

## Target

A finalized block-state registry maps each legal `(block type, complete property assignment)` to one immutable state and one dense runtime `BlockStateId`.

## Invariants

- Every state belongs to exactly one registered block type.
- Every declared property appears exactly once in every state for that block.
- Every state value belongs to the property's legal domain.
- Empty-schema blocks have exactly one state.
- Each block has exactly one valid default state.
- State enumeration and IDs are deterministic for the same finalized block registry/property schemas.
- Runtime state IDs are local to the finalized data set and are not yet a persistence guarantee.
- A property update returns/resolves another canonical registered state rather than mutating a state object.

## Enumeration

Use deterministic block runtime-ID order. Within a block, use authored property order and each property's authored legal-value order to enumerate the Cartesian product. Define a conservative maximum state count per block and fail registration before allocating an excessive product.

## Canonical state key

A state may use an internal compact mixed-radix index or canonical ordered key derived from property indices. Debug text should be deterministic, e.g. `game:oak_log[axis=y]`. Runtime hot lookups should not parse debug text.

## APIs

Required behavior includes:

- block default state;
- state ID to state;
- state to state ID;
- state property read;
- state `with(property, value)` transition;
- lookup from a complete property assignment;
- deterministic state iteration for one block/all blocks.

## Failure behavior

Reject invalid default property names/values, incomplete or extra assignments, values outside the schema, transitions using a property from another block, and state-count overflow. Failures do not create partial finalized states.

## Compatibility

Do not rewrite chunk/world storage or current save payloads in 007. Current blocks may have empty schemas and therefore one state each.

## Performance

Runtime state lookup and property transition should be constant-time or bounded by the small property count, with no Cartesian recomputation during normal gameplay.

## Verification

Focused tests cover empty-schema blocks, one/two/multiple properties, exact state counts, default state, deterministic IDs/order, lookup round trips, transitions, invalid assignments, overflow guard, and failure atomicity.
