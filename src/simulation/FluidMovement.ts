/**
 * Fluid immersion, drag, and buoyancy (082). Deterministic fluid-movement computations derived
 * from fluid data (015 density): `fluidDragFactor(d) = clamp(1.1 - 0.3 * d, 0, 1)` (water 0.8,
 * lava 0.5); `applyFluidDrag` scales each velocity axis by `factor ^ tickDelta`;
 * `buoyancyAcceleration(fd, ed, g) = g * max(0, 1 - ed / fd)` (neutral at equal densities,
 * upward on denser fluids). Immersion helpers report the fluid at a point (`eyeFluid`), the
 * topmost fluid top in a column window (`fluidHeightAt`), the clamped submerged fraction of an
 * AABB, and the full-submersion predicate. Pure; invalid densities/tick deltas throw.
 */
import type { Aabb } from '../world/VoxelShape';
import type { FluidState } from '../world/FluidState';

/** The fluid cells a movement query may read, plus 015 density lookup. */
export interface FluidMovementWorld {
  getFluidState(x: number, y: number, z: number): FluidState | null;
  /** 015 fluid density (>= 1); caller-validated. */
  getFluidDensity(fluidId: number): number;
}

/** Immersion state of an AABB in the sampled column. */
export interface FluidImmersion {
  /** Topmost fluid surface in the column window, block units. */
  fluidTop: number;
  /** Submerged fraction of the AABB, in [0, 1]. */
  submergedFraction: number;
  fullySubmerged: boolean;
}

export interface Velocity3 {
  x: number;
  y: number;
  z: number;
}

function assertDensity(density: number, name: string): void {
  if (typeof density !== 'number' || !Number.isFinite(density) || density <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${density}`);
  }
}

/**
 * Per-tick velocity drag factor from fluid density: water (1) → 0.8, lava (2) → 0.5, clamped to
 * [0, 1].
 */
export function fluidDragFactor(density: number): number {
  assertDensity(density, 'density');
  return Math.min(1, Math.max(0, 1.1 - 0.3 * density));
}

/** Scale a velocity by the fluid drag factor raised to `tickDelta`. Input untouched. */
export function applyFluidDrag(velocity: Velocity3, density: number, tickDelta = 1): Velocity3 {
  assertDensity(density, 'density');
  if (typeof tickDelta !== 'number' || !Number.isFinite(tickDelta) || tickDelta < 0) {
    throw new RangeError(`tickDelta must be a non-negative finite number, got ${tickDelta}`);
  }
  const factor = Math.pow(fluidDragFactor(density), tickDelta);
  return { x: velocity.x * factor, y: velocity.y * factor, z: velocity.z * factor };
}

/**
 * Upward buoyancy acceleration from fluid and entity densities: 0 at equal densities (neutral),
 * positive when the fluid is denser (floats), 0 when the entity is denser (sinks).
 */
export function buoyancyAcceleration(fluidDensity: number, entityDensity: number, gravity: number): number {
  assertDensity(fluidDensity, 'fluidDensity');
  assertDensity(entityDensity, 'entityDensity');
  if (typeof gravity !== 'number' || !Number.isFinite(gravity)) {
    throw new RangeError(`gravity must be a finite number, got ${gravity}`);
  }
  return gravity * Math.max(0, 1 - entityDensity / fluidDensity);
}

/** The fluid id at the cell containing the point, or null when there is no fluid. */
export function eyeFluid(world: FluidMovementWorld, x: number, y: number, z: number): number | null {
  const state = world.getFluidState(Math.floor(x), Math.floor(y), Math.floor(z));
  return state === null ? null : state.fluidId;
}

/**
 * The topmost fluid surface in the column (x, z) within `[minY, maxY)`, in block units
 * (`highestFluidCellY + 1`); `minY` when the column has no fluid. Falling water counts.
 */
export function fluidHeightAt(world: FluidMovementWorld, x: number, z: number, minY: number, maxY: number): number {
  let top = minY;
  for (let y = minY; y < maxY; y++) {
    if (world.getFluidState(x, y, z) !== null) top = y + 1;
  }
  return top;
}

/** The fraction of the AABB's height submerged in the column at its x/z center, clamped [0, 1]. */
export function submergedFraction(world: FluidMovementWorld, aabb: Aabb): number {
  const centerX = (aabb.minX + aabb.maxX) / 2;
  const centerZ = (aabb.minZ + aabb.maxZ) / 2;
  const minY = Math.floor(aabb.minY);
  const maxY = Math.ceil(aabb.maxY);
  const fluidTop = fluidHeightAt(world, centerX, centerZ, minY, maxY);
  const height = aabb.maxY - aabb.minY;
  if (height <= 0) return fluidTop >= aabb.maxY ? 1 : 0;
  return Math.min(1, Math.max(0, (fluidTop - aabb.minY) / height));
}

/** True when the AABB is fully submerged (fluid top at or above its top). */
export function isFullySubmerged(world: FluidMovementWorld, aabb: Aabb): boolean {
  return submergedFraction(world, aabb) >= 1;
}

/** Full immersion state of an AABB. */
export function immersion(world: FluidMovementWorld, aabb: Aabb): FluidImmersion {
  const fraction = submergedFraction(world, aabb);
  const centerX = (aabb.minX + aabb.maxX) / 2;
  const centerZ = (aabb.minZ + aabb.maxZ) / 2;
  return {
    fluidTop: fluidHeightAt(world, centerX, centerZ, Math.floor(aabb.minY), Math.ceil(aabb.maxY)),
    submergedFraction: fraction,
    fullySubmerged: fraction >= 1,
  };
}
