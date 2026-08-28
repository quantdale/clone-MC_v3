# Spec: nether-portal-blocks

## Contract
This capability adds the Nether portal's block and frame validation: `validatePortalFrame` verifies
a 1-thick obsidian rectangle (corners required, vanilla 1.16+) around an air-or-fire interior of
width 2..21 × height 3..21 and returns its shape/axis; `portalBlockPositions` lists the interior
cells; `portalStateProperties` projects the block state. The `nether_portal` block carries the
`axis` property ('x'|'z'), is unbreakable, and has no item.

## Definitions
- **Shape**: `{ axis, x0, y0, z0, width, height }` — the interior rectangle's orientation/bounds.
- **Ring**: the 1-thick obsidian border (bottom/top bars + left/right columns, corners included).
- **Axis**: `'x'` when the interior's horizontal span runs along X, `'z'` when along Z.

## Invariants
- A shape is returned only when the full ring is obsidian (every cell), the interior is air or fire,
  the width is 2..21, and the height is 3..21.
- Probes are bounded by `MAX_PORTAL_SIZE`; axis 'x' is tried before 'z'; the first valid shape wins.
- The portal block has no item and is unbreakable.

## Requirements

### Requirement: the portal block is registered
`BlockRegistry` MUST register `nether_portal` carrying `PORTAL_SCHEMA` with a default of
`{ axis: 'x' }`, exactly 2 states, unbreakable; `ItemTypeRegistry` MUST NOT register a placing item,
and `validateItemBlockCrossReferences` MUST pass.

#### Scenario: block states and no item
- **GIVEN** `createDefaultBlockRegistry()` and `createDefaultItemRegistry()`
- **THEN** the block's schema is `PORTAL_SCHEMA`, `statesForBlock` enumerates 2 states with default
  `axis: 'x'`, `getByKey('nether_portal')` is undefined for items, and the cross-reference
  validation passes

### Requirement: validatePortalFrame recognizes a minimal frame
`validatePortalFrame` MUST return the exact shape for a valid frame probed from an interior cell.

#### Scenario: 4x5 frame (interior 2x3, axis x)
- **GIVEN** an obsidian ring around interior x 1..2, y 1..3 at plane z=0
- **WHEN** validated from `(1, 2, 0)`
- **THEN** the shape is `{ axis: 'x', x0: 1, y0: 1, z0: 0, width: 2, height: 3 }`

#### Scenario: Z-oriented frame
- **GIVEN** an obsidian ring around interior z 1..3, y 1..3 at plane x=0
- **WHEN** validated from `(0, 2, 2)`
- **THEN** the shape has `axis: 'z'`, `width: 3`, `height: 3`

### Requirement: fire inside the opening is allowed
Interior cells MUST be air or fire (the lighting fire lives inside the opening).

#### Scenario: fire at the ignition cell
- **GIVEN** a valid frame whose interior contains fire at one cell
- **WHEN** validated from that fire cell
- **THEN** a shape is returned

### Requirement: an imperfect frame is rejected
Removing any ring cell (corner or bar), narrowing the interior below 2, or shortening it below 3
MUST yield `null`; a solid (non-air/non-fire) probe cell and a frame-less world MUST also yield
`null`.

#### Scenario: missing corner / missing top bar / wrong sizes / no frame
- **GIVEN** frames missing a corner or a top-bar cell, interiors of width 1 or height 2, a solid
  probe cell, and an all-air world
- **THEN** `validatePortalFrame` returns `null` for each

### Requirement: portalBlockPositions lists the interior
`portalBlockPositions(shape)` MUST return every interior cell, deterministically (column-major:
width outer, height inner).

#### Scenario: 2x3 interior
- **GIVEN** `{ axis: 'x', x0: 1, y0: 1, z0: 0, width: 2, height: 3 }`
- **THEN** the positions are the six interior cells in column-major order

### Requirement: portalStateProperties projects the state
`portalStateProperties(axis)` MUST return `{ axis }` with a value legal for `PORTAL_SCHEMA`.

#### Scenario: both axes
- **GIVEN** `'x'` and `'z'`
- **THEN** the projections are `{ axis: 'x' }` and `{ axis: 'z' }`, both in
  `PORTAL_SCHEMA.legalValues('axis')`

## Error and failure behavior
- No function throws for well-formed inputs; imperfect frames yield `null` (total).

## Performance and resource bounds
- Validation O(ring + interior) ≤ O(21×21); positions O(width×height).

## Compatibility and migration
- One additive block id (no item) + one new simulation file; three characterization updates. No
  `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `PortalShape` is a plain value; `portalBlockPositions` makes the lifecycle explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration | `tests/unit/NetherPortal.test.ts` › registration |
| REQ-2 minimal + Z frames | › validatePortalFrame cases |
| REQ-3 fire-in-interior | › fire case |
| REQ-4 imperfect frames | › rejection cases |
| REQ-5 positions | › portalBlockPositions |
| REQ-6 state projection | › portalStateProperties |
