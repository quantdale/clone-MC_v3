/**
 * Glass bottle filling (298) — pure rules.
 *
 * Vanilla `BottleItem.use` casts the player's view ray with
 * `ClipContext.Fluid.SOURCE_ONLY`: the first block outline or source fluid
 * along the ray within reach stops it, and only a water source fills the
 * bottle. The clone has no live flowing-fluid state (every live water block is
 * a source), so {@link fluidRaycast} walks the voxel grid with a sampler that
 * treats every non-air cell as a hit and the fill applies iff that first cell
 * is water.
 *
 * {@link bottleFillDecision} mirrors vanilla `ItemUtils.createFilledResult`:
 * - survival/adventure (`depletesItems`): one bottle is consumed; a single
 *   bottle turns into the water bottle in place, otherwise the water bottle is
 *   inserted component-preserving. With no room the fill is REFUSED (vanilla
 *   drops the filled bottle, but item entities cannot carry components here,
 *   so a dropped water bottle would lose its contents — documented divergence);
 * - creative: the bottle stack is untouched and a water bottle is added only
 *   when the inventory does not already hold an identical one (vanilla
 *   prevent-duplicates); no room → nothing changes;
 * - spectators (`canInteract` false) and the death screen refuse.
 */
import { raycastVoxel } from '../math/DDA';
import { createPotionContents, type PotionContents } from '../data/PotionItemData';
import { WATER_BASE } from '../inventory/BrewingRecipes';

/** Legacy block id of air and water (mirrors `BlockId.Air`/`BlockId.Water`). */
export interface FluidRaycastBlocks {
  readonly air: number;
  readonly water: number;
}

export interface FluidRaycastHit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly blockId: number;
  readonly distance: number;
  /** True when the first non-air cell along the ray is water (a source). */
  readonly water: boolean;
}

/**
 * First non-air cell along the ray within `reach`, or null when the ray only
 * crosses air. Non-finite input or a zero direction yields null.
 */
export function fluidRaycast(
  getBlock: (x: number, y: number, z: number) => number,
  blocks: FluidRaycastBlocks,
  origin: { readonly x: number; readonly y: number; readonly z: number },
  dir: { readonly x: number; readonly y: number; readonly z: number },
  reach: number,
): FluidRaycastHit | null {
  const hit = raycastVoxel(
    { isSolid: (x, y, z) => getBlock(x, y, z) !== blocks.air },
    origin.x,
    origin.y,
    origin.z,
    dir.x,
    dir.y,
    dir.z,
    reach,
  );
  if (!hit) return null;
  const blockId = getBlock(hit.blockX, hit.blockY, hit.blockZ);
  return {
    x: hit.blockX,
    y: hit.blockY,
    z: hit.blockZ,
    blockId,
    distance: hit.distance,
    water: blockId === blocks.water,
  };
}

/** The contents of a vanilla water bottle: base water, NORMAL, no effects. */
export function createWaterBottleContents(): PotionContents {
  return createPotionContents({ base: WATER_BASE, kind: 'NORMAL', customEffects: [] });
}

/** True for water-bottle contents (base water, NORMAL, no effects). */
export function isWaterBottleContents(contents: PotionContents | null | undefined): boolean {
  return (
    !!contents &&
    contents.base === WATER_BASE &&
    contents.kind === 'NORMAL' &&
    Array.isArray(contents.customEffects) &&
    contents.customEffects.length === 0
  );
}

export type BottleFillRefusal =
  | 'NO_INTERACT'
  | 'DEATH_SCREEN'
  | 'EMPTY_HAND'
  | 'NOT_BOTTLE'
  | 'NO_WATER'
  | 'NO_ROOM'
  | 'ALREADY_HELD';

export type BottleFillDecision =
  | {
      readonly fill: true;
      /** Survival/adventure: remove one bottle from the held stack. */
      readonly consumeBottle: boolean;
      /** The held stack was a single bottle: the slot becomes the water bottle. */
      readonly replaceSlot: boolean;
    }
  | { readonly fill: false; readonly reason: BottleFillRefusal };

/**
 * Whether using the held stack fills a water bottle and how the inventory
 * changes. Checks run in vanilla order: interaction → hand → item → ray.
 */
export function bottleFillDecision(input: {
  canInteract: boolean;
  deathScreenOpen: boolean;
  depletesItems: boolean;
  stackCount: number;
  isGlassBottle: boolean;
  hitWater: boolean;
  /** Whether a water bottle can be inserted elsewhere in the inventory. */
  canInsertWaterBottle: boolean;
  /** Whether the inventory already holds an identical water bottle (creative). */
  hasWaterBottle: boolean;
}): BottleFillDecision {
  if (!input.canInteract) return { fill: false, reason: 'NO_INTERACT' };
  if (input.deathScreenOpen) return { fill: false, reason: 'DEATH_SCREEN' };
  if (!(input.stackCount > 0)) return { fill: false, reason: 'EMPTY_HAND' };
  if (!input.isGlassBottle) return { fill: false, reason: 'NOT_BOTTLE' };
  if (!input.hitWater) return { fill: false, reason: 'NO_WATER' };
  if (!input.depletesItems) {
    if (input.hasWaterBottle) return { fill: false, reason: 'ALREADY_HELD' };
    if (!input.canInsertWaterBottle) return { fill: false, reason: 'NO_ROOM' };
    return { fill: true, consumeBottle: false, replaceSlot: false };
  }
  if (input.stackCount === 1) return { fill: true, consumeBottle: true, replaceSlot: true };
  if (!input.canInsertWaterBottle) return { fill: false, reason: 'NO_ROOM' };
  return { fill: true, consumeBottle: true, replaceSlot: false };
}
