# Design: 009-slot-data-unification

## Current state

Hotbar state is split across `slots`, `counts`, and `durability`; storage uses `{id,count}` entries. This can represent current behavior but not arbitrary per-stack component data consistently.

## Target state

Represent 36 logical player slots (9 hotbar + 27 storage) as empty or one unified stack value containing item identity, quantity, and immutable component data. Selection remains an index into the first nine slots.

## Invariants

- Empty slots contain no positive quantity.
- Occupied stack quantity is at least 1 and no greater than the item type's configured maximum.
- Two stacks may merge only when item identity and component maps are equal.
- Per-stack component state moves with the stack.
- Selection is always normalized to a valid hotbar index.
- Add/remove operations are transactional with respect to their documented return contract.
- Existing valid saved inventory data restores equivalent item quantities and current wear state.

## Compatibility translation

Keep a compatibility layer for the current snapshot version during this staged migration. Import translates old identity/count/wear arrays into unified stacks. Export may continue producing the existing snapshot shape until the later persistent codec changes, provided no current supported state is lost.

## Operations

Refactor count queries, capacity checks, add/remove, selected consumption, selected placeable-item access, and per-stack wear updates to operate on unified slots. Avoid exposing parallel arrays again through new APIs.

## Failure behavior

Malformed snapshots are rejected atomically. Invalid item identity, quantity, component data, or slot count must not partially replace the live inventory.

## Performance

Inventory size is fixed and small. Linear scans across 36 slots are acceptable. Avoid unnecessary ResourceId parsing by storing resolved item identity in memory.

## Verification

Characterize current behavior first, then test slot invariants, component-aware merging, compatibility import/export, malformed snapshot atomicity, selection/cycling, add/remove/capacity, placement consumption, crafting payment, UI, and full regressions.
