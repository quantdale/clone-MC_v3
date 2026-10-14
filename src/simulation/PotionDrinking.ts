/**
 * Drinkable potions (298) — pure rules.
 *
 * Vanilla `PotionItem`: holding use on a (non-splash, non-lingering) potion
 * drinks it over {@link DRINK_DURATION_TICKS} (32 ticks = 1.6 s). Releasing use
 * before then cancels with nothing consumed. On completion
 * (`finishUsingItem`):
 * - every instant effect applies immediately at full potency
 *   (`applyInstantenousEffect(..., 1.0)`: instant health heals `4 << amp`,
 *   instant damage deals `6 << amp`);
 * - every other effect is added with its full duration and amplifier;
 * - outside creative the potion is consumed and an empty glass bottle is
 *   returned (into the emptied slot, else the inventory, else dropped);
 * - creative keeps the potion and gets no bottle.
 * Water, awkward and other base-only potions carry no effects: drinking them
 * only returns the bottle. Spectators cannot use items.
 *
 * The clone tracks one drink at a time in a small immutable {@link DrinkState};
 * {@link tickDrink} advances it once per unpaused fixed tick and cancels when
 * the use input is released, pointer lock/menus take input, the selected slot
 * or its stack changes, the mode stops allowing interaction, or the death
 * screen opens. Movement slowdown while drinking and drink particles are not
 * modelled (documented gaps).
 */
import type { PotionContents } from '../data/PotionItemData';
import {
  INSTANT_DAMAGE_BASE,
  INSTANT_HEALTH_BASE,
  isInstantDamageEffect,
  isInstantHealthEffect,
} from './SplashPotion';

/** Vanilla potion use duration in ticks (1.6 s at 20 TPS). */
export const DRINK_DURATION_TICKS = 32;

export type DrinkRefusal = 'NO_INTERACT' | 'DEATH_SCREEN' | 'EMPTY_HAND' | 'NOT_POTION' | 'NOT_DRINKABLE';

/** True for contents a player can drink: NORMAL kind (splash/lingering are thrown). */
export function isDrinkablePotion(contents: PotionContents | null | undefined): boolean {
  return !!contents && contents.kind === 'NORMAL' && Array.isArray(contents.customEffects);
}

/** Whether a drink may start with the held stack; `consume` mirrors 265 `depletesItems`. */
export function drinkStartDecision(input: {
  canInteract: boolean;
  deathScreenOpen: boolean;
  depletesItems: boolean;
  stackCount: number;
  isPotionItem: boolean;
  contents: PotionContents | null | undefined;
}): { start: true; consume: boolean } | { start: false; reason: DrinkRefusal } {
  if (!input.canInteract) return { start: false, reason: 'NO_INTERACT' };
  if (input.deathScreenOpen) return { start: false, reason: 'DEATH_SCREEN' };
  if (!(input.stackCount > 0)) return { start: false, reason: 'EMPTY_HAND' };
  if (!input.isPotionItem) return { start: false, reason: 'NOT_POTION' };
  if (!isDrinkablePotion(input.contents)) return { start: false, reason: 'NOT_DRINKABLE' };
  return { start: true, consume: input.depletesItems };
}

/** Stable identity of a held potion (id + contents) used to detect stack swaps. */
export function potionStackKey(itemId: number, contents: PotionContents | null | undefined): string {
  return `${itemId}:${JSON.stringify(contents ?? null)}`;
}

export interface DrinkState {
  /** Hotbar slot holding the potion when the drink started. */
  readonly slot: number;
  /** {@link potionStackKey} of the held stack when the drink started. */
  readonly stackKey: string;
  /** Fixed ticks of use so far (0 at start). */
  readonly ticksUsed: number;
}

export function startDrink(slot: number, stackKey: string): DrinkState {
  return { slot, stackKey, ticksUsed: 0 };
}

export type DrinkCancelReason =
  | 'released'
  | 'unlocked'
  | 'slot-changed'
  | 'stack-changed'
  | 'no-interact'
  | 'death-screen';

/** The per-tick world view {@link tickDrink} checks. */
export interface DrinkFrame {
  readonly useHeld: boolean;
  /** Pointer locked and no menu owns input. */
  readonly inputAvailable: boolean;
  readonly selectedSlot: number;
  /** {@link potionStackKey} of the currently selected stack (count > 0), or null. */
  readonly selectedStackKey: string | null;
  readonly canInteract: boolean;
  readonly deathScreenOpen: boolean;
}

export type DrinkTickResult =
  | { readonly kind: 'continue'; readonly state: DrinkState }
  | { readonly kind: 'finish'; readonly state: DrinkState }
  | { readonly kind: 'cancel'; readonly reason: DrinkCancelReason };

/** Advance a drink by one fixed tick. Cancellation checks run before counting. */
export function tickDrink(state: DrinkState, frame: DrinkFrame): DrinkTickResult {
  if (frame.deathScreenOpen) return { kind: 'cancel', reason: 'death-screen' };
  if (!frame.canInteract) return { kind: 'cancel', reason: 'no-interact' };
  if (!frame.inputAvailable) return { kind: 'cancel', reason: 'unlocked' };
  if (!frame.useHeld) return { kind: 'cancel', reason: 'released' };
  if (frame.selectedSlot !== state.slot) return { kind: 'cancel', reason: 'slot-changed' };
  if (frame.selectedStackKey !== state.stackKey) return { kind: 'cancel', reason: 'stack-changed' };
  const next: DrinkState = { ...state, ticksUsed: state.ticksUsed + 1 };
  return next.ticksUsed >= DRINK_DURATION_TICKS ? { kind: 'finish', state: next } : { kind: 'continue', state: next };
}

export interface DrinkEffectApplication {
  readonly typeId: string;
  readonly durationSeconds: number;
  readonly amplifier: number;
}

export interface DrinkOutcome {
  /** Instant health total (half-hearts). */
  readonly heal: number;
  /** Instant damage total (magic). */
  readonly damage: number;
  /** Duration effects at full duration (seconds) and amplifier. */
  readonly effects: readonly DrinkEffectApplication[];
  /** Survival/adventure: the potion is consumed. */
  readonly consumePotion: boolean;
  /** Survival/adventure: an empty glass bottle is returned. */
  readonly returnBottle: boolean;
}

/** What finishing a drink does (vanilla `PotionItem.finishUsingItem`). */
export function resolveDrinkOutcome(contents: PotionContents, depletesItems: boolean): DrinkOutcome {
  let heal = 0;
  let damage = 0;
  const effects: DrinkEffectApplication[] = [];
  for (const effect of contents.customEffects) {
    const amp = Math.max(0, Math.min(30, Math.floor(effect.amplifier)));
    if (isInstantHealthEffect(effect.typeId)) {
      heal += INSTANT_HEALTH_BASE << amp;
    } else if (isInstantDamageEffect(effect.typeId)) {
      damage += INSTANT_DAMAGE_BASE << amp;
    } else if (Number.isFinite(effect.duration) && effect.duration > 0) {
      effects.push({ typeId: effect.typeId, durationSeconds: effect.duration, amplifier: amp });
    }
  }
  return { heal, damage, effects, consumePotion: depletesItems, returnBottle: depletesItems };
}
