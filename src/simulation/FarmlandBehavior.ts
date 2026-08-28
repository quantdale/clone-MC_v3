/**
 * Farmland simulation (change 126).
 *
 * Introduces hydration detection, moisture dynamics, reversion to dirt, player
 * trampling, and crop support around the Farmland block. The pure helpers take a
 * minimal `{ getBlock }` / `{ getBlock, setBlock }` world surface so they are
 * unit-testable without a full {@link World}; `FarmlandBlockBehavior` wires them
 * into the block-behavior dispatch via a `BlockWorldAccess`.
 *
 * Hydration rule (documented and canonical): farmland is hydrated when any water
 * source is within a horizontal Chebyshev radius of 4 (`|dx| <= 4`, `|dz| <= 4`)
 * and vertical offsets `dy in {-1, 0}` relative to the farmland block. There is
 * no weather system yet, so rain is treated as absent.
 */
import { BlockId } from '../world/BlockRegistry';
import type { BlockBehavior, BlockBehaviorContext, BlockWorldAccess } from './BlockBehavior';
import { growCropAt } from './CropBehavior';

/** Maximum farmland moisture; a farmland block at this value is fully hydrated. */
export const MAX_MOISTURE = 7;

/** Moisture property name shared by farmland blocks. */
export const MOISTURE_PROPERTY = 'moisture';

/** Horizontal hydration radius (Chebyshev): `|dx| <= HYDRATION_RADIUS`, `|dz| <= HYDRATION_RADIUS`. */
export const HYDRATION_RADIUS = 4;

/** Vertical offsets scanned for a water source, relative to the farmland block
 *  (same level and one below). Values above the farmland do not hydrate. */
export const HYDRATION_DY: readonly number[] = [-1, 0];

/** Minimal world surface a pure helper needs to read neighbor block ids. */
export interface BlockSampler {
  getBlock(x: number, y: number, z: number): number;
}

/** A world surface a helper may also write through (trampling). */
export interface FarmlandWorld extends BlockSampler {
  setBlock(x: number, y: number, z: number, id: number): void;
}

/**
 * Whether a water source is within the hydration neighborhood of `(x, y, z)`:
 * `|dx| <= 4`, `|dz| <= 4`, `dy in {-1, 0}`. Bounded to ≤ 81 `getBlock` reads.
 */
