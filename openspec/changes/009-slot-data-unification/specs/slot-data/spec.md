# Spec: slot-data

## Contract

Unify player hotbar and storage representation so every occupied slot contains one item identity, quantity, and component map while preserving current user-visible behavior and existing valid snapshot state.

## Requirements

### Requirement: Slot layout
The player inventory SHALL expose 9 hotbar slots and 27 storage slots. Each slot is either empty or contains one valid stack.

### Requirement: Stack quantity
An occupied stack MUST have quantity from 1 through the item type's configured maximum. Empty slots MUST NOT retain meaningful per-stack component state.

### Requirement: Stack compatibility
Two stacks MAY merge only when item identity and logical component maps are equal. Equal item identity with differing components MUST remain separate.

### Requirement: Selection
Selection SHALL address only the nine hotbar slots and preserve current clamping/wraparound behavior for select/cycle operations.

### Requirement: Count and capacity
Count/capacity queries SHALL include hotbar and storage and respect item-specific maximum stack size plus component-aware compatibility.

### Requirement: Add behavior
Adding quantity SHALL fill compatible partial stacks before suitable empty slots according to documented deterministic ordering. The return value SHALL continue to report uninserted remainder.

### Requirement: Remove/payment behavior
Removal SHALL first verify sufficient compatible quantity under the operation's item/component matching rule before mutating state when the public contract is transactional.

### Requirement: Selected consumption
Placement/consumption from the selected slot SHALL decrement only that stack and clear the slot when quantity reaches zero.

### Requirement: Per-stack component preservation
Moving, merging compatible stacks, saving/restoring, and normal inventory operations MUST preserve component values associated with the stack.

### Requirement: Legacy snapshot restore
Every valid pre-009 inventory snapshot supported by the current code SHALL restore semantically equivalent identity, quantity, selected index, storage contents, and current wear state.

### Requirement: Malformed restore atomicity
Invalid snapshot input MUST be rejected without partially replacing live inventory state.

### Requirement: No runtime-ID persistence leak
Generic registry runtime IDs MUST NOT silently become stable persisted identity during this migration.

## Scenarios

- Two identical ordinary stacks merge up to max size.
- Same item with different component data does not merge.
- Full inventory returns the correct remainder without losing items.
- Removing more than available fails under the existing transactional contract.
- Selected stack reaches zero and becomes empty.
- Legacy snapshot without optional wear data restores valid default behavior.
- Invalid slot/count/component data leaves the previous live inventory unchanged.

## Performance

Linear scans across the fixed 36 slots are acceptable. Operations MUST remain bounded by inventory size and component-map size.

## Compatibility

Current controls, crafting payment, placement consumption, UI data, and save/restore behavior MUST remain equivalent. Any snapshot version change inside 009 requires explicit old-version import tests and no data loss for currently representable state.

## Verification

Focused tests cover all requirements/scenarios, followed by mandatory typecheck, lint, full unit suite, build, and E2E.
