# Design: 011-loot-table-data-model

## Target

A loot table is immutable registered data evaluated against a typed context and an injected random source. Evaluation returns zero or more stack outputs without directly mutating inventory/world state.

## Invariants

- Table IDs are unique ResourceIds.
- Pool roll counts are finite positive integers within a documented maximum.
- Item entry references resolve before finalization.
- Weights are finite positive integers.
- Quantity bounds are positive integers with min <= max and within item stack/output safety limits.
- Conditions are pure context predicates; a failed condition suppresses only the scoped pool/entry.
- Evaluation output count is bounded by validated table limits.
- Randomness comes only from the caller-provided source.
- Invalid tables never become evaluable.

## Evaluation model

Each pool executes its bounded roll count when pool conditions pass. Eligible entries are filtered by entry conditions. A fixed single entry can be emitted directly; weighted selection uses the injected source. Quantity is fixed or sampled from an inclusive range. Results are returned as stack values for the caller to insert/spawn.

## Current migration

Replace direct block `dropItem`/special-case output logic with per-block loot-table references. Current blocks receive tables reproducing current outputs exactly, including any current extra deterministic drop behavior.

## Failure behavior

Reject missing items/tables, invalid roll counts, invalid weights, invalid quantity ranges, invalid component output data, and tables whose validated maximum output exceeds the safety bound. Evaluation with no eligible entries yields no output for that roll rather than throwing.

## Performance

Current tables are tiny. Evaluation cost is bounded by configured pools/rolls/entries and MUST not allocate unbounded output. No global random source is introduced.

## Verification

Tests cover fixed outputs, multiple pools, weighted selection with deterministic fake random values, quantity bounds, conditions, invalid definitions, output bounds, current block-drop equivalence, and removal of current direct special-case drop logic.
