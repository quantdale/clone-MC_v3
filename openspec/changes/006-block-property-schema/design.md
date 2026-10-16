# Design: 006-block-property-schema

## Target

Each block type may declare an ordered immutable schema of named properties. A property defines its finite legal values and canonical text representation.

## Property kinds

- Boolean: exactly false/true in a deterministic order.
- Integer range: inclusive min/max with every integer value legal.
- Named value: a finite ordered set of lowercase canonical strings such as north/east/south/west.

## Invariants

- Property names are non-empty, unique within one block type, and use a restricted lowercase identifier syntax.
- Every property has at least one legal value.
- Integer ranges require finite integer min <= max.
- Named values are unique and non-empty.
- Property and value order never depends on object/map hash iteration or locale sorting.
- Parsing accepts only exact canonical values and never silently coerces invalid input.
- Schemas are immutable after block definition finalization.

## API direction

Expose property metadata, legal values, value validation, canonical value serialization, and canonical value parsing. 007 consumes the schema to enumerate state combinations.

## Failure behavior

Reject duplicate names, invalid names, empty named-value sets, duplicate named values, invalid integer bounds, and values outside the property domain. Failure does not partially attach an invalid schema to a block.

## Performance

Schemas are created at data/bootstrap time. Value validation/serialization should be constant-time or linear only in a small finite property value set. No per-frame allocation requirement is introduced.

## Compatibility

Current blocks receive an empty schema or equivalent default. Existing gameplay and persisted numeric values remain unchanged.

## Verification

Focused tests cover every property kind, exact parse/serialize round trips, invalid values/configuration, duplicate properties, deterministic ordering, immutability, and empty-schema current-block compatibility.
