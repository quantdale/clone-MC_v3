/**
 * Hero of the Village reward rules (290): pure mapping from raid Bad Omen →
 * HOTV amplifier/duration, emerald trade discount, and the exactly-once grant
 * predicate for non-VICTORY → VICTORY transitions. No Game/DOM/persistence.
 */
import type { RaidStatus } from './RaidStateMachine';
import type { TradeItem, TradeOffer } from './VillagerTrading';

/** 40 minutes of game time at 20 TPS, expressed in StatusEffect seconds. */
export const HERO_OF_THE_VILLAGE_DURATION_SECONDS = 2400;

/** Maximum HOTV amplifier (Level V); Bad Omen caps at 5 → amp 4. */
export const HERO_OF_THE_VILLAGE_MAX_AMPLIFIER = 4;

const EMERALD = 'emerald';

/**
 * Map a raid Bad Omen level to HOTV amplifier (0 = Level I … 4 = Level V).
 * Non-finite / ≤1 → 0; ≥5 → 4. Never throws.
 */
export function heroAmplifierFromBadOmen(badOmenLevel: number): number {
  if (!Number.isFinite(badOmenLevel) || badOmenLevel <= 1) return 0;
  if (badOmenLevel >= 5) return HERO_OF_THE_VILLAGE_MAX_AMPLIFIER;
  return Math.floor(badOmenLevel) - 1;
}

/** Pinned HOTV duration in seconds. */
export function heroDurationSeconds(): number {
  return HERO_OF_THE_VILLAGE_DURATION_SECONDS;
}

/**
 * Vanilla-like emerald discount:
 *   fraction = 0.3 + 0.0625 * amplifier
 *   discounted = max(1, base - floor(base * fraction))
 * Non-finite / non-positive base → 0; amplifier clamped to ≥0.
 */
export function discountEmeraldCount(baseCount: number, amplifier: number): number {
  if (!Number.isFinite(baseCount) || baseCount <= 0) return 0;
  const base = Math.floor(baseCount);
  if (base <= 0) return 0;
  const amp = !Number.isFinite(amplifier) || amplifier < 0 ? 0 : Math.floor(amplifier);
  const fraction = 0.3 + 0.0625 * amp;
  const discounted = base - Math.floor(base * fraction);
  return Math.max(1, discounted);
}

function discountItem(item: TradeItem, amplifier: number): TradeItem {
  if (item.item !== EMERALD) return item;
  return { item: item.item, count: discountEmeraldCount(item.count, amplifier) };
}

/**
 * Project a catalog offer through HOTV. When `amplifier` is null/undefined,
 * returns the same offer reference (identity). Emerald inputs are discounted;
 * non-emerald inputs and the result are unchanged.
 */
export function applyHeroTradeDiscount(
  offer: TradeOffer,
  amplifier: number | null | undefined,
): TradeOffer {
  if (amplifier === null || amplifier === undefined) return offer;
  if (!Number.isFinite(amplifier) || amplifier < 0) return offer;
  const amp = Math.floor(amplifier);
  const inputA = discountItem(offer.inputA, amp);
  const inputB = offer.inputB === null ? null : discountItem(offer.inputB, amp);
  if (inputA === offer.inputA && inputB === offer.inputB) return offer;
  return { ...offer, inputA, inputB };
}

/**
 * Exactly-once grant predicate: true iff the new status is VICTORY and the
 * previous status was not already VICTORY (including null/undefined prev).
 */
export function shouldGrantHeroOfTheVillage(
  prev: RaidStatus | null | undefined,
  next: RaidStatus,
): boolean {
  return next === 'VICTORY' && prev !== 'VICTORY';
}
