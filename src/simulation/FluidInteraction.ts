/**
 * Water/lava contact interactions (080). `resolveFluidContact` implements the classic MC table
 * (falling levels 8-15 count as flowing for both fluids; only level 0 is a source): lava source +
 * any water → obsidian; flowing lava + water source → stone; flowing lava + flowing water →
 * cobblestone; either side without fluid → none. `applyFluidContact` clears both fluid cells and
 * places the resulting block at the lava cell; NONE results never mutate. Pure and deterministic.
 */
import { type FluidState } from '../world/FluidState';

/** The transformation produced by a water/lava contact. */
export type FluidContactResult = 'OBSIDIAN' | 'COBBLESTONE' | 'STONE' | 'NONE';

/** Block ids the caller maps the interaction results to. */
export interface InteractionBlockIds {
  obsidian: number;
  cobblestone: number;
  stone: number;
}

/** The cells an interaction may read and write. */
export interface FluidInteractionWorld {
  getFluidState(x: number, y: number, z: number): FluidState | null;
  setFluidState(x: number, y: number, z: number, state: FluidState | null): void;
  /** Place a solid block (removes any fluid at the cell). */
  setBlockState(x: number, y: number, z: number, blockId: number): void;
}

/** Resolve the contact transformation between a water and a lava state (either may be null). */
export function resolveFluidContact(water: FluidState | null, lava: FluidState | null): FluidContactResult {
  if (water === null || lava === null) return 'NONE';
  const lavaSource = lava.level === 0;
  const waterSource = water.level === 0;
  if (lavaSource) return 'OBSIDIAN';
  return waterSource ? 'STONE' : 'COBBLESTONE';
}

/**
 * Apply the contact transformation between the water cell at W and the lava cell at L: for
 * non-NONE results both fluids are removed and the result block is placed at the lava cell.
 */
export function applyFluidContact(
  world: FluidInteractionWorld,
  ids: InteractionBlockIds,
  waterX: number,
  waterY: number,
  waterZ: number,
  lavaX: number,
  lavaY: number,
  lavaZ: number,
): FluidContactResult {
  const water = world.getFluidState(waterX, waterY, waterZ);
  const lava = world.getFluidState(lavaX, lavaY, lavaZ);
  const result = resolveFluidContact(water, lava);
  if (result === 'NONE') return result;

  world.setFluidState(waterX, waterY, waterZ, null);
  world.setFluidState(lavaX, lavaY, lavaZ, null);
  const blockId = result === 'OBSIDIAN' ? ids.obsidian : result === 'STONE' ? ids.stone : ids.cobblestone;
  world.setBlockState(lavaX, lavaY, lavaZ, blockId);
  return result;
}
