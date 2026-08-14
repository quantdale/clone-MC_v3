# Spec: fluids

## Contract

`fluids` defines ResourceId-identified fluid types (water/lava, source/flowing) with category
and flags, a `FluidRegistry` on the 003 generic `Registry`, and default fluid types. No
gameplay/storage migration is included.

## Definitions

- **FluidCategory**: `WATER` | `LAVA`.
- **FluidFlag**: `WATER` | `LAVA` | `SOURCE` | `FLOWING` | `LIGHT_EMITTING` | `DENSER`.
- **FluidTypeDefinition**: immutable data describing one fluid type.

## Invariants

- `category` MUST be `WATER` or `LAVA`.
- `flags` MUST belong to the known set; the category MUST be present as a flag.
- `lightLevel` MUST be finite and within `[0, 15]` when present.
- `density` MUST be finite and > 0 when present.
- Registry ids MUST be unique.

## Requirements

### Requirement: registry construction validates and finalizes fluid types
The registry MUST validate every definition (unique id, known flags, category/flag
consistency, finite bounded light/density) and finalize before lookup.

#### Scenario: accepts the default fluid set
- **GIVEN** `createDefaultFluidRegistry()`
- **WHEN** `size` is read
- **THEN** it equals 4 and `finalized` is true

#### Scenario: rejects out-of-range lightLevel
- **GIVEN** a definition with `lightLevel: 20`
- **WHEN** the registry is constructed
- **THEN** construction throws

#### Scenario: rejects an unknown flag
- **GIVEN** a definition with `flags: ['NOPE']`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-flag error

### Requirement: category and category flag are consistent
A `WATER`/`LAVA` category MUST carry the matching flag; otherwise construction MUST fail.

#### Scenario: water without the WATER flag is rejected
- **GIVEN** a definition with `category: 'WATER'` and `flags: ['SOURCE']`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-definition error

### Requirement: default fluid types encode water and lava source/flowing variants
The default registry MUST contain water, water_source, lava, lava_source with correct
categories, flags, and lava emitting light 15.

#### Scenario: lava source emits light
- **GIVEN** `createDefaultFluidRegistry()`
- **WHEN** the `lava_source` type is read
- **THEN** it has `LIGHT_EMITTING`, `lightLevel` 15, `category` LAVA, and `isSource` true

## Error and failure behavior

Invalid definitions MUST throw at construction (atomic). Duplicate ids MUST be rejected.

## Performance and resource bounds

Registry lookup O(1) via the 003 core; one-pass validation at construction.

## Compatibility and migration

Purely additive data; no persisted or call-site changes. The current `water`/`lava` blocks
remain.

## Security and integrity

Definitions are static data; no runtime external input flows into fluid parameters.

## Observability

The registry exposes typed fluid metadata for future simulation and rendering consumers.

## Verification mapping

- Registry/instance validation, defaults, consistency -> `tests/unit/Fluid.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
