/**
 * Fertilization interface and first crop behavior (change 127).
 *
 * Introduces the Bone Meal item and a pure, registry-backed fertilization
 * interface: `applyBonemeal` inspects the block at a world cell and, if a
 * fertilizer is registered for it, advances its growth deterministically,
 * returning whether growth was applied so callers can consume the item.
 *
 * The first fertilizable block is wheat: using bone meal advances the crop's
 * `age` state by a fixed documented step (`WHEAT_GROW_STEP`), clamped to
 * maturity, and is fully deterministic (the optional `rng` is a parity-style
 * seam and is intentionally ignored for wheat). Full tree/sapling bonemeal is
 * deferred (there is no Sapling block or growth stage in the catalog yet); the
 * `FertilizerRegistry` is the extension point a future change registers against.
 */
import { isMature, MAX_AGE } from '../world/CropGrowth';
import { CROP_AGE_PROPERTY } from './CropBehavior';
import { BlockId } from '../world/BlockRegistry';
import type { BlockWorldAccess } from './BlockBehavior';

/** Wheat's fixed bonemeal growth step: +2 stages per use, clamped to maturity. */
export const WHEAT_GROW_STEP = 2;

/**
 * The next wheat age after one bonemeal application. Non-integer or negative
 * inputs normalize to 0 (defensive against malformed state reads); otherwise the
 * result is `min(MAX_AGE, age + WHEAT_GROW_STEP)`, so age never exceeds
 * {@link MAX_AGE}. Deterministic and distinct from the random-tick `+1` step.
 */
export function bonemealNextAge(age: number): number {
  if (!Number.isInteger(age) || age < 0) {
    return 0;
  }
  return Math.min(MAX_AGE, age + WHEAT_GROW_STEP);
}

/** A growth function for a single fertilizable block. Returns true when growth was applied. */
export type FertilizerFn = (world: BlockWorldAccess, x: number, y: number, z: number) => boolean;

/**
 * Registry mapping block ids to growth functions. Extensible: a future change
 * (e.g. tree/sapling bonemeal) adds a `register` entry without changing the
 * interface, item id, or persistence.
 */
export class FertilizerRegistry {
  private readonly byId = new Map<number, FertilizerFn>();

  /** Register a growth function for `blockId`. Throws on invalid ids, non-functions, or duplicates. */
  register(blockId: number, fn: FertilizerFn): void {
    if (!Number.isInteger(blockId) || blockId < 0) {
      throw new Error(`FertilizerRegistry: blockId must be a non-negative integer (got ${blockId})`);
    }
    if (typeof fn !== 'function') {
      throw new Error(`FertilizerRegistry: fertilizer for block id ${blockId} must be a function`);
    }
    if (this.byId.has(blockId)) {
      throw new Error(`FertilizerRegistry: duplicate fertilizer for block id ${blockId}`);
    }
    this.byId.set(blockId, fn);
  }

  /** The growth function for `blockId`, or `undefined` when none is registered. */
  get(blockId: number): FertilizerFn | undefined {
    return this.byId.get(blockId);
  }

  /** Whether a growth function is registered for `blockId`. */
  has(blockId: number): boolean {
    return this.byId.has(blockId);
  }

  /** Number of registered fertilizers. */
  get size(): number {
    return this.byId.size;
  }
}

/**
 * Fertilize a wheat block: advance its `age` by {@link WHEAT_GROW_STEP}, clamped
 * to maturity, via `world.setBlockState`. Returns `false` (no write) when the
 * cell is not wheat, the wheat is mature, the access lacks state capability, or
 * the state read is malformed/throwing. Never throws.
 */
export function fertilizeWheat(world: BlockWorldAccess, x: number, y: number, z: number): boolean {
  if (typeof world.getBlockState !== 'function' || typeof world.setBlockState !== 'function') {
    return false;
  }
  if (world.getBlockId(x, y, z) !== BlockId.Wheat) {
    return false;
  }
  let age: number;
  try {
    const raw = world.getBlockState(x, y, z).getProperty(CROP_AGE_PROPERTY);
    age = raw === undefined ? 0 : parseInt(raw, 10);
  } catch {
    // Malformed/absent state read: no growth, no throw.
    return false;
  }
  if (!Number.isInteger(age) || age < 0 || age > MAX_AGE) {
    age = 0;
  }
  if (isMature(age)) {
    return false;
  }
  world.setBlockState(x, y, z, BlockId.Wheat, { [CROP_AGE_PROPERTY]: bonemealNextAge(age) });
  return true;
}

/** The default fertilizer registry covering the current fertilizable blocks (wheat only). */
export function createDefaultFertilizerRegistry(): FertilizerRegistry {
  const registry = new FertilizerRegistry();
  registry.register(BlockId.Wheat, fertilizeWheat);
  return registry;
}

/**
 * Apply bone meal at `(x, y, z)`: look up the block's growth function in the
 * registry (defaulting to {@link createDefaultFertilizerRegistry}) and run it.
 * Returns `true` when growth was applied, `false` otherwise (air, unfertilizable
 * blocks, mature crops, capability-less access, malformed reads). Deterministic;
 * any optional `rng` is not consumed by the registered wheat rule.
 */
export function applyBonemeal(
  world: BlockWorldAccess,
  x: number,
  y: number,
  z: number,
  registry?: FertilizerRegistry,
): boolean {
  const fn = (registry ?? createDefaultFertilizerRegistry()).get(world.getBlockId(x, y, z));
  if (!fn) {
    return false;
  }
  return fn(world, x, y, z);
}

/**
 * Apply bone meal at `(x, y, z)` and consume one item only when growth was
 * applied. `consume` MUST be called exactly once on success and never on a no-op,
 * so the player never loses bone meal on a failed/unfertilizable target.
 */
export function bonemealTarget(
  world: BlockWorldAccess,
  x: number,
  y: number,
  z: number,
  consume: () => void,
  registry?: FertilizerRegistry,
): boolean {
  const applied = applyBonemeal(world, x, y, z, registry);
  if (applied) {
    consume();
  }
  return applied;
}
