/**
 * Fluid state levels (076). A `FluidState` is a validated value pairing a fluid (registry runtime
 * id) with an MC-style level: 0 = source (full), 1-7 = flowing with surface height
 * `(8 - level) / 8`, 8-15 = falling with falling height `level - 8` (rendered full-height). All
 * helpers are pure and deterministic.
 */

/** MC-style fluid level: 0 = source, 1-7 = flowing, 8-15 = falling. */
export type FluidLevel =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export const FLUID_LEVEL_SOURCE = 0;
export const FLUID_LEVEL_MIN_FLOWING = 1;
export const FLUID_LEVEL_MAX_FLOWING = 7;
export const FLUID_LEVEL_MIN_FALLING = 8;
export const FLUID_LEVEL_MAX = 15;

/** One cell of fluid: a registry fluid runtime id plus a validated level. */
export interface FluidState {
  readonly fluidId: number;
  readonly level: FluidLevel;
}

/**
 * Validate an unknown value as a `FluidLevel` (integer in [0, 15]). Returns the value (narrowed)
 * on success; throws a descriptive `Error` otherwise.
 */
export function validateFluidLevel(input: unknown): FluidLevel {
  if (typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input > FLUID_LEVEL_MAX) {
    throw new Error(`FluidState: level must be an integer in [0, ${FLUID_LEVEL_MAX}], got ${String(input)}`);
  }
  return input as FluidLevel;
}

function validateFluidId(fluidId: number): void {
  if (!Number.isInteger(fluidId) || fluidId < 0) {
    throw new Error(`FluidState: fluidId must be a non-negative integer, got ${String(fluidId)}`);
  }
}

/** Build a validated fluid state. */
export function createFluidState(fluidId: number, level: number): FluidState {
  validateFluidId(fluidId);
  return { fluidId, level: validateFluidLevel(level) };
}

/** True when the state is a source (level 0). */
export function isFluidSource(state: FluidState): boolean {
  return state.level === FLUID_LEVEL_SOURCE;
}

/** True when the state is falling (level >= 8). */
export function isFluidFalling(state: FluidState): boolean {
  return state.level >= FLUID_LEVEL_MIN_FALLING;
}

/** Surface height in block units: 1 for source/falling, `(8 - level) / 8` for flowing 1-7. */
export function fluidSurfaceHeight(state: FluidState): number {
  if (state.level === FLUID_LEVEL_SOURCE || state.level >= FLUID_LEVEL_MIN_FALLING) return 1;
  return (8 - state.level) / 8;
}

/** Falling height: `level - 8` for falling states, 0 otherwise. */
export function fluidFallingHeight(state: FluidState): number {
  if (state.level < FLUID_LEVEL_MIN_FALLING) return 0;
  return state.level - FLUID_LEVEL_MIN_FALLING;
}
