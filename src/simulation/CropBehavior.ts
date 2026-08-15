/**
 * Crop block behavior (change 125).
 *
 * Grows a crop one stage per random tick via the pure {@link nextCropAge} model:
 * reads the block's current `age` state and writes the next age through the
 * extended {@link BlockWorldAccess}. Stops at maturity and never throws on
 * malformed state reads, so a bad state cannot abort the frame loop.
 */
import { isMature, nextCropAge, MAX_AGE } from '../world/CropGrowth';
import type { BlockBehavior, BlockBehaviorContext } from './BlockBehavior';

/** Growth-stage property name shared by crop blocks. */
export const CROP_AGE_PROPERTY = 'age';

/**
 * Behavior that advances a crop block's `age` state by one per random tick.
 * Bind to the crop's block id (e.g. `new CropBlockBehavior(BlockId.Wheat)`).
 */
export class CropBlockBehavior implements BlockBehavior {
  constructor(readonly blockId: number) {}

  onRandomTick(ctx: BlockBehaviorContext): void {
    const world = ctx.world;
    // Growth needs state access; blocks whose access lacks it stay static.
    if (typeof world.getBlockState !== 'function' || typeof world.setBlockState !== 'function') {
      return;
    }
    // Only act on cells that actually hold this crop block.
    if (world.getBlockId(ctx.x, ctx.y, ctx.z) !== this.blockId) {
      return;
    }

    let age: number;
    try {
      const state = world.getBlockState(ctx.x, ctx.y, ctx.z);
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
    world.setBlockState(ctx.x, ctx.y, ctx.z, this.blockId, { [CROP_AGE_PROPERTY]: nextCropAge(age) });
  }
}
