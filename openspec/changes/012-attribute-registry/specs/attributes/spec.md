# Spec: attributes

## Contract

Provide registered numeric attribute types and deterministic per-instance modifier evaluation without integrating gameplay consumers yet.

## Requirements

### Requirement: Attribute definition
An attribute SHALL have a unique ResourceId plus finite minimum, default, and maximum values satisfying minimum <= default <= maximum.

### Requirement: Instance base value
An instance SHALL hold a finite base value and expose a deterministic effective value calculation.

### Requirement: Unique modifier identity
Modifiers on one instance MUST have unique ResourceIds. Adding a duplicate through the strict add API MUST fail without replacing the existing modifier.

### Requirement: Additive operation
ADD_VALUE modifiers SHALL add their amounts to the base-stage value.

### Requirement: Base-fraction operation
ADD_BASE_FRACTION modifiers SHALL add `original base * amount` according to the documented combination rule.

### Requirement: Total multiplication
MULTIPLY_TOTAL modifiers SHALL apply `value *= 1 + amount` in deterministic modifier-ID order.

### Requirement: Fixed evaluation order
Effective-value evaluation MUST apply operation stages in the documented order and MUST NOT depend on arbitrary Map/object iteration.

### Requirement: Final bounds
The final effective value MUST be clamped to the attribute type's minimum/maximum.

### Requirement: Invalid numeric rejection
NaN, positive/negative infinity, invalid definition ranges, and non-finite modifier amounts MUST fail before entering valid state.

### Requirement: Mutation atomicity
A failed modifier add/remove/update or invalid base update MUST leave the previously valid instance state intact.

## Scenarios

- Attribute with no modifiers returns bounded base value.
- One additive modifier changes by its amount.
- One base-fraction modifier changes by base times its amount.
- One total modifier multiplies the intermediate value.
- Combined modifiers produce the documented formula.
- Same modifier set inserted in different order produces the same effective value.
- Result above/below allowed range clamps to the boundary.
- Duplicate modifier ID fails and original modifier remains.

## Performance

Attribute computation is bounded by modifier count. Repeated reads SHOULD use cached results if profiling shows value, but caching is not mandatory. Any cache MUST invalidate on base/modifier changes.

## Compatibility

012 is additive and MUST NOT replace existing player/entity constants yet.

## Verification

Focused tests cover all requirements/scenarios and full typecheck, lint, unit, build, and E2E regressions are mandatory.
