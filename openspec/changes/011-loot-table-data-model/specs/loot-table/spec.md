# Spec: loot-table

## Contract

Loot tables are immutable ResourceId-identified data that evaluate a bounded set of pools/entries against context and an injected random source, returning stack outputs without mutating caller state.

## Requirements

### Requirement: Unique table identity
Loot table ResourceIds MUST be unique and duplicate registration MUST fail without replacement.

### Requirement: Bounded pools
Every pool SHALL have a finite positive roll count within the documented maximum. Invalid or excessive roll counts MUST reject the table.

### Requirement: Valid item entries
Every item entry MUST reference a registered item and define a positive valid quantity or quantity range.

### Requirement: Weighted choice
When a pool performs weighted selection, every eligible entry weight MUST be a finite positive integer and selection MUST use only the injected random source.

### Requirement: Conditions
Pool/entry conditions SHALL be pure predicates over the supplied context. A false condition suppresses the scoped pool/entry and MUST NOT mutate context.

### Requirement: Deterministic injected randomness
Given identical table/context and an injected random source producing the same sequence, evaluation MUST return the same logical outputs in the same order.

### Requirement: Output bound
Definition validation MUST establish/enforce a finite maximum amount of output work so a malformed table cannot create unbounded rolls or stack results.

### Requirement: Pure evaluation result
Evaluation SHALL return stack outputs. It MUST NOT directly modify Inventory, World, or entity state.

### Requirement: Current block-output equivalence
Every current block-removal output behavior migrated in 011 MUST remain semantically equivalent after routing through loot tables.

### Requirement: Invalid definition rejection
Missing references, invalid quantities, invalid weights, invalid roll counts, invalid stack component data, or excessive output bounds MUST prevent a table from becoming evaluable.

## Scenarios

- One fixed entry yields the configured stack.
- Two guaranteed pools yield outputs in deterministic pool order.
- A false condition suppresses its output.
- A fake random source chooses predictable weighted entries.
- Quantity-range endpoints are reachable under deterministic fake random input.
- A pool with no eligible entry yields no item for that roll and does not corrupt state.
- Invalid definitions fail before gameplay evaluation.

## Performance

Evaluation is bounded by validated pool, roll, and entry counts. No global random source is introduced.

## Compatibility

Existing block output semantics MUST remain equivalent. Saves are unchanged.

## Verification

Focused tests cover all requirements/scenarios and current block-output equivalence, followed by mandatory typecheck, lint, full unit suite, build, and E2E.
