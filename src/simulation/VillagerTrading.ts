/**
 * Villager trading (151): per-profession level-gated trade offers, eligibility checking, a pure
 * trade application with use limits and villager XP/level progression, restocking, and a
 * projection into 106's `ContainerMenu` for a future container screen.
 *
 * Mirrors 120's `EnchantingTableSession` precedent: session/offer state plus pure application
 * logic, with the DOM screen (203's scope) and any `Inventory`/`Game` wiring explicitly deferred.
 * Nothing spawns a villager yet (150's inherited blocker — no village/structure generation), so
 * this is additive/unconsumed. No gossip/reputation price modifiers, no persistence, no automatic
 * timed restock — see `openspec/changes/151-villager-trading/design.md`.
 */
import { createContainerMenu, type ContainerMenu, type MenuSlot } from '../inventory/MenuTransaction';

/** One side of a trade: an item key and a positive count. */
export interface TradeItem {
  readonly item: string;
  readonly count: number;
}

/** One trade offer: one or two required inputs, a result, use limits, XP, and an unlock level. */
export interface TradeOffer {
  readonly inputA: TradeItem;
  /** Vanilla's optional second input slot; `null` when the offer needs only one input. */
  readonly inputB: TradeItem | null;
  readonly result: TradeItem;
  readonly maxUses: number;
  readonly usesRemaining: number;
  readonly xpReward: number;
  /** Villager level at which this offer unlocks (1 = available from the start). */
  readonly unlockLevel: number;
}

/** A villager's trading state: its offers plus its level/XP progression. */
export interface VillagerTradeState {
  readonly offers: readonly TradeOffer[];
  readonly level: number;
  readonly xp: number;
}

/** Maximum villager level. */
export const VILLAGER_MAX_LEVEL = 5;
/** Trade XP required to advance one villager level. */
export const XP_PER_VILLAGER_LEVEL = 10;

/** A template offer (everything but the per-instance `usesRemaining`). */
type OfferTemplate = Omit<TradeOffer, 'usesRemaining'>;

function offer(
  inputA: TradeItem,
  inputB: TradeItem | null,
  result: TradeItem,
  maxUses: number,
  xpReward: number,
  unlockLevel: number,
): OfferTemplate {
  return { inputA, inputB, result, maxUses, xpReward, unlockLevel };
}

const item = (key: string, count: number): TradeItem => ({ item: key, count });

/**
 * The per-profession offer table, keyed by 150's profession `key`. Three offers per profession
 * spanning unlock levels 1/2/3. Not an exhaustive vanilla catalog — a later content-expansion
 * change may extend it; no code here hardcodes a fixed offer count.
 */
const OFFER_TABLE: Readonly<Record<string, readonly OfferTemplate[]>> = {
  farmer: [
    offer(item('wheat', 20), null, item('emerald', 1), 16, 2, 1),
    offer(item('emerald', 1), null, item('bread', 6), 16, 2, 2),
    offer(item('emerald', 3), null, item('apple', 4), 12, 5, 3),
  ],
  librarian: [
    offer(item('paper', 24), null, item('emerald', 1), 16, 2, 1),
    offer(item('emerald', 9), null, item('book', 1), 12, 5, 2),
    offer(item('emerald', 5), item('book', 1), item('book', 1), 12, 10, 3),
  ],
  weaponsmith: [
    offer(item('coal', 15), null, item('emerald', 1), 16, 2, 1),
    offer(item('emerald', 7), null, item('iron_ingot', 1), 12, 5, 2),
    offer(item('emerald', 36), null, item('wooden_axe', 1), 3, 15, 3),
  ],
};

/**
 * The offers for `professionKey` unlocked at or below `level`, each fresh (full `usesRemaining`)
 * so two calls never share mutable state. An unknown key yields `[]` (no throw).
 */
export function createOffersForProfession(professionKey: string, level: number): TradeOffer[] {
  const templates = OFFER_TABLE[professionKey] ?? [];
  return templates
    .filter((t) => t.unlockLevel <= level)
    .map((t) => ({ ...t, usesRemaining: t.maxUses }));
}

/** A fresh trade state for `professionKey` at `level` (default 1). */
export function createVillagerTradeState(professionKey: string, level = 1): VillagerTradeState {
  return { offers: createOffersForProfession(professionKey, level), level, xp: 0 };
}

