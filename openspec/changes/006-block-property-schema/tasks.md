# Tasks: 006-block-property-schema

> VERIFIED. Implementation complete; all 37 tasks done; full gate green.

## 1. Entry
- [x] 1.1 Confirm 005 VERIFIED and activate 006.
- [x] 1.2 Run and record the full baseline regression gate.

## 2. Property kinds
- [x] 2.1 Define the boolean property kind exposing exactly false/true in deterministic order.
- [x] 2.2 Define the integer-range property kind with inclusive finite min/max and every integer legal.
- [x] 2.3 Define the named-value property kind with an ordered set of unique canonical lowercase values.
- [x] 2.4 Reject invalid integer bounds (min > max, non-finite, non-integer).
- [x] 2.5 Reject empty named-value sets and duplicate named values.

## 3. Schema model
- [x] 3.1 Define the ordered immutable property schema type.
- [x] 3.2 Validate property names (non-empty lowercase identifier syntax).
- [x] 3.3 Reject duplicate property names within one schema.
- [x] 3.4 Reject any property that declares no legal value.
- [x] 3.5 Attach an immutable schema to a block type at definition time.
- [x] 3.6 Preserve deterministic property and value order independent of map/hash iteration.

## 4. Value parse/serialize
- [x] 4.1 Canonical-serialize every legal property value to text.
- [x] 4.2 Parse canonical text exactly; never coerce, trim, change case, or clamp.
- [x] 4.3 Reject unknown, malformed, or out-of-domain values on parse.
- [x] 4.4 Verify parse(serialize(value)) round-trips for every legal value.

## 5. Current-block compatibility
- [x] 5.1 Provide an empty schema default for current blocks.
- [x] 5.2 Verify existing blocks remain valid with an empty schema and current gameplay/save behavior is unchanged.

## 6. Tests
- [x] 6.1 Test boolean property kind (legal values, order, parse/serialize).
- [x] 6.2 Test integer-range property kind (bounds, every integer legal, out-of-range rejected).
- [x] 6.3 Test named-value property kind (order, empty/duplicate rejected).
- [x] 6.4 Test property-name validation (invalid/duplicate rejected).
- [x] 6.5 Test exact parse/serialize round trips across all kinds.
- [x] 6.6 Test deterministic ordering across repeated construction.
- [x] 6.7 Test schema immutability after finalization.
- [x] 6.8 Test empty-schema compatibility with current blocks.

## 7. Final gate
- [x] 7.1 Reconcile 006 artifacts with implementation.
- [x] 7.2 Run focused property tests.
- [x] 7.3 Run typecheck.
- [x] 7.4 Run lint.
- [x] 7.5 Run full unit tests.
- [x] 7.6 Run build.
- [x] 7.7 Run E2E tests.
- [x] 7.8 Audit scope: no 007 block-state/runtime-ID enumeration introduced.
- [x] 7.9 Record exact completion and evidence.
- [x] 7.10 Update program state; activate 007 only after VERIFIED.
