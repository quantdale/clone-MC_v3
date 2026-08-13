# Spec: block-properties

## Contract

A block type may declare a finite ordered property schema. This change defines legal property names/values and canonical value parsing; it does not enumerate complete block states.

## Requirements

### Requirement: Property names
Property names MUST be non-empty lowercase identifiers and unique within one block type. Invalid or duplicate names MUST reject the schema.

### Requirement: Boolean property
A boolean property SHALL expose exactly false and true as its legal values in deterministic order and SHALL parse/serialize their canonical text exactly.

### Requirement: Integer-range property
An integer property SHALL expose every integer in an inclusive finite min/max range. Invalid bounds and values outside the range MUST fail.

### Requirement: Named-value property
A named-value property SHALL expose a non-empty finite ordered set of unique canonical lowercase values. Empty sets, duplicates, and invalid named values MUST fail.

### Requirement: Exact validation
Property validation MUST accept only values from the declared finite domain. Parsing MUST NOT silently coerce, trim, change case, or clamp invalid input.

### Requirement: Canonical round trip
For every legal property value, parse(serialize(value)) MUST produce the same logical value.

### Requirement: Deterministic order
Property order and each property's legal-value order MUST remain identical for identical authored schemas across runs.

### Requirement: Schema immutability
A finalized block definition's property schema and legal-value domains MUST reject ordinary mutation.

### Requirement: Empty schema compatibility
Current blocks that do not yet use state properties SHALL remain valid with an empty schema and current gameplay/save behavior MUST remain unchanged in 006.

## Failure behavior

Invalid definitions fail before being attached to a finalized block definition. Failure MUST NOT leave a partly accepted schema.

## Performance

Schemas are bootstrap/data objects. Validation must not add frame-loop work. Legal values are finite and bounded by authored configuration.

## Verification

Focused tests cover names, every property kind, invalid configuration, exact parse/serialize, deterministic ordering, immutability, and empty-schema compatibility. Full typecheck/lint/unit/build/E2E gates remain mandatory.
