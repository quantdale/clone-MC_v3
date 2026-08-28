/**
 * Food-component runtime (change 124).
 *
 * Turns an item definition's food metadata into a concrete consume action and applies
 * any food-borne status effects to a per-entity `StatusEffectManager`. This is the
 * gameplay consumer change 122's potion primitives anticipated: the same `applyConsumeEffects`
 * helper is reusable by a later potion-drinking path.
 *
 * The module is pure (no DOM, no randomness) so it is fully unit-testable. Hunger/saturation
 * clamping stays in `SurvivalSystem.eat`; this module only resolves the values to feed it.
 */

import { tryParseResourceId, type ResourceId } from '../data/ResourceId';
import { type PotionEffectData } from '../data/PotionItemData';
import { StatusEffectManager } from '../data/StatusEffectManager';
import { type ItemTypeDefinition } from '../inventory/ItemRegistry';

/** Resolved nutrition + effects for a single consume action. */
export interface ConsumeEffects {
  /** Hunger restored (clamped to >= 0; 0 when the definition omits it). */
  readonly hunger: number;
  /** Saturation restored (clamped to >= 0; 0 when the definition omits it). */
  readonly saturation: number;
  /** Status-effect rows to apply on a successful eat. */
  readonly effects: readonly PotionEffectData[];
}

function clampNonNeg(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function isValidFoodEffect(effect: unknown): effect is PotionEffectData {
  if (effect === null || typeof effect !== 'object' || Array.isArray(effect)) return false;
  const candidate = effect as Partial<PotionEffectData>;
  return (
    typeof candidate.typeId === 'string' &&
    candidate.typeId.length > 0 &&
    typeof candidate.duration === 'number' &&
    Number.isFinite(candidate.duration) &&
    candidate.duration >= 0 &&
    typeof candidate.amplifier === 'number' &&
    Number.isFinite(candidate.amplifier) &&
    candidate.amplifier >= 0
  );
}

/**
 * Resolve a food item's nutrition and effects, or `null` when the definition is not edible.
 *
 * Reads `foodHunger`/`foodSaturation` (defaulting missing values to `0` and clamping to
 * `>= 0`) and `foodEffects` (with any structurally malformed row dropped). A non-food
 * definition yields `null` so callers can short-circuit the consume path.
 */
export function resolveFoodConsume(def: ItemTypeDefinition): ConsumeEffects | null {
  if (!def.isFood) return null;
  const rawEffects = def.foodEffects ?? [];
  const effects: PotionEffectData[] = [];
  for (const effect of rawEffects) {
    if (isValidFoodEffect(effect)) {
      effects.push(effect);
    }
  }
  return {
    hunger: clampNonNeg(def.foodHunger ?? 0),
    saturation: clampNonNeg(def.foodSaturation ?? 0),
    effects,
  };
}

/**
 * Apply consume effects to a per-entity `StatusEffectManager`. Each effect's `typeId` is
 * parsed to a `ResourceId`; an effect whose `typeId` is not a parseable `ResourceId` or does
 * not resolve to a registered effect type is skipped WITHOUT throwing, so a single bad row
 * can never abort the consume. Durations/amplifiers are clamped by the manager.
 */
export function applyConsumeEffects(
  manager: StatusEffectManager,
  effects: readonly PotionEffectData[],
): void {
  for (const effect of effects) {
    const typeId: ResourceId | null = tryParseResourceId(effect.typeId);
    if (!typeId) continue;
    try {
      manager.add(typeId, effect.duration, effect.amplifier);
    } catch {
      // Unregistered effect type: ignore rather than abort the consume.
    }
  }
}
