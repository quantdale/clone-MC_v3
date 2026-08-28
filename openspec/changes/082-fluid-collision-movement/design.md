# Design: 082-fluid-collision-movement

## Context / current state

076-081 model fluids and their flow; the movement system has no fluid computations. MC derives
drag/buoyancy/immersion from fluid data; this change provides those deterministic computations.

## Target state

`src/simulation/FluidMovement.ts` exposes pure fluid-movement functions over a caller-supplied
fluid world: drag factors, buoyancy acceleration, eye-fluid state, fluid height, submerged
fraction, and full-submersion predicate.

## Invariants

- `fluidDragFactor(d) = clamp(1.1 - 0.3 * d, 0, 1)` for positive finite `d` (water 1 → 0.8,
  lava 2 → 0.5); non-positive/non-finite densities throw.
- `applyFluidDrag(v, d, tickDelta)` multiplies each axis by `factor ^ tickDelta`;
  `tickDelta >= 0` (integer or fractional); 0 → identity.
- `buoyancyAcceleration(fd, ed, g) = g * max(0, 1 - ed / fd)`; equal densities → 0 (neutral);
  fluid denser → upward; entity denser → 0 (no float).
- `eyeFluid` returns the fluid state's id at the cell containing the point, or null.
- `fluidHeightAt` scans `[minY, maxY)` ascending and returns the topmost y with fluid + 1
  (fluid top in block units), or `minY` when empty; falling water counts.
- `submergedFraction = clamp((fluidTop - aabb.minY) / (aabb.maxY - aabb.minY), 0, 1)`.
- `isFullySubmerged` = `submergedFraction >= 1`.

## API and data model

```ts
// src/simulation/FluidMovement.ts (NEW)
export interface FluidMovementWorld {
  getFluidState(x: number, y: number, z: number): FluidState | null;
  getFluidDensity(fluidId: number): number; // 015 density (>= 1); caller-validated
}
export interface FluidImmersion {
  fluidTop: number;      // topmost fluid surface in the sampled column, block units
  submergedFraction: number; // [0, 1]
  fullySubmerged: boolean;
}
export function fluidDragFactor(density: number): number;
export interface Velocity3 { x: number; y: number; z: number; }
export function applyFluidDrag(velocity: Velocity3, density: number, tickDelta?: number): Velocity3;
export function buoyancyAcceleration(fluidDensity: number, entityDensity: number, gravity: number): number;
export function eyeFluid(world: FluidMovementWorld, x: number, y: number, z: number): number | null;
export function fluidHeightAt(world: FluidMovementWorld, x: number, z: number, minY: number, maxY: number): number;
export function submergedFraction(world: FluidMovementWorld, aabb: Aabb): number;
export function isFullySubmerged(world: FluidMovementWorld, aabb: Aabb): boolean;
export function immersion(world: FluidMovementWorld, aabb: Aabb): FluidImmersion;
```

## Control / data flow

1. The movement system queries `eyeFluid` (fog/vision), `immersion` (swimming state), and applies
   `applyFluidDrag`/`buoyancyAcceleration` each tick with the fluid density from 015 data.
2. All functions are pure over the caller-supplied world.

## Detailed behavior

- `fluidHeightAt` iterates `y` from `minY` to `maxY - 1` at the column (x, z), remembering the
  highest fluid cell; the top is that cell's `y + 1` (or the cell's surface height for flowing
  water? — no: block-unit top, deterministic; surface refinement is 083's concern).
- Empty column → `minY`; `submergedFraction` → 0.
- `applyFluidDrag` returns a new velocity object (input untouched).

## Failure modes

- Invalid densities (non-positive/non-finite) and invalid `tickDelta` (< 0 or non-finite) throw.
- World accessors are trusted (exceptions propagate).

## Compatibility / migration

Additive; no existing module changes.

## Performance / resource constraints

Height scan is O(window height); everything else O(1).

## Testing seams

- `tests/unit/FluidMovement.test.ts` (NEW): drag factors (water/lava/clamp), drag compounding and
  identity, buoyancy (neutral/upward/none), eye-fluid (in/out of water, falling cells), height
  scan (empty, single, stacked, falling), submerged fraction (none/partial/full), full
  submersion, validation, determinism.

## Observability / debugging

Functions return plain values; tests assert exact numbers.

## Affected files / symbols

- `src/simulation/FluidMovement.ts` — NEW.
- `tests/unit/FluidMovement.test.ts` — NEW.

## Rejected alternatives

- *Hardcode MC constants without derivation*: the change scope says "from fluid data"; the
  density-derived formulas keep drag/buoyancy data-driven and tunable.
- *Fluid-surface-aware height*: 083 fluid surface meshing owns surface refinement; block-unit tops
  keep this change deterministic and simple.

## Downstream dependencies

The movement system wires these functions; 083 refines surfaces; 084 fixtures cover fluid
movement determinism.
