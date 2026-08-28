/**
 * Deterministic water flow (078). `stepWaterCell` performs one water step for one cell with
 * MC-like rules in fixed order: (1) downward spawn of falling water (level 8) into an empty
 * replaceable cell below; (2) falling water converts to flowing level 6 (max - 1) at ground so the
 * base can spread into a pool; (3) horizontal spread with level+1 falloff — sources spread level
 * 1, flowing levels below 7 spread +1, a level-7 cell never spreads (no endless edge crawl);
 * worse flowing water improves and falling water is never overwritten; (4) a flowing cell with ≥ 2
 * horizontal source neighbors becomes a source; (5) unfed flowing water (no water above, no
 * lower-level neighbor) decays +1 per step and is removed at level 7. `affected` lists exactly the
 * positions the caller must re-schedule (077, `WATER_FLOW_INTERVAL`). Fixed neighbor order
 * `-x, +x, -z, +z`; pure per-cell steps.
 */
import { createFluidState, type FluidState } from '../world/FluidState';

/** The fluid cells a water step may read and write. */
export interface WaterWorldAccess {
  /** The fluid at a cell, or null when the cell has no fluid. */
  getFluidState(x: number, y: number, z: number): FluidState | null;
  /** Set (or remove, when null) the fluid at a cell. */
  setFluidState(x: number, y: number, z: number, state: FluidState | null): void;
  /** Whether the cell can hold flowing water (air or improvable water; not blocks/lava). */
  isReplaceable(x: number, y: number, z: number): boolean;
}

/** Ticks between water steps (MC-like cadence). */
export const WATER_FLOW_INTERVAL = 5;
/** Highest flowing level (076: levels 1-7 flow). */
export const MAX_FLOW_LEVEL = 7;
/** Level 8 begins the falling range (076). */
export const FALLING_LEVEL = 8;

/** Outcome of one water step. */
export interface WaterStepResult {
  changed: boolean;
  /** Positions whose fluid changed; the caller re-schedules these. */
  affected: Array<[number, number, number]>;
}

const NEIGHBORS: ReadonlyArray<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function fallingState(waterFluidId: number): FluidState {
  return createFluidState(waterFluidId, FALLING_LEVEL);
}

function flowingState(waterFluidId: number, level: number): FluidState {
  return createFluidState(waterFluidId, Math.min(level, MAX_FLOW_LEVEL));
}

/** One deterministic water step for the cell at (x, y, z). */
export function stepWaterCell(
  world: WaterWorldAccess,
  waterFluidId: number,
  x: number,
  y: number,
  z: number,
): WaterStepResult {
  const state = world.getFluidState(x, y, z);
  if (state === null || state.fluidId !== waterFluidId) {
    return { changed: false, affected: [] };
  }

  const affected: Array<[number, number, number]> = [];
  const level = state.level;
  const below = world.getFluidState(x, y - 1, z);
  const belowEmpty = below === null && world.isReplaceable(x, y - 1, z);

  // 1. Downward propagation.
  if (belowEmpty) {
    world.setFluidState(x, y - 1, z, fallingState(waterFluidId));
    affected.push([x, y - 1, z]);
    return { changed: true, affected };
  }

  // 2. Falling water at ground converts to flowing level 6 (max - 1), so the base can still
  //    spread and form a pool (a level-7 cell never spreads).
  if (level >= FALLING_LEVEL) {
    world.setFluidState(x, y, z, flowingState(waterFluidId, MAX_FLOW_LEVEL - 1));
    affected.push([x, y, z]);
    return { changed: true, affected };
  }

  // 3. Horizontal spread: sources propose level 1; flowing L (< MAX_FLOW_LEVEL) proposes L + 1;
  //    a cell at the maximum level never spreads.
  let proposal = 0;
  if (level === 0) {
    proposal = 1;
  } else if (level < MAX_FLOW_LEVEL) {
    proposal = level + 1;
  }
  if (proposal > 0) {
    for (const [dx, dz] of NEIGHBORS) {
      const nx = x + dx;
      const nz = z + dz;
      if (!world.isReplaceable(nx, y, nz)) continue;
      const neighbor = world.getFluidState(nx, y, nz);
      if (neighbor === null) {
        world.setFluidState(nx, y, nz, flowingState(waterFluidId, proposal));
        affected.push([nx, y, nz]);
      } else if (
        neighbor.fluidId === waterFluidId &&
        neighbor.level >= 1 &&
        neighbor.level <= MAX_FLOW_LEVEL &&
        neighbor.level > proposal
      ) {
        world.setFluidState(nx, y, nz, flowingState(waterFluidId, proposal));
        affected.push([nx, y, nz]);
      }
      // Falling neighbors (level >= 8) are never overwritten horizontally.
    }
  }

  // 4. Source formation: ≥ 2 horizontal source neighbors.
  if (level > 0) {
    let sources = 0;
    for (const [dx, dz] of NEIGHBORS) {
      const neighbor = world.getFluidState(x + dx, y, z + dz);
      if (neighbor !== null && neighbor.fluidId === waterFluidId && neighbor.level === 0) sources++;
    }
    if (sources >= 2) {
      world.setFluidState(x, y, z, createFluidState(waterFluidId, 0));
      affected.push([x, y, z]);
      return { changed: true, affected };
    }
  }

  // 5. Decay: no water above, no feeder (horizontal neighbor with a lower level).
  const above = world.getFluidState(x, y + 1, z);
  if (level > 0 && (above === null || above.fluidId !== waterFluidId)) {
    let hasFeeder = false;
    for (const [dx, dz] of NEIGHBORS) {
      const neighbor = world.getFluidState(x + dx, y, z + dz);
      if (neighbor !== null && neighbor.fluidId === waterFluidId && neighbor.level < level) {
        hasFeeder = true;
        break;
      }
    }
    if (!hasFeeder) {
      if (level >= MAX_FLOW_LEVEL) {
        world.setFluidState(x, y, z, null);
        affected.push([x, y, z]);
      } else {
        world.setFluidState(x, y, z, flowingState(waterFluidId, level + 1));
        affected.push([x, y, z]);
      }
      return { changed: true, affected };
    }
  }

  return { changed: false, affected };
}
