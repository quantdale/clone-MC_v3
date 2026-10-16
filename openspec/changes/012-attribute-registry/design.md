# Design: 012-attribute-registry

## Target

An attribute type defines a numeric domain. An attribute instance stores one mutable base value plus a set of uniquely identified immutable modifiers and computes the effective value deterministically.

## Invariants

- Attribute IDs are unique ResourceIds.
- Default, minimum, maximum, base values, and modifier amounts are finite numbers.
- Minimum <= default <= maximum.
- Instance base values are clamped or rejected according to one documented policy; prefer clamping only at effective-value calculation while retaining a validated finite base.
- Modifier IDs are unique within one attribute instance.
- Modifier operation is one of ADD_VALUE, ADD_BASE_FRACTION, MULTIPLY_TOTAL.
- Evaluation order is fixed and independent of insertion order except where mathematically equivalent.
- Final effective value is clamped to the attribute range.

## Evaluation

Recommended deterministic formula:

1. Start from base.
2. Add all ADD_VALUE amounts.
3. Add original base multiplied by the sum of ADD_BASE_FRACTION amounts.
4. Apply MULTIPLY_TOTAL modifiers in deterministic modifier-ID order as `value *= 1 + amount`.
5. Clamp to [min,max].

All modifiers of commutative stages may be sorted for stable diagnostics even when arithmetic meaning is order-independent.

## Failure behavior

Reject invalid attribute ranges/defaults, non-finite base/modifier values, unknown operations, and duplicate modifier IDs. Failed add/remove/update operations preserve the previous valid instance state.

## Performance

Attribute sets are small. Recompute may be lazy with dirty caching; repeated `value` reads SHOULD avoid rebuilding modifier groupings when nothing changed.

## Verification

Tests cover definition validation, every operation alone and combined, deterministic order, clamping, duplicate modifiers, remove/clear behavior, invalid values, cached recomputation if implemented, and additive compatibility with current gameplay.
