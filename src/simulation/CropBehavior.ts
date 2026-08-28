/**
 * Crop block behavior (change 125).
 *
 * Grows a crop one stage per random tick via the pure {@link nextCropAge} model:
 * reads the block's current `age` state and writes the next age through the
 * extended {@link BlockWorldAccess}. Stops at maturity and never throws on
 * malformed state reads, so a bad state cannot abort the frame loop.
 */
import { isMature, nextCropAge, MAX_AGE } from '../world/CropGrowth';
import type { BlockBehavior, BlockBehaviorContext, BlockWorldAccess } from './BlockBehavior';

/** Growth-stage property name shared by crop blocks. */
export const CROP_AGE_PROPERTY = 'age';

/**
 * Advance a crop block's `age` state by one stage (via {@link nextCropAge}), the
 * single deterministic growth step shared by crop behaviors (125) and hydrated
 * farmland (126). Reads the block's current `age`, clamps illegal values to 0,
 * and writes the next age through {@link BlockWorldAccess.setBlockState}. Stops
 * at maturity and never throws on malformed state reads, so a bad state cannot
 * abort the frame loop.
 */
export function growCropAt(
  world: BlockWorldAccess,
  x: number,
  y: number,
  z: number,
  blockId: number,
): void {
  // Growth needs state access; blocks whose access lacks it stay static.
  if (typeof world.getBlockState !== 'function' || typeof world.setBlockState !== 'function') {
    return;
  }
  // Only act on cells that actually hold this crop block.
  if (world.getBlockId(x, y, z) !== blockId) {
    return;
  }

  let age: number;
  try {
    const state = world.getBlockState(x, y, z);
    const raw = state.getProperty(CROP_AGE_PROPERTY);
    age = raw === undefined ? 0 : parseInt(raw, 10);
  } catch {
    // Malformed/absent state read: skip growth this tick.
    return;
  }
  if (!Number.isInteger(age) || age < 0 || age > MAX_AGE) {
    age = 0;
  }
  if (isMature(age)) {
    return;
  }
  world.setBlockState(x, y, z, blockId, { [CROP_AGE_PROPERTY]: nextCropAge(age) });
}

/**
 * Behavior that advances a crop block's `age` state by one per random tick.
 * Bind to the crop's block id (e.g. `new CropBlockBehavior(BlockId.Wheat)`).
 */
export class CropBlockBehavior implements BlockBehavior {
  constructor(readonly blockId: number) {}

  onRandomTick(ctx: BlockBehaviorContext): void {
    growCropAt(ctx.world, ctx.x, ctx.y, ctx.z, this.blockId);
  }
}