function satisfies(required: TradeItem, offered: TradeItem | null): boolean {
  return offered !== null && offered.item === required.item && offered.count >= required.count;
}

/**
 * Whether `offeredA`/`offeredB` satisfy `offer`: the offer must have remaining uses, `offeredA`
 * must match `inputA` with a sufficient count, and when `inputB` is non-null `offeredB` must match
 * it too. When `inputB` is `null`, `offeredB` is ignored entirely (a stray second stack does not
 * block the trade, matching vanilla's unused second slot).
 */
export function canAcceptTrade(
  offer: TradeOffer,
  offeredA: TradeItem | null,
  offeredB: TradeItem | null,
): boolean {
  if (offer.usesRemaining <= 0) return false;
  if (!satisfies(offer.inputA, offeredA)) return false;
  if (offer.inputB !== null && !satisfies(offer.inputB, offeredB)) return false;
  return true;
}

/** The outcome of one {@link applyTrade} attempt. `result` is `null` iff the trade was rejected. */
export interface TradeResult {
  readonly state: VillagerTradeState;
  readonly result: TradeItem | null;
  readonly consumedA: TradeItem | null;
  readonly consumedB: TradeItem | null;
}

/**
 * Apply the trade at `offerIndex`. Pure: never mutates `state` or the offered stacks. On rejection
 * (out-of-range index or a failed {@link canAcceptTrade}) returns the same `state` reference with
 * `result: null`. On success returns a new state with that offer's `usesRemaining` decremented by
 * one and the villager's XP raised by `xpReward` (converting full `XP_PER_VILLAGER_LEVEL`
 * increments into levels, capped at `VILLAGER_MAX_LEVEL`), plus the offer's exact declared input
 * costs as `consumedA`/`consumedB`.
 */
export function applyTrade(
  state: VillagerTradeState,
  offerIndex: number,
  offeredA: TradeItem | null,
  offeredB: TradeItem | null,
): TradeResult {
  const target = state.offers[offerIndex];
  if (!target || !canAcceptTrade(target, offeredA, offeredB)) {
    return { state, result: null, consumedA: null, consumedB: null };
  }

  const offers = state.offers.map((o, i) =>
    i === offerIndex ? { ...o, usesRemaining: o.usesRemaining - 1 } : o,
  );

  let level = state.level;
  let xp = state.xp + target.xpReward;
  while (level < VILLAGER_MAX_LEVEL && xp >= XP_PER_VILLAGER_LEVEL) {
    xp -= XP_PER_VILLAGER_LEVEL;
    level++;
  }

  return {
    state: { offers, level, xp },
    result: target.result,
    consumedA: target.inputA,
    consumedB: target.inputB,
  };
}

/** A new state with every offer's `usesRemaining` reset to its `maxUses`; level/XP unchanged. */
export function restock(state: VillagerTradeState): VillagerTradeState {
  return {
    ...state,
    offers: state.offers.map((o) => ({ ...o, usesRemaining: o.maxUses })),
  };
}

/** Fixed stack cap for the three trade slots (they are previews, not real inventory storage). */
const TRADE_SLOT_MAX_STACK = 64;

function tradeSlot(source: TradeItem | null): MenuSlot {
  return source === null
    ? { item: null, count: 0, maxStack: TRADE_SLOT_MAX_STACK }
    : { item: source.item, count: source.count, maxStack: TRADE_SLOT_MAX_STACK };
}

/**
 * Project the offer at `offerIndex` into a 106 `ContainerMenu`: slot 0 previews `inputA`, slot 1
 * previews `inputB` (empty when the offer has none), slot 2 previews `result`, then `playerSlots`
 * follow with `playerSlotStart === 3`. An out-of-range `offerIndex` yields three empty trade slots.
 *
 * Note: 106 has no read-only-slot concept, so the result slot is NOT write-protected here — a
 * future UI must gate result-slot interaction itself.
 */
export function buildTradeMenu(
  state: VillagerTradeState,
  offerIndex: number,
  playerSlots: readonly MenuSlot[],
): ContainerMenu {
  const target = state.offers[offerIndex];
  const slots: MenuSlot[] = [
    tradeSlot(target ? target.inputA : null),
    tradeSlot(target ? target.inputB : null),
    tradeSlot(target ? target.result : null),
    ...playerSlots.map((s) => ({ ...s })),
  ];
  return createContainerMenu(slots, 3);
}