export function isFarmlandHydrated(world: BlockSampler, x: number, y: number, z: number): boolean {
  for (let dx = -HYDRATION_RADIUS; dx <= HYDRATION_RADIUS; dx++) {
    for (let dz = -HYDRATION_RADIUS; dz <= HYDRATION_RADIUS; dz++) {
      for (const dy of HYDRATION_DY) {
        if (world.getBlock(x + dx, y + dy, z + dz) === BlockId.Water) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * The next farmland moisture after one random tick: rises toward {@link MAX_MOISTURE}
 * when hydrated, falls toward 0 when dry. Deterministic; never leaves `[0, 7]`.
 */
export function nextMoisture(moisture: number, hydrated: boolean): number {
  if (hydrated) {
    return Math.min(MAX_MOISTURE, moisture + 1);
  }
  return Math.max(0, moisture - 1);
}

/**
 * Parse a farmland moisture value defensively. `undefined`, non-integer, or
 * out-of-range values normalize to 0 (mirrors crop-age parsing in 125).
 */
export function parseMoisture(raw: string | undefined): number {
  const m = raw === undefined ? 0 : parseInt(raw, 10);
  if (!Number.isInteger(m) || m < 0 || m > MAX_MOISTURE) {
    return 0;
  }
  return m;
}

/** Whether a crop (wheat) is planted directly above the farmland. */
export function isCropAbove(world: BlockSampler, x: number, y: number, z: number): boolean {
  return world.getBlock(x, y + 1, z) === BlockId.Wheat;
}

/**
 * Whether a solid cover is directly above the farmland: a block that is neither
 * air nor the (non-solid) wheat crop. In the current catalog the only non-solid
 * cover on farmland is wheat, so this is equivalent to "anything that isn't the
 * crop is placed above".
 */
export function hasSolidCoverAbove(world: BlockSampler, x: number, y: number, z: number): boolean {
  const above = world.getBlock(x, y + 1, z);
  return above !== BlockId.Air && above !== BlockId.Wheat;
}

/**
 * Whether dry farmland should revert to dirt: it is dry (`moisture <= 0`) and no
 * crop is planted above. A growing crop always protects the farmland beneath it.
 */
export function shouldRevertToDirt(moisture: number, hasCropAbove: boolean): boolean {
  return moisture <= 0 && !hasCropAbove;
}

/**
 * Trample farmland back to dirt. Writes {@link BlockId.Dirt} at `(x, y, z)` when
 * that cell currently holds farmland; otherwise a no-op. Exposed as a pure,
 * testable seam so a unit test can trample without a full {@link Game}.
 */
export function trampleFarmland(world: FarmlandWorld, x: number, y: number, z: number): void {
  if (world.getBlock(x, y, z) !== BlockId.Farmland) {
    return;
  }
  world.setBlock(x, y, z, BlockId.Dirt);
}

/** Adapt a `BlockWorldAccess` (which reads ids) to the sampler surface helpers use. */
function samplerOf(world: BlockWorldAccess): BlockSampler {
  return { getBlock: (x, y, z) => world.getBlockId(x, y, z) };
}

/**
 * Behavior for the Farmland block (126). On a random tick it evolves moisture
 * toward 7 when hydrated and toward 0 when dry, reverts to dirt when dry and
 * empty (or when a solid cover is placed above), and grows the wheat crop above
 * when hydrated. `onNeighborChanged` reverts immediately when a solid block is
 * placed directly above. Never throws.
 */
export class FarmlandBlockBehavior implements BlockBehavior {
  readonly blockId = BlockId.Farmland;

  onRandomTick(ctx: BlockBehaviorContext): void {
    const world = ctx.world;
    if (world.getBlockId(ctx.x, ctx.y, ctx.z) !== this.blockId) {
      return;
    }
    // Moisture/state dynamics need state access; blocks whose access lacks it stay static.
    if (typeof world.getBlockState !== 'function' || typeof world.setBlockState !== 'function') {
      return;
    }

    let moisture: number;
    try {
      moisture = parseMoisture(world.getBlockState(ctx.x, ctx.y, ctx.z).getProperty(MOISTURE_PROPERTY));
    } catch {
      // Malformed/absent state read: skip this tick.
      return;
    }

    const sampler = samplerOf(world);
    const hydrated = isFarmlandHydrated(sampler, ctx.x, ctx.y, ctx.z);
    const cropAbove = isCropAbove(sampler, ctx.x, ctx.y, ctx.z);

    // Reversion: dry + empty farmland returns to dirt; so does farmland with a
    // solid cover placed above (scheduled fallback — see onNeighborChanged).
    if ((!hydrated && shouldRevertToDirt(moisture, cropAbove)) || hasSolidCoverAbove(sampler, ctx.x, ctx.y, ctx.z)) {
      world.setBlockId(ctx.x, ctx.y, ctx.z, BlockId.Dirt);
      return;
    }

    const next = nextMoisture(moisture, hydrated);
    if (next !== moisture) {
      world.setBlockState(ctx.x, ctx.y, ctx.z, this.blockId, { [MOISTURE_PROPERTY]: next });
    }

    // Crop support: hydrated farmland grows the wheat directly above it.
    if (hydrated && cropAbove) {
      growCropAt(world, ctx.x, ctx.y + 1, ctx.z, BlockId.Wheat);
    }
  }

  onNeighborChanged(ctx: BlockBehaviorContext, fromX: number, fromY: number, fromZ: number): void {
    const world = ctx.world;
    if (world.getBlockId(ctx.x, ctx.y, ctx.z) !== this.blockId) {
      return;
    }
    // Only a solid cover placed directly above reverts farmland.
    if (fromX !== ctx.x || fromZ !== ctx.z || fromY !== ctx.y + 1) {
      return;
    }
    if (hasSolidCoverAbove(samplerOf(world), ctx.x, ctx.y, ctx.z)) {
      world.setBlockId(ctx.x, ctx.y, ctx.z, BlockId.Dirt);
    }
  }
}
