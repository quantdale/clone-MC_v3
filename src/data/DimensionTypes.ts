/**
 * Dimension types (175/180): the canonical `DimensionType` instances beyond the overworld — the
 * Nether (175) and the End (180) — plus the save-namespace rule. The overworld type is defined here
 * too so the standard dimensions share one module (the overworld's parameters match vanilla 1.18+:
 * minY -64, height 384).
 *
 * The Nether matches vanilla: 0..255 (16 sections), NO skylight, ultrawarm (constant warmth —
 * vanilla's "ambient rule" for the dimension), non-natural (no natural monster spawns without
 * spawners), and a fixed time of 18000 ticks (noon — vanilla locks the Nether's day cycle).
 *
 * The End matches vanilla: 0..255 (16 sections), NO skylight, non-natural, not ultrawarm, and a
 * fixed time of 6000 ticks (vanilla locks the End at 6000 — its perpetual dawn).
 *
 * Save namespace: a dimension's storage namespace IS its key (e.g. `minecraft:the_nether`).
 * `dimensionSaveNamespace` validates that a key is a legal full resource id and returns it
 * unchanged, so a malformed key can never silently reach the persistence layer.
 */
import { createResourceId, tryParseResourceId } from './ResourceId';
import { RegistryError } from './Registry';
import { DimensionType } from './DimensionType';

/** The standard overworld: minY -64, 384 blocks (24 sections), skylight, natural, no fixed time. */
export const OVERWORLD_DIMENSION_TYPE = new DimensionType({
  id: createResourceId('minecraft', 'overworld'),
  minY: -64,
  height: 384,
  logicalHeight: 384,
  hasSkylight: true,
});

/**
 * The Nether: minY 0, 256 blocks (16 sections), NO skylight, ultrawarm, non-natural, fixed time
 * 18000 (noon) — vanilla's bounds, ambient rules, and time lock.
 */
export const NETHER_DIMENSION_TYPE = new DimensionType({
  id: createResourceId('minecraft', 'the_nether'),
  minY: 0,
  height: 256,
  logicalHeight: 256,
  hasSkylight: false,
  ultrawarm: true,
  natural: false,
  fixedTime: 18000,
});

/**
 * The End: minY 0, 256 blocks (16 sections), NO skylight, non-natural, fixed time 6000 (vanilla
 * locks the End at 6000 ticks — the perpetual "dawn" of the End), not ultrawarm.
 */
export const END_DIMENSION_TYPE = new DimensionType({
  id: createResourceId('minecraft', 'the_end'),
  minY: 0,
  height: 256,
  logicalHeight: 256,
  hasSkylight: false,
  natural: false,
  fixedTime: 6000,
});

/**
 * The dimension's save namespace: its own key (e.g. `minecraft:the_nether`). Validates that `key`
 * is a legal full resource id (namespace:path) and returns it unchanged; throws `RegistryError`
 * with reason `INVALID_ID` for malformed keys.
 */
export function dimensionSaveNamespace(key: string): string {
  if (tryParseResourceId(key) === null) {
    throw new RegistryError('INVALID_ID', key, 'dimension key must be a legal resource id (namespace:path)');
  }
  return key;
}
