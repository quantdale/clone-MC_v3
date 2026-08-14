/**
 * Waterlogging state (081). A `WaterloggedCell` holds a block plus coexisting water whose level is
 * a source (0) or falling (8-15) — flowing levels 1-7 never coexist with a block (MC semantics).
 * `waterloggingLevelFromFluid` maps flowing water to level 0 (flowing water waterlogs as a
 * source); falling water keeps its level. `withWaterLevel(cell, null)` unwaterlogs. All helpers
 * are pure and deterministic.
 */
import { FLUID_LEVEL_MAX, FLUID_LEVEL_SOURCE, FLUID_LEVEL_MIN_FALLING, type FluidLevel } from './FluidState';

/** A cell holding a block and coexisting water. */
export interface WaterloggedCell {
  readonly blockId: number;
  /** 0 (source) or 8-15 (falling); flowing levels never coexist with a block. */
  readonly waterLevel: FluidLevel;
}

/**
 * Validate a waterlogging level: exactly 0 or integers in [8, 15]. Throws a descriptive error for
 * flowing (1-7) and any other value.
 */
export function validateWaterloggingLevel(level: number): FluidLevel {
  if (
    typeof level !== 'number' ||
    !Number.isInteger(level) ||
    level < 0 ||
    level > FLUID_LEVEL_MAX ||
    (level > FLUID_LEVEL_SOURCE && level < FLUID_LEVEL_MIN_FALLING)
  ) {
    throw new Error(
      `Waterlogging: level must be 0 (source) or an integer in [${FLUID_LEVEL_MIN_FALLING}, ${FLUID_LEVEL_MAX}] (falling), got ${String(level)}`,
    );
  }
  return level as FluidLevel;
}

function validateBlockId(blockId: number): void {
  if (!Number.isInteger(blockId) || blockId < 0) {
    throw new Error(`Waterlogging: blockId must be a non-negative integer, got ${String(blockId)}`);
  }
}

/** Build a validated waterlogged cell. */
export function waterlog(blockId: number, level: number): WaterloggedCell {
  validateBlockId(blockId);
  return { blockId, waterLevel: validateWaterloggingLevel(level) };
}

/** The waterlogged level a fluid level produces: flowing (1-7) waterlogs as a source (0). */
export function waterloggingLevelFromFluid(fluidLevel: number): FluidLevel {
  if (fluidLevel >= FLUID_LEVEL_MIN_FALLING) return fluidLevel as FluidLevel;
  return FLUID_LEVEL_SOURCE;
}

/** The fluid level a waterlogged level corresponds to (0 stays 0; falling stays itself). */
export function fluidLevelFromWaterlogging(waterLevel: FluidLevel): FluidLevel {
  return waterLevel;
}

/** A new cell with the given water level, or null when the cell is unwaterlogged. */
export function withWaterLevel(cell: WaterloggedCell, level: FluidLevel | null): WaterloggedCell | null {
  if (level === null) return null;
  return { blockId: cell.blockId, waterLevel: validateWaterloggingLevel(level) };
}

/** Whether a block id may coexist with water (pure set membership). */
export function isWaterloggable(blockId: number, waterloggableIds: ReadonlySet<number>): boolean {
  return waterloggableIds.has(blockId);
}
