/**
 * Deterministic lava flow (079). `stepLavaCell` mirrors the 078 water rule set parameterized by an
 * explicit, validated `spreadRange` (3 overworld, 7 nether): downward spawn of falling level 8,
 * falling→flowing `spreadRange - 1` at ground (so the base can spread into a pool), horizontal
 * spread proposal `L + 1` for levels below `spreadRange` (range-level cells never spread), source
 * formation from ≥ 2 horizontal sources, and the decay ladder (removal at `spreadRange`). Reuses
 * 078's world/result types; fixed neighbor order `-x, +x, -z, +z`; pure per-cell steps.
 */
import type { WaterWorldAccess, WaterStepResult } from './WaterFlowEngine';
import { createFluidState, type FluidState } from '../world/FluidState';

/** Ticks between lava steps (MC-like slower cadence). */
export const LAVA_FLOW_INTERVAL = 30;

/** Level 8 begins the falling range (076). */
export const FALLING_LEVEL = 8;

const NEIGHBORS: ReadonlyArray<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function assertSpreadRange(spreadRange: number): void {
  if (!Number.isInteger(spreadRange) || spreadRange <= 0) {
    throw new RangeError(`LavaFlowEngine: spreadRange must be a positive integer, got ${spreadRange}`);
  }
}

function fallingState(lavaFluidId: number): FluidState {
  return createFluidState(lavaFluidId, FALLING_LEVEL);
}

function flowingState(lavaFluidId: number, level: number): FluidState {
  return createFluidState(lavaFluidId, Math.min(level, 7));
}

/** One deterministic lava step for the cell at (x, y, z). */
export function stepLavaCell(
  world: WaterWorldAccess,
  lavaFluidId: number,
  x: number,
  y: number,
  z: number,
  spreadRange: number,
): WaterStepResult {
  assertSpreadRange(spreadRange);
  const state = world.getFluidState(x, y, z);
  if (state === null || state.fluidId !== lavaFluidId) {
    return { changed: false, affected: [] };
  }

  const affected: Array<[number, number, number]> = [];
  const level = state.level;
  const below = world.getFluidState(x, y - 1, z);
  const belowEmpty = below === null && world.isReplaceable(x, y - 1, z);

  // 1. Downward propagation.
  if (belowEmpty) {
    world.setFluidState(x, y - 1, z, fallingState(lavaFluidId));
    affected.push([x, y - 1, z]);
    return { changed: true, affected };
  }

  // 2. Falling lava at ground converts to flowing `spreadRange - 1`, so the base can still spread
  //    and form a pool (a cell at the range level never spreads).
  if (level >= FALLING_LEVEL) {
    world.setFluidState(x, y, z, flowingState(lavaFluidId, spreadRange - 1));
    affected.push([x, y, z]);
    return { changed: true, affected };
  }

  // 3. Horizontal spread: sources propose level 1; flowing L (< spreadRange) proposes L + 1; a
  //    cell at the range level never spreads.
  let proposal = 0;
  if (level === 0) {
    proposal = 1;
  } else if (level < spreadRange) {
    proposal = level + 1;
  }
  if (proposal > 0) {
    for (const [dx, dz] of NEIGHBORS) {
      const nx = x + dx;
      const nz = z + dz;
      if (!world.isReplaceable(nx, y, nz)) continue;
      const neighbor = world.getFluidState(nx, y, nz);
      if (neighbor === null) {
        world.setFluidState(nx, y, nz, flowingState(lavaFluidId, proposal));
        affected.push([nx, y, nz]);
      } else if (
        neighbor.fluidId === lavaFluidId &&
        neighbor.level >= 1 &&
        neighbor.level <= 7 &&
        neighbor.level > proposal
      ) {
        world.setFluidState(nx, y, nz, flowingState(lavaFluidId, proposal));
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
      if (neighbor !== null && neighbor.fluidId === lavaFluidId && neighbor.level === 0) sources++;
    }
    if (sources >= 2) {
      world.setFluidState(x, y, z, createFluidState(lavaFluidId, 0));
      affected.push([x, y, z]);
      return { changed: true, affected };
    }
  }

  // 5. Decay: no lava above, no feeder (horizontal neighbor with a lower level).
  const above = world.getFluidState(x, y + 1, z);
  if (level > 0 && (above === null || above.fluidId !== lavaFluidId)) {
    let hasFeeder = false;
    for (const [dx, dz] of NEIGHBORS) {
      const neighbor = world.getFluidState(x + dx, y, z + dz);
      if (neighbor !== null && neighbor.fluidId === lavaFluidId && neighbor.level < level) {
        hasFeeder = true;
        break;
      }
    }
    if (!hasFeeder) {
      if (level >= spreadRange) {
        world.setFluidState(x, y, z, null);
        affected.push([x, y, z]);
      } else {
        world.setFluidState(x, y, z, flowingState(lavaFluidId, level + 1));
        affected.push([x, y, z]);
      }
      return { changed: true, affected };
    }
  }

  return { changed: false, affected };
}
