# Design: 177-nether-portal-blocks

## Context/current state
- 176 generates Nether terrain; nothing validates multi-block frames or models the portal block.
  Vanilla's portal: a 1-thick obsidian rectangle (corners required, 1.16+) with an air/fire interior
  of width 2..21 × height 3..21; lighting replaces the interior with `nether_portal` blocks.

## Target state
- `src/simulation/NetherPortal.ts` holding `PortalShape`, the pure `validatePortalFrame`, the
  interior-position listing, and the state projection; a `nether_portal` block (2 states, no item,
  unbreakable).

## Invariants
- `validatePortalFrame` returns a shape only when: the probe cell is air/fire; the horizontal
  interior along the probed axis is 2..21 with obsidian far walls; the vertical interior is 3..21
  with obsidian bottom/top bars; the full 1-thick ring (bars + columns + corners) is obsidian; every
  interior cell is air or fire.
- Probes are bounded by `MAX_PORTAL_SIZE`; axis 'x' is tried before 'z'; the first valid shape wins.
- `portalBlockPositions` lists interior cells column-major (width outer, height inner), deterministically.
- The portal block is unbreakable, has no item, and carries `axis` 'x'|'z' (default 'x').

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const PORTAL_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'axis', values: ['x', 'z'] },
]);
// BlockId.NetherPortal = 55; unbreakable, no dropItem, no item entry

// src/simulation/NetherPortal.ts (new)
export type PortalAxis = 'x' | 'z';
export const MIN_PORTAL_WIDTH = 2;
export const MIN_PORTAL_HEIGHT = 3;
export const MAX_PORTAL_SIZE = 21;
export interface PortalShape {
  readonly axis: PortalAxis;
  readonly x0: number; readonly y0: number; readonly z0: number;
  readonly width: number; readonly height: number;
}
export interface PortalFrameWorld {
  isAir(x: number, y: number, z: number): boolean;
  isFire(x: number, y: number, z: number): boolean;
  isObsidian(x: number, y: number, z: number): boolean;
}
export function validatePortalFrame(
  world: PortalFrameWorld, x: number, y: number, z: number,
): PortalShape | null;
export function portalBlockPositions(shape: PortalShape): ReadonlyArray<readonly [number, number, number]>;
export function portalStateProperties(axis: PortalAxis): Record<string, string>;
```

## Control/data flow
1. A wiring change (178) calls `validatePortalFrame` at the fire cell; on a non-null shape it fills
   `portalBlockPositions(shape)` with `nether_portal[axis=shape.axis]` blocks.
2. Frame damage (breaking an obsidian ring cell) re-runs validation; a null result means the portal
   deactivates (the wiring clears the interior).

## Detailed behavior
- The greedy probe walks along the probed axis from the probe cell (bounded at 21), requiring the
  far walls to be obsidian; the vertical walk requires obsidian bars below/above; the full ring +
  interior checks reject false positives (e.g. probing the wrong orientation in open terrain).
- Fire is allowed in the interior because the lighting fire sits inside the opening at validation
  time (vanilla behavior).
- Corners are required: any missing ring cell fails validation (pinned by the omit-corner tests).

## Failure modes
- No function throws for well-formed inputs; a missing/imperfect frame yields `null` (total).
- Invalid probe cells (solid, not air/fire) yield `null`.

## Compatibility/migration
- One additive block id (no item) + one new simulation file; three characterization updates
  (nether_portal: 21st multi-state block, 2 states). No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Validation is O(ring + interior) ≤ O(21×21); `portalBlockPositions` O(width×height).

## Testing seams
- Tests use in-memory `PortalFrameWorld` fixtures (ring builder + inline Z-frame) and the real
  registries; no `World` of any kind.

## Observability/debugging
- `PortalShape` is a plain value; `portalBlockPositions` makes the lifecycle explicit.

## Affected files/symbols
- `src/world/BlockRegistry.ts` (edit); `src/simulation/NetherPortal.ts` (new).
- Tests: `tests/unit/NetherPortal.test.ts` (new) + three characterization updates.

## Rejected alternatives
- **Corners optional (1.15 semantics)**: rejected — vanilla 1.16+ requires them; the tests pin it.
- **Validation returning a filled-frame plan**: rejected — filling is a wiring mutation; the module
  returns the shape and positions, the caller applies blocks.
- **A `nether_portal` item**: rejected — portals are unobtainable; an item would also force a
  dropItem on a breakable block, contradicting the registry's cross-reference rules.

## Downstream dependencies
- 178 (`nether-portal-linking`) consumes `validatePortalFrame`/`portalBlockPositions` for
  destination search and creation; 179 (Nether content) supplies obsidian identity through the seam.
