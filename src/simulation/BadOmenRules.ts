/**
 * Pure Bad Omen acquisition helpers (285): total clamp/grant/clear and a
 * fail-closed village-omen raid trigger decision. No Game, DOM, entity, or
 * persistence imports — consumers own ephemeral state and invoke the 282
 * raid-start seam only after START_RAID.
 */

export const BAD_OMEN_MAX_LEVEL = 5;

export interface BadOmenState {
  readonly level: number; // integer 0..BAD_OMEN_MAX_LEVEL
}

export interface VillageContext {
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly containsPlayer: boolean;
}

export type OmenTriggerSkipReason =
  | 'NO_OMEN'
  | 'NO_VILLAGE'
  | 'NOT_INSIDE'
  | 'INVALID_CENTER';

export type OmenTriggerDecision =
  | {
      readonly kind: 'START_RAID';
      readonly centerX: number;
      readonly centerY: number;
      readonly centerZ: number;
      readonly badOmenLevel: number;
    }
  | { readonly kind: 'NONE'; readonly reason: OmenTriggerSkipReason };

/** Map any numeric input to an integer in [0, BAD_OMEN_MAX_LEVEL]; never throws. */
export function clampBadOmenLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  if (level <= 0) return 0;
  if (level >= BAD_OMEN_MAX_LEVEL) return BAD_OMEN_MAX_LEVEL;
  return Math.floor(level);
}

/** Fresh omen state; omitted/invalid level becomes 0. */
export function createBadOmen(level = 0): BadOmenState {
  return { level: clampBadOmenLevel(level) };
}

/**
 * Stack `amount` (default 1) toward the cap. Non-positive or already-capped
 * grants leave the prior state unchanged (same reference allowed).
 */
export function grantBadOmen(state: BadOmenState, amount = 1): BadOmenState {
  const add = clampBadOmenLevel(amount);
  if (add <= 0) return state;
  if (clampBadOmenLevel(state.level) >= BAD_OMEN_MAX_LEVEL) return state;
  return { level: clampBadOmenLevel(state.level + add) };
}

/** Always returns level 0; identity when already 0 is allowed. */
export function clearBadOmen(_state: BadOmenState): BadOmenState {
  return { level: 0 };
}

/**
 * Fail-closed village-omen decision. Reason precedence: NO_OMEN → NO_VILLAGE →
 * NOT_INSIDE → INVALID_CENTER; otherwise START_RAID with clamped level + finite
 * center. Never throws.
 */
export function resolveVillageRaidTrigger(
  state: BadOmenState,
  village: VillageContext | null | undefined,
): OmenTriggerDecision {
  const level = clampBadOmenLevel(state?.level ?? 0);
  if (level < 1) {
    return { kind: 'NONE', reason: 'NO_OMEN' };
  }
  if (village == null) {
    return { kind: 'NONE', reason: 'NO_VILLAGE' };
  }
  if (village.containsPlayer !== true) {
    return { kind: 'NONE', reason: 'NOT_INSIDE' };
  }
  const { centerX, centerY, centerZ } = village;
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(centerZ)
  ) {
    return { kind: 'NONE', reason: 'INVALID_CENTER' };
  }
  return {
    kind: 'START_RAID',
    centerX,
    centerY,
    centerZ,
    badOmenLevel: level,
  };
}
