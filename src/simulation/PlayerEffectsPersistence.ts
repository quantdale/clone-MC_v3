/**
 * Player status-effect persistence codec (292). Pure: no Game, DOM or storage
 * imports. Serializes the player's active status effects (type, amplifier,
 * remaining seconds) plus the Game-owned Bad Omen (level + remaining seconds)
 * into a versioned payload stored as the optional `effects` field of the
 * existing player-state record, and parses it back tolerantly:
 *
 * - absent payload (pre-292 saves) → no effects, omen 0 (`absent`)
 * - malformed top level / unknown version → no effects, omen 0 (`invalid`)
 * - malformed or unregistered entries are dropped individually
 * - durations/amplifiers clamp to registry bounds; omen clamps to level 0..5
 *   and remaining [0, BAD_OMEN_DURATION_SECONDS]
 *
 * Parsing never throws. Remaining durations are restored exactly (resume, not
 * reset) so a reload can never refresh an effect to full.
 */

import { tryParseResourceId } from '../data/ResourceId';
import type { StatusEffectInstanceData, StatusEffectTypeRegistry } from '../data/StatusEffect';
import { clampBadOmenLevel } from './BadOmenRules';

export const PLAYER_EFFECTS_PAYLOAD_VERSION = 1;
/** Vanilla Bad Omen duration: 120000 ticks at 20 TPS = 100 minutes. */
export const BAD_OMEN_DURATION_SECONDS = 6000;
/** Upper bound on persisted effect entries (the default registry has 25 types). */
export const MAX_PERSISTED_EFFECTS = 64;

export interface PersistedBadOmen {
  readonly level: number;
  readonly remainingSeconds: number;
}

export interface PersistedPlayerEffects {
  readonly version: 1;
  readonly effects: StatusEffectInstanceData[];
  readonly badOmen: PersistedBadOmen;
}

export type PlayerEffectsRestoreStatus = 'absent' | 'ok' | 'invalid';

export interface PlayerEffectsRestore {
  readonly status: PlayerEffectsRestoreStatus;
  /** Sanitized, registry-clamped entries in payload order (first duplicate wins). */
  readonly effects: StatusEffectInstanceData[];
  readonly badOmen: PersistedBadOmen;
  /** Entries discarded while parsing (malformed, unregistered, expired, duplicate, over cap). */
  readonly dropped: number;
}

const NO_OMEN: PersistedBadOmen = Object.freeze({ level: 0, remainingSeconds: 0 });

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Normalize an omen pair: level floors/clamps to 0..5, remaining clamps to
 * [0, BAD_OMEN_DURATION_SECONDS]; if either side is 0 the result is `{0, 0}`
 * (level > 0 ⇔ remaining > 0).
 */
export function normalizeBadOmen(level: unknown, remaining: unknown): PersistedBadOmen {
  const lv = isFiniteNumber(level) ? clampBadOmenLevel(level) : 0;
  const rem = isFiniteNumber(remaining) ? Math.min(Math.max(remaining, 0), BAD_OMEN_DURATION_SECONDS) : 0;
  if (lv <= 0 || rem <= 0) return NO_OMEN;
  return { level: lv, remainingSeconds: rem };
}

/** Omen state after a valid grant: level ≥ 1 gets the full vanilla duration. */
export function refreshBadOmenDuration(level: number): PersistedBadOmen {
  return normalizeBadOmen(level, BAD_OMEN_DURATION_SECONDS);
}

/**
 * Advance the omen by `dt` seconds of unpaused play. Non-finite/negative `dt`
 * is an identity no-op; reaching 0 clears the level.
 */
export function tickBadOmen(state: PersistedBadOmen, dt: number): PersistedBadOmen {
  if (!isFiniteNumber(dt) || dt <= 0) return state;
  if (state.level <= 0) return NO_OMEN;
  return normalizeBadOmen(state.level, state.remainingSeconds - dt);
}

function isEntryShape(v: unknown): v is StatusEffectInstanceData {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.typeId === 'string' && isFiniteNumber(e.duration) && isFiniteNumber(e.amplifier);
}

/**
 * Build the persisted payload. Entries with non-finite/non-positive duration,
 * non-finite/negative amplifier or a non-string type are omitted; at most
 * MAX_PERSISTED_EFFECTS entries are written; the omen is normalized.
 */
export function serializePlayerEffects(
  effects: readonly StatusEffectInstanceData[],
  badOmen: PersistedBadOmen,
): PersistedPlayerEffects {
  const out: StatusEffectInstanceData[] = [];
  for (const e of effects) {
    if (out.length >= MAX_PERSISTED_EFFECTS) break;
    if (!isEntryShape(e) || e.duration <= 0 || e.amplifier < 0) continue;
    out.push({ typeId: e.typeId, duration: e.duration, amplifier: e.amplifier });
  }
  return {
    version: PLAYER_EFFECTS_PAYLOAD_VERSION,
    effects: out,
    badOmen: normalizeBadOmen(badOmen.level, badOmen.remainingSeconds),
  };
}

/**
 * Parse an untrusted stored payload against `registry`. Never throws. See the
 * module doc for the absent/invalid/per-entry rules.
 */
export function parsePlayerEffects(input: unknown, registry: StatusEffectTypeRegistry): PlayerEffectsRestore {
  if (input === undefined || input === null) {
    return { status: 'absent', effects: [], badOmen: NO_OMEN, dropped: 0 };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'invalid', effects: [], badOmen: NO_OMEN, dropped: 0 };
  }
  const p = input as Record<string, unknown>;
  if (p.version !== PLAYER_EFFECTS_PAYLOAD_VERSION || !Array.isArray(p.effects)) {
    return { status: 'invalid', effects: [], badOmen: NO_OMEN, dropped: 0 };
  }

  const effects: StatusEffectInstanceData[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of p.effects as unknown[]) {
    if (effects.length >= MAX_PERSISTED_EFFECTS) {
      dropped++;
      continue;
    }
    if (!isEntryShape(raw) || raw.duration <= 0 || raw.amplifier < 0) {
      dropped++;
      continue;
    }
    const id = tryParseResourceId(raw.typeId);
    const def = id ? registry.getOptional(id) : undefined;
    if (!id || !def || def.flags.includes('INSTANT')) {
      dropped++;
      continue;
    }
    const key = `${id.namespace}:${id.path}`;
    if (seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    const maxDuration = def.maxDuration ?? Number.POSITIVE_INFINITY;
    const maxAmplifier = def.maxAmplifier ?? 0;
    effects.push({
      typeId: key,
      duration: Math.min(raw.duration, maxDuration),
      amplifier: Math.min(Math.floor(raw.amplifier), maxAmplifier),
    });
  }

  let badOmen = NO_OMEN;
  if (typeof p.badOmen === 'object' && p.badOmen !== null) {
    const o = p.badOmen as Record<string, unknown>;
    badOmen = normalizeBadOmen(o.level, o.remainingSeconds);
  }
  return { status: 'ok', effects, badOmen, dropped };
}
