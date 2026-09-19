/**
 * Smoker recipe context (281).
 *
 * A smoker is deliberately a thin adapter over the verified furnace recipe
 * and fuel context. It changes only cooking duration; fuel burn values,
 * result identity/count, and fractional XP remain the furnace authority.
 */

import type { FurnaceContext } from '../world/FurnaceBlockEntity';

/** Build the twice-fast context used by live smoker entities. */
export function createSmokerContext(furnace: FurnaceContext): FurnaceContext {
  return {
    fuelBurnTicks: (item) => furnace.fuelBurnTicks(item),
    cookTicks: (item) => {
      const base = furnace.cookTicks(item);
      return base > 0 && Number.isFinite(base) ? Math.max(1, Math.ceil(base / 2)) : 0;
    },
    resultOf: (item) => furnace.resultOf(item),
    experienceOf: (item) => furnace.experienceOf?.(item) ?? 0,
  };
}
