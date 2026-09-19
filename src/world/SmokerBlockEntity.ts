/**
 * Smoker block-entity adapter (281).
 *
 * The runtime payload is intentionally the exact validated FurnaceState shape.
 * This module owns only the stable smoker identity so the shared furnace menu
 * and persistence codec cannot drift into a second inventory contract.
 */

import { BlockEntityInstance } from '../simulation/BlockEntityManager';
import {
  createFurnaceState,
  deserializeFurnaceState,
  serializeFurnaceState,
  validateFurnaceState,
  type FurnaceState,
} from './FurnaceBlockEntity';

/** Stable numeric block id for the smoker. */
export const SMOKER_BLOCK_ID = 64;
/** Stable numeric item id for the smoker item. */
export const SMOKER_ITEM_ID = 72;
/** Existing block-entity type key already present in the default registry. */
export const SMOKER_TYPE_KEY = 'smoker';

/** Build a smoker instance with the shared furnace payload shape. */
export function createSmokerBlockEntity(
  x: number,
  y: number,
  z: number,
  state?: FurnaceState,
): BlockEntityInstance {
  const valid = state === undefined ? createFurnaceState() : validateFurnaceState(state);
  return new BlockEntityInstance({
    typeKey: SMOKER_TYPE_KEY,
    x,
    y,
    z,
    tickable: true,
    data: serializeFurnaceState(valid),
  });
}

/** Read a smoker payload, rejecting a furnace or any other entity type. */
export function readSmokerState(instance: BlockEntityInstance): FurnaceState {
  if (instance.typeKey !== SMOKER_TYPE_KEY) {
    throw new Error(`SmokerBlockEntity: expected typeKey '${SMOKER_TYPE_KEY}', got '${instance.typeKey}'`);
  }
  return deserializeFurnaceState(instance.data);
}

/** Return a new smoker instance with a validated state. */
export function updateSmokerState(
  instance: BlockEntityInstance,
  state: FurnaceState,
): BlockEntityInstance {
  const valid = validateFurnaceState(state);
  return new BlockEntityInstance({
    typeKey: SMOKER_TYPE_KEY,
    x: instance.x,
    y: instance.y,
    z: instance.z,
    tickable: true,
    data: serializeFurnaceState(valid),
  });
}
