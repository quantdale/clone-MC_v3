/**
 * Villager trading persistence (278): versioned validate-before-accept codec
 * for the live per-profession `VillagerTradeState` map persisted under
 * `__trades__:<worldId>`.
 *
 * The 151 `VillagerTrading.ts` core owns the runtime rules; this module owns
 * only the durable shape. Unknown profession keys are dropped; each known
 * profession validates independently (one corrupt profession degrades to
 * fresh while valid siblings are kept). Never throws for corrupt payloads —
 * returns `null` (whole-map degrade) only when the root is unusable; per-
 * profession failures degrade that profession alone.
 */
import {
  createOffersForProfession,
  createVillagerTradeState,
  VILLAGER_MAX_LEVEL,
  type TradeItem,
  type TradeOffer,
  type VillagerTradeState,
} from './VillagerTrading';

export const TRADING_STORE_VERSION = 1;

/** The professions the live trading post owns (150 default catalog). */
export const TRADING_PROFESSIONS: readonly string[] = ['farmer', 'librarian', 'weaponsmith'];

export interface PersistedTradeItem {
  readonly item: string;
  readonly count: number;
}

export interface PersistedOffer {
  readonly inputA: PersistedTradeItem;
  readonly inputB: PersistedTradeItem | null;
  readonly result: PersistedTradeItem;
  readonly maxUses: number;
  readonly usesRemaining: number;
  readonly xpReward: number;
  readonly unlockLevel: number;
}

export interface PersistedTradeState {
  readonly version: 1;
  readonly level: number;
  readonly xp: number;
  readonly offers: readonly PersistedOffer[];
}

export type PersistedTrades = Record<string, PersistedTradeState>;

function isTradeItem(v: unknown): v is TradeItem {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.item === 'string' &&
    r.item.length > 0 &&
    typeof r.count === 'number' &&
    Number.isInteger(r.count) &&
    (r.count as number) > 0
  );
}

function isOffer(v: unknown): v is PersistedOffer {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (!isTradeItem(r.inputA)) return false;
  if (r.inputB !== null && !isTradeItem(r.inputB)) return false;
  if (!isTradeItem(r.result)) return false;
  if (typeof r.maxUses !== 'number' || !Number.isInteger(r.maxUses) || (r.maxUses as number) <= 0) return false;
  if (
    typeof r.usesRemaining !== 'number' ||
    !Number.isInteger(r.usesRemaining) ||
    (r.usesRemaining as number) < 0 ||
    (r.usesRemaining as number) > (r.maxUses as number)
  )
    return false;
  if (typeof r.xpReward !== 'number' || !Number.isInteger(r.xpReward) || (r.xpReward as number) < 0) return false;
  if (
    typeof r.unlockLevel !== 'number' ||
    !Number.isInteger(r.unlockLevel) ||
    (r.unlockLevel as number) < 1 ||
    (r.unlockLevel as number) > VILLAGER_MAX_LEVEL
  )
    return false;
  return true;
}

function isState(v: unknown): v is PersistedTradeState {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.version !== TRADING_STORE_VERSION) return false;
  if (typeof r.level !== 'number' || !Number.isInteger(r.level) || r.level < 1 || r.level > VILLAGER_MAX_LEVEL)
    return false;
  if (typeof r.xp !== 'number' || !Number.isInteger(r.xp) || r.xp < 0) return false;
  if (!Array.isArray(r.offers)) return false;
  for (const o of r.offers as unknown[]) {
    if (!isOffer(o)) return false;
  }
  return true;
}

/**
 * Strict archive-boundary validation for a persisted trade map. Runtime loads
 * intentionally degrade one corrupt profession to fresh defaults, but an
 * archive import must reject malformed payloads before its first write so a
 * bad archive cannot be silently preserved and later become a different save.
 * Unknown profession keys remain forward-compatible and are ignored by the
 * runtime codec; at least one known profession must still be present.
 */
export function validatePersistedTrades(payload: unknown): PersistedTrades {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('tradingData must be an object');
  }
  const root = payload as Record<string, unknown>;
  const known = TRADING_PROFESSIONS.filter((key) => root[key] !== undefined);
  if (known.length === 0) {
    throw new Error('tradingData must contain a known profession');
  }
  for (const key of known) {
    if (!isState(root[key])) {
      throw new Error(`tradingData.${key} is invalid`);
    }
  }
  return root as PersistedTrades;
}

