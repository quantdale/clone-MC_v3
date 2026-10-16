# Spec: structure-template-format

## Contract

`validateStructureTemplate` MUST accept exactly the documented template shape and MUST reject
malformed ones with descriptive errors. `applyStructureTransform` MUST transform blocks,
entities and connectors deterministically per the documented math (mirror first, then clockwise
Y rotation about the origin corner; transposed footprint for 90/270; facing rotation rules).
`StructureTemplateRegistry` MUST store only validated templates, reject duplicates and invalid
inputs atomically, and expose get/has/size/clear.

## Definitions

- **StructureTemplate**: key + size (width/height/depth) + sparse blocks + entities +
  connectors.
- **Block**: relative integer coordinate in bounds + non-negative `blockId`.
- **Entity**: relative integer coordinate in bounds + non-empty `entityKey` (validated data
  reference).
- **Connector**: unique non-empty key + relative integer coordinate in bounds + `facing`.
- **Direction**: `north` = `-z`, `south` = `+z`, `east` = `+x`, `west` = `-x`, `up` = `+y`,
  `down` = `-y`.
- **Transform**: `rotation` in `{0, 90, 180, 270}` (clockwise about +Y from above, around the
  origin corner) and `mirror` in `{none, x, z}`; composition is mirror first, then rotation.
- Rotation math for size `(W, H, D)`: 90 `(x,y,z) -> (D-1-z, y, x)` size `(D, H, W)`;
  180 `(x,y,z) -> (W-1-x, y, D-1-z)`; 270 `(x,y,z) -> (z, y, W-1-x)` size `(D, H, W)`.
- Mirror: x `x -> W-1-x`; z `z -> D-1-z`.
- Facing rotation: `north -> east -> south -> west -> north` per 90°; x-mirror swaps
  `east <-> west`; z-mirror swaps `north <-> south`; `up`/`down` unchanged.

## Invariants

- Extents are positive integers ≤ `MAX_TEMPLATE_EXTENT` (64).
- Coordinates are integers within `[0, extent)` per axis.
- Block positions are unique; connector keys are unique; `blockId` non-negative;
  `entityKey` non-empty; `facing` a documented direction.
- Unknown shapes and malformed fields throw.
- Registry operations never leave partial state.
- Identical `(template, transform)` MUST produce identical output.

## Requirements

### Requirement: template validation
`validateStructureTemplate` MUST implement the documented acceptance rules.

#### Scenario: valid template
- **GIVEN** a template with valid size, blocks, entities, and connectors
- **WHEN** validation runs
- **THEN** it passes (narrowed), including a template with empty blocks/entities/connectors.

#### Scenario: rejection matrix
- **GIVEN** an empty key, zero/negative/fractional or oversize extents, out-of-bounds block/
  entity/connector coordinates, duplicate block positions, duplicate connector keys, negative
  block ids, empty entity keys, and unknown facings
- **WHEN** validation runs
- **THEN** it throws a descriptive error naming the offending field.

### Requirement: transforms
`applyStructureTransform` MUST produce the documented output.

#### Scenario: rotation vectors
- **GIVEN** a 2x1x3 template with known blocks and a connector facing north
- **WHEN** each rotation (90/180/270) is applied
- **THEN** block/entity coordinates match the documented math, the 90/270 footprint becomes
  (3, 1, 2), and the connector facing becomes east/south/west respectively.

#### Scenario: mirror vectors
- **GIVEN** the same template
- **WHEN** x-mirror and z-mirror are applied
- **THEN** coordinates mirror about the template's axes and facings swap east/west or
  north/south respectively.

#### Scenario: composition order
- **GIVEN** a transform with mirror x and rotation 90
- **WHEN** applied
- **THEN** the output equals mirror-then-rotation (mirror of the original, then rotate).

#### Scenario: determinism
- **GIVEN** an identical template and transform
- **WHEN** applied twice
- **THEN** the outputs are identical.

### Requirement: registry
`StructureTemplateRegistry` MUST store validated templates with atomic rejection.

#### Scenario: lifecycle
- **GIVEN** valid registrations
- **WHEN** register/get/has/size/clear run
- **THEN** lookups round-trip, size tracks registrations, and clear empties.

#### Scenario: atomic rejection
- **GIVEN** a duplicate key and an invalid template
- **WHEN** registration runs
- **THEN** it throws and the registry state is unchanged.

## Error and failure behavior

- Validation and registration throw descriptive errors; no partial state.

## Performance and resource bounds

Validation and transforms O(blocks + entities + connectors); registry O(1) lookups; extents
capped at 64.

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Plain validated data; tests assert exact values.

## Verification mapping

- `tests/unit/StructureTemplate.test.ts` — validation matrix, transform vectors, composition
  order, determinism, registry lifecycle/atomicity.
