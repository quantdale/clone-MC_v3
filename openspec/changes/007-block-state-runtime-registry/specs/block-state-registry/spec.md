# Spec: block-state-registry

## Contract

Enumerate canonical immutable block states from 006 property schemas and assign dense runtime BlockStateIds. This change does not migrate world storage.

## Requirements

### Requirement: Complete legal state set
For each block type, the registry SHALL contain exactly the Cartesian product of all declared legal property values. An empty schema SHALL produce exactly one state.

### Requirement: Deterministic enumeration
For identical finalized block definitions, state ordering and runtime IDs MUST be identical across runs, using deterministic block/property/value order.

### Requirement: Default state
Every block type MUST resolve exactly one default state containing one legal value for each property. Invalid default configuration MUST fail state-registry construction.

### Requirement: Dense runtime IDs
Finalized BlockStateIds MUST be non-negative dense integers with direct state lookup. They are local runtime identity and MUST NOT become persistent external identity in 007.

### Requirement: Complete assignment lookup
Lookup by block plus property assignment MUST require exactly the block's declared properties. Missing, extra, unknown, or illegal values MUST fail predictably.

### Requirement: Immutable property transition
Changing one property on a state SHALL return/resolve the canonical registered target state. Existing states MUST NOT mutate.

### Requirement: Cross-block safety
A property or assignment belonging to another block schema MUST NOT be silently accepted.

### Requirement: State-count bound
The implementation MUST define a documented finite per-block state-count limit and MUST reject a schema whose Cartesian product exceeds it before allocating the full state set.

### Requirement: Construction atomicity
Invalid defaults, assignments, or state-count overflow during registry construction MUST NOT expose a partially finalized state registry.

### Requirement: Deterministic debug form
Each state SHALL have a stable inspection/debug representation containing block ResourceId and ordered property assignments. Gameplay hot paths MUST NOT depend on reparsing this text.

## Scenarios

- Empty-schema block -> one state and that state is default.
- Boolean property -> two states.
- Boolean plus three-value property -> six states.
- Repeated construction with the same definitions -> identical state order/IDs.
- `with` a legal new value -> canonical target state.
- `with` current value -> same logical state.
- Unknown property, illegal value, incomplete assignment, or extra assignment -> failure.
- Oversized Cartesian product -> bounded failure before full allocation.

## Performance

State-ID lookup MUST be O(1). Property transitions/assignment lookup SHOULD be O(1) or bounded by property count using precomputed indices/maps. Normal gameplay MUST NOT recompute Cartesian products.

## Compatibility

Current world chunk storage and persistence remain on their existing representation during 007. Existing empty-schema blocks preserve current behavior.

## Verification

Focused tests cover every requirement and scenario; full typecheck/lint/unit/build/E2E gates prove no regressions.