/** Dedupe key for level-up unlock merges (278): exact declared triple. */
export function tradeTriple(o: { inputA: TradeItem; inputB: TradeItem | null; result: TradeItem }): string {
  const b = o.inputB ? `${o.inputB.item}x${o.inputB.count}` : '—';
  return `${o.inputA.item}x${o.inputA.count}+${b}>${o.result.item}x${o.result.count}`;
}

/**
 * Append newly unlocked offer rows for `professionKey` when `state.level` exceeds
 * `preLevel`. Rows are fresh (full uses), filtered to `unlockLevel > preLevel`,
 * and deduped by declared triple so a repeated call adds nothing. Pure.
 */
export function withUnlockedOffers(
  state: VillagerTradeState,
  professionKey: string,
  preLevel: number,
): VillagerTradeState {
  if (state.level <= preLevel) return state;
  const unlocked = createOffersForProfession(professionKey, state.level).filter(
    (t) => t.unlockLevel > preLevel,
  );
  const seen = new Set(state.offers.map((o) => tradeTriple(o)));
  const additions: TradeOffer[] = [];
  for (const t of unlocked) {
    const triple = tradeTriple(t);
    if (seen.has(triple)) continue;
    seen.add(triple);
    additions.push({ ...t, usesRemaining: t.maxUses });
  }
  if (additions.length === 0) return state;
  return { ...state, offers: [...state.offers, ...additions] };
}

/** Fresh level-1 states for every known profession. */
export function createDefaultTradingStates(): Record<string, VillagerTradeState> {
  const out: Record<string, VillagerTradeState> = {};
  for (const key of TRADING_PROFESSIONS) {
    out[key] = createVillagerTradeState(key, 1);
  }
  return out;
}

/** Serialize the live map into the durable shape (pure, never throws for valid states). */
export function serializeTrades(states: Record<string, VillagerTradeState>): PersistedTrades {
  const out: PersistedTrades = {};
  for (const key of TRADING_PROFESSIONS) {
    const s = states[key] ?? createVillagerTradeState(key, 1);
    out[key] = {
      version: TRADING_STORE_VERSION,
      level: s.level,
      xp: s.xp,
      offers: s.offers.map((o) => ({
        inputA: { item: o.inputA.item, count: o.inputA.count },
        inputB: o.inputB ? { item: o.inputB.item, count: o.inputB.count } : null,
        result: { item: o.result.item, count: o.result.count },
        maxUses: o.maxUses,
        usesRemaining: o.usesRemaining,
        xpReward: o.xpReward,
        unlockLevel: o.unlockLevel,
      })),
    };
  }
  return out;
}

/**
 * Validate `payload` and return the live map, or `null` when the root is
 * unusable (caller degrades to fresh). Per-profession failures degrade that
 * profession to fresh while valid siblings are kept; unknown keys are dropped.
 */
export function deserializeTrades(payload: unknown): Record<string, VillagerTradeState> | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length === 0) return null;
  let anyKnown = false;
  const out: Record<string, VillagerTradeState> = {};
  for (const key of TRADING_PROFESSIONS) {
    const raw = root[key];
    if (raw === undefined) {
      out[key] = createVillagerTradeState(key, 1);
      continue;
    }
    anyKnown = true;
    if (!isState(raw)) {
      out[key] = createVillagerTradeState(key, 1);
      continue;
    }
    out[key] = {
      level: raw.level,
      xp: raw.xp,
      offers: raw.offers.map((o) => ({
        inputA: { item: o.inputA.item, count: o.inputA.count },
        inputB: o.inputB ? { item: o.inputB.item, count: o.inputB.count } : null,
        result: { item: o.result.item, count: o.result.count },
        maxUses: o.maxUses,
        usesRemaining: o.usesRemaining,
        xpReward: o.xpReward,
        unlockLevel: o.unlockLevel,
      })),
    };
  }
  if (!anyKnown) return null;
  return out;
}
